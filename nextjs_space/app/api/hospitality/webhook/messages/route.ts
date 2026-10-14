export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getConnectivityBasicAuth, updateConnectivityStatus } from '@/lib/hospitality/connectivity';
// Misma lectura de la cabecera Basic que el webhook de reservas: un solo
// diagnóstico del 401 para los dos webhooks entrantes (mismo par de credenciales).
import { credencialesCoinciden, huellaCredencial, readBasicAuth } from '@/lib/hospitality/webhook-basic-auth';
import {
  registrarIncidenciaMensajeSinMapping,
  registrarMensajeEntrante,
} from '@/lib/hospitality/mensajes-service';

/**
 * Webhook de MENSAJES del canal (proveedor → PMS).
 *
 * El proveedor llama aquí cada vez que llega un mensaje de huésped (o del hotel)
 * en una conversación de una OTA. Autenticación: HTTP Basic con el mismo par que
 * el webhook de reservas (el de /admin/conectividad). El ID de socio NO entra:
 * la propiedad se resuelve por el `hotel_id` del payload a través del mapping.
 *
 * Respuestas y qué debe hacer el emisor con cada una:
 *  - 200 `{success:true, estado}` — registrado (`recibido`) o ya lo teníamos
 *    (`duplicado`). El proveedor puede entregar el mismo `message_id` más de una
 *    vez: las dos responden 200 y no se duplica nada.
 *  - 400 — el payload no se puede representar (falta el hilo o el mensaje, o el
 *    texto pasa del límite). No se reintenta: es un defecto de datos.
 *  - 401 — no autorizado, con `diagnostico` (motivo y huellas de lo recibido,
 *    nunca el valor).
 *  - 404 — el `hotel_id` no tiene mapping activo: no sabemos de qué propiedad es
 *    el mensaje. Lleva `Retry-After` (el mapping puede estar en camino).
 *  - 503 — conectividad no configurada todavía.
 *
 * A propósito NO se guarda el payload crudo: lleva datos personales del huésped
 * (nombre, teléfono, email) y el mensaje ya queda normalizado en el hilo. Un
 * rechazo queda en el log del servicio con su motivo.
 */
export async function POST(request: NextRequest) {
  try {
    const creds = await getConnectivityBasicAuth();
    if (!creds) {
      await updateConnectivityStatus({ estado: 'error', error: true });
      return NextResponse.json(
        { success: false, error: 'Conectividad no configurada' },
        { status: 503, headers: { 'Retry-After': '60' } }
      );
    }

    const auth = readBasicAuth(request);
    if (!auth.ok) {
      // El rechazo se registra en el log, no en el estado de conectividad: ese
      // diagnóstico es el del webhook de reservas y pisarlo aquí confundiría al
      // operador (los dos comparten el par, así que el arreglo es el mismo).
      console.warn(`[Hospitality] Webhook de mensajes rechazado (401): ${JSON.stringify({ motivo: auth.motivo, esquema: auth.esquema })}`);
      return NextResponse.json(
        { success: false, error: 'No autorizado', diagnostico: { motivo: auth.motivo, esquema: auth.esquema } },
        { status: 401 }
      );
    }
    if (
      !credencialesCoinciden(auth.username, creds.username) ||
      !credencialesCoinciden(auth.password, creds.password)
    ) {
      const diagnostico = {
        motivo: 'credenciales_no_coinciden' as const,
        esquema: 'basic',
        usuarioLen: auth.username.length,
        passwordLen: auth.password.length,
        usuarioHuella: huellaCredencial(auth.username),
        huella: huellaCredencial(auth.username, auth.password),
      };
      console.warn(`[Hospitality] Webhook de mensajes rechazado (401): ${JSON.stringify(diagnostico)}`);
      return NextResponse.json({ success: false, error: 'No autorizado', diagnostico }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
    }

    const resultado = await registrarMensajeEntrante(body);

    if (!resultado.ok) {
      if (resultado.status === 'sin_mapping') {
        // El mensaje no se puede entregar, pero la INCIDENCIA sí queda anotada:
        // así el código sale en el panel de Conectividad con sus reintentos en
        // vez de quedarse solo en el log del contenedor. No lleva el mensaje del
        // huésped (datos personales): solo el `hotel_id`, el canal y el motivo.
        const incidenciaId =
          resultado.hotelCode
            ? await registrarIncidenciaMensajeSinMapping({
                hotelCode: resultado.hotelCode,
                canal: resultado.canal ?? '',
                error: resultado.error,
              })
            : null;
        console.warn(
          `[Hospitality] Mensaje de canal sin mapping: ${resultado.error} (incidencia ${incidenciaId ?? 'no anotada'})`
        );
        return NextResponse.json(
          { success: false, error: resultado.error, incidenciaId },
          { status: 404, headers: { 'Retry-After': '300' } }
        );
      }
      return NextResponse.json({ success: false, error: resultado.error }, { status: 400 });
    }

    await updateConnectivityStatus({ estado: 'conectado', ultimoEvento: new Date(), resetErrores: true });

    return NextResponse.json({
      success: true,
      estado: resultado.estado,
      conversacionId: resultado.conversacionId,
      mensajeId: resultado.mensajeId,
    });
  } catch (error) {
    console.error('[Hospitality] Error en webhook de mensajes:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno' },
      { status: 500, headers: { 'Retry-After': '60' } }
    );
  }
}

// GET informativo: estado de la conectividad (sin secretos) para diagnóstico.
export async function GET() {
  const { getConnectivityPublic } = await import('@/lib/hospitality/connectivity');
  const state = await getConnectivityPublic();
  return NextResponse.json({ endpoint: 'webhook-mensajes', conectividad: state.estado });
}
