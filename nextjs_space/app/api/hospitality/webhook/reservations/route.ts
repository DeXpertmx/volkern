export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getConnectivityBasicAuth,
  updateConnectivityStatus,
} from '@/lib/hospitality/connectivity';
// La lectura de la cabecera Basic y su comparación viven en un módulo compartido
// con el webhook de mensajes: mismo par, mismo diagnóstico del 401.
import {
  credencialesCoinciden,
  huellaCredencial,
  readBasicAuth,
} from '@/lib/hospitality/webhook-basic-auth';
import {
  processReservationWebhook,
  type WebhookReservationPayload,
} from '@/lib/hospitality/reservations';

/**
 * Webhook de reservas de la capa de conectividad.
 *
 * El proveedor llama a este endpoint con `book` / `modify` / `cancel` /
 * `no_show` (campo `action`), usando HTTP Basic Auth con el par de
 * /admin/conectividad (usuario y contraseña). El ID de socio NO entra en la
 * autenticación: es de cada hotel y solo se usa en las llamadas SALIENTES.
 *
 * Contrato: docs/hospitality-connectivity-contract.md
 * - Idempotente por bookingId.
 * - modify = estado completo nuevo.
 * - Huésped opcional: no se rechaza la reserva si faltan datos.
 * - Un 401 lleva `diagnostico` (motivo + huellas de lo recibido, jamás el
 *   valor): sin él, «No autorizado» no distingue entre cabecera ausente,
 *   otro esquema, base64 roto o par distinto — y esa diferencia decide si el
 *   arreglo es del emisor o nuestro.
 */

/**
 * 401 del contrato con diagnóstico adjunto. `diagnostico.huella` es el SHA-256
 * truncado de `usuario:contraseña` **tal como llegaron**: el emisor hashea su
 * par y sabe al instante si su configuración es otra o si algo la alteró por el
 * camino. Nada del par guardado viaja en la respuesta.
 */
function rechazoNoAutorizado(diagnostico: Record<string, unknown>) {
  console.warn(`[Hospitality] Webhook de reservas rechazado (401): ${JSON.stringify(diagnostico)}`);
  return NextResponse.json(
    { success: false, error: 'No autorizado', diagnostico },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticación: Basic Auth contra el par de la plataforma.
    //    Solo el par Basic: en una llamada ENTRANTE el ID de socio no participa
    //    (el hotel se resuelve por el mapeo), así que exigirlo aquí dejaría
    //    fuera todas las reservas de todos los hoteles en cuanto el ID de socio
    //    fuera de cada hotel —que es donde corresponde—.
    const creds = await getConnectivityBasicAuth();
    if (!creds) {
      await updateConnectivityStatus({ estado: 'error', error: true });
      // La política de reintentos viaja en el propio HTTP (contrato: reintento
      // con backoff). 60 s = el primer escalón del backoff.
      return NextResponse.json(
        { success: false, error: 'Conectividad no configurada' },
        { status: 503, headers: { 'Retry-After': '60' } }
      );
    }

    const auth = readBasicAuth(request);
    if (!auth.ok) {
      const diagnostico = { motivo: auth.motivo, esquema: auth.esquema };
      // El diagnóstico no solo sale en la respuesta y en el log: se persiste
      // (configuracion.ultimoRechazoWebhook) para que /admin/conectividad lo
      // muestre sin depender de los logs del servicio.
      await updateConnectivityStatus({
        estado: 'error',
        error: true,
        registroRechazo: diagnostico,
      });
      return rechazoNoAutorizado(diagnostico);
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
      await updateConnectivityStatus({
        estado: 'error',
        error: true,
        registroRechazo: diagnostico,
      });
      return rechazoNoAutorizado(diagnostico);
    }

    // 2. Parsear y validar el payload mínimo.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'JSON inválido' },
        { status: 400 }
      );
    }

    const payload = body as WebhookReservationPayload;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Payload inválido' },
        { status: 400 }
      );
    }

    // 3. Procesar (idempotente, registra evento bruto).
    const result = await processReservationWebhook(payload);

    if (!result.ok) {
      await updateConnectivityStatus({ estado: 'error', error: true });
      const status = result.status === 'no_encontrada' ? 404 : 400;
      // 404 = reintento con backoff limitado (la reserva puede estar aún en
      // camino): la cabecera fija el mínimo de espera (5 min). 400 = defecto
      // del payload, sin reintento ni cabecera.
      return NextResponse.json(
        { success: false, error: result.error || 'Error procesando evento' },
        {
          status,
          ...(status === 404 ? { headers: { 'Retry-After': '300' } } : {}),
        }
      );
    }

    // 4. Actualizar estado de conectividad (éxito).
    await updateConnectivityStatus({
      estado: 'conectado',
      ultimoEvento: new Date(),
      resetErrores: true,
    });

    return NextResponse.json({
      success: true,
      status: result.status,
      reservationId: result.reservationId,
      // Vía entrante del no-show: cómo quedó el cargo (emitida/importe/motivo).
      penalizacion: result.penalizacion ?? null,
    });
  } catch (error) {
    console.error('[Hospitality] Error en webhook de reservas:', error);
    await updateConnectivityStatus({ estado: 'error', error: true }).catch(() => {});
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
  return NextResponse.json({ endpoint: 'webhook-reservas', conectividad: state.estado });
}