export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getConnectivityCredentials,
  updateConnectivityStatus,
} from '@/lib/hospitality/connectivity';
import {
  processReservationWebhook,
  type WebhookReservationPayload,
} from '@/lib/hospitality/reservations';

/**
 * Webhook de reservas de la capa de conectividad.
 *
 * El proveedor llama a este endpoint con `book` / `modify` / `cancel` /
 * `no_show` (campo `action`), usando HTTP Basic Auth con las credenciales
 * cargadas en /admin/conectividad.
 *
 * Contrato: docs/hospitality-connectivity-contract.md
 * - Idempotente por bookingId.
 * - modify = estado completo nuevo.
 * - Huésped opcional: no se rechaza la reserva si faltan datos.
 */

function readBasicAuth(request: NextRequest): { username: string; password: string } | null {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return {
      username: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticación: Basic Auth contra las credenciales guardadas.
    const creds = await getConnectivityCredentials();
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
    const authOk =
      auth &&
      safeCompare(auth.username, creds.username) &&
      safeCompare(auth.password, creds.password);
    if (!authOk) {
      await updateConnectivityStatus({ estado: 'error', error: true });
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
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