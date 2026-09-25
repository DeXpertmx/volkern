export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';
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
 * - Un 401 lleva `diagnostico` (motivo + huellas de lo recibido, jamás el
 *   valor): sin él, «No autorizado» no distingue entre cabecera ausente,
 *   otro esquema, base64 roto o par distinto — y esa diferencia decide si el
 *   arreglo es del emisor o nuestro.
 */

/**
 * Por qué un intento no llegó a compararse. Viaja en el 401
 * (`diagnostico.motivo`) y en el log del servidor.
 */
type MotivoRechazo =
  | 'sin_cabecera'
  | 'esquema_no_basic'
  | 'cabecera_malformada'
  | 'encoding_no_utf8'
  | 'sin_separador'
  | 'credenciales_no_coinciden';

type AuthAttempt =
  | { ok: true; username: string; password: string }
  | { ok: false; motivo: MotivoRechazo; esquema: string | null };

/**
 * Huella no reversible (SHA-256 truncado) para comparar credenciales **sin
 * transportarlas**: quien las emite hashea las suyas y las coteja con la que
 * devolvemos en el 401. Nunca sale de aquí ni el valor recibido ni el guardado
 * (misma disciplina que `lib/hospitality/conectividad-secreto.ts`).
 */
function huella(...partes: string[]): string {
  return createHash('sha256').update(partes.join(':')).digest('hex').slice(0, 12);
}

function readBasicAuth(request: NextRequest): AuthAttempt {
  const header = request.headers.get('authorization');
  if (!header) return { ok: false, motivo: 'sin_cabecera', esquema: null };
  // RFC 7235: el nombre del esquema es insensible a mayúsculas y admite más de
  // un espacio detrás. Exigir `Basic ` literal convertía un `basic` válido en
  // el mismo 401 que unas credenciales equivocadas.
  const partes = /^\s*([^\s]+)\s*(.*)$/.exec(header);
  if (!partes) return { ok: false, motivo: 'cabecera_malformada', esquema: null };
  const esquema = partes[1].toLowerCase();
  if (esquema !== 'basic') return { ok: false, motivo: 'esquema_no_basic', esquema };
  // Los emisores descuidados parten el base64 en varias líneas: se unen.
  const payload = partes[2].replace(/\s+/g, '');
  if (!payload) return { ok: false, motivo: 'cabecera_malformada', esquema };
  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  // U+FFFD = la credencial traía bytes que no son UTF-8 (p. ej. latin-1).
  if (decoded.includes('\uFFFD')) return { ok: false, motivo: 'encoding_no_utf8', esquema };
  const idx = decoded.indexOf(':');
  if (idx < 0) return { ok: false, motivo: 'sin_separador', esquema };
  return {
    ok: true,
    username: decoded.slice(0, idx),
    password: decoded.slice(idx + 1),
  };
}

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
      !safeCompare(auth.username, creds.username) ||
      !safeCompare(auth.password, creds.password)
    ) {
      const diagnostico = {
        motivo: 'credenciales_no_coinciden' as const,
        esquema: 'basic',
        usuarioLen: auth.username.length,
        passwordLen: auth.password.length,
        usuarioHuella: huella(auth.username),
        huella: huella(auth.username, auth.password),
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