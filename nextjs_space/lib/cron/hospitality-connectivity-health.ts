/**
 * lib/cron/hospitality-connectivity-health.ts
 *
 * Health-check diario de la capa de conectividad (plan maestro §15).
 *
 * El estado del panel de conectividad solo cambia cuando fluye tráfico: si el
 * proveedor revoca las credenciales un martes sin reservas ni pushes, el badge
 * sigue «Conectado» hasta el siguiente evento. Este job llama a la MISMA sonda
 * que el botón «Probar» (`testConnectivityConnection` → `property_details` con
 * el hotel de la sonda, ver `resolveProbeHotelCode`), mueve el estado de la
 * capa con las mismas reglas y deja
 * una marca de última verificación visible — así el verde se renueva a
 * propósito, sin esperar tráfico real.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GARANTÍAS
 * ────────────────────────────────────────────────────────────────────────────
 *   • Sin configuración, no-op silencioso: un job de salud no puede ser el que
 *     rompa (ni llamar a un servicio sin credenciales). Y cuando el ID de socio
 *     es de cada hotel, tampoco marca error: la sonda de plataforma no aplica
 *     (ver No-op razonado #2).
 *   • Reutiliza la sonda y las reglas de estado del panel: nunca decide él su
 *     propia verdad — un 401 es «Credenciales rechazadas» en el badge igual
 *     que aquí.
 *   • La marca se persiste en la capa (`ultimaVerificacion`) y se audita en
 *     HospitalitySyncLog (tipo `health_check`), excluido del diagnóstico de
 *     causas para no contaminar «Credenciales rechazadas» con el propio sondeo.
 *   • Un fallo del propio job (BD, excepción) sale como error del job, nunca
 *     como «conectividad caída».
 *
 * Se invoca desde el scheduler (job diario) y desde
 * `GET /api/cron/hospitality-connectivity-health` (disparo a demanda con
 * CRON_SECRET en producción, mismo patrón que hospitality-reconcile).
 */

import { prisma } from '@/lib/db';
import {
  getConnectivityProvider,
  partnerIdEsDeCadaHotel,
  testConnectivityConnection,
  updateConnectivityStatus,
  resolverHotelDeSonda,
} from '@/lib/hospitality/connectivity';

/** Identificador del job en el panel de estado de crons. */
export const JOB_ID_HEALTH_CHECK = 'hospitality-connectivity-health';
/** Etiqueta legible en el panel. */
export const JOB_LABEL_HEALTH_CHECK = 'Hospitality Conectividad Health Check';
/** Cadencia del job (diaria 05:00, antes de la actividad del día). */
export const JOB_SCHEDULE_HEALTH_CHECK = '0 5 * * *';

/** Resultado del health-check para el panel de crons y el disparo HTTP. */
export interface ConnectivityHealthResult {
  /** ¿La capa responde bien a la sonda? (null = no se pudo sondear) */
  ok: boolean | null;
  /** true = se ejecutó la sonda; false = no-op razonado. */
  ejecutado: boolean;
  /** Por qué no se ejecutó (solo cuando ejecutado = false). */
  motivo: string | null;
  /** Hotel con el que se sondeó. */
  hotelCode: string | null;
  /** Estado de la capa tras el sondeo, si se movió. */
  estado: string | null;
  /** Detalle del fallo de la capa, si lo hubo. */
  detalle: string | null;
  /** Duración en ms. */
  durationMs: number;
}

export async function runConnectivityHealthCheck(): Promise<ConnectivityHealthResult> {
  const startedAt = Date.now();

  const provider = await getConnectivityProvider();

  // No-op razonado #1: sin fila configurada no hay nada que verificar. Un job
  // de salud no puede ser el que rompa, y `testConnectivityConnection` ya
  // devuelve su propio error amable si faltan credenciales — no es un fallo
  // del sistema, es una capa aún sin configurar.
  if (!provider || provider.estado === 'sin_configurar') {
    return {
      ok: null,
      ejecutado: false,
      motivo: 'Conectividad sin configurar: nada que verificar todavía.',
      hotelCode: null,
      estado: provider?.estado ?? null,
      detalle: null,
      durationMs: Date.now() - startedAt,
    };
  }

  // No-op razonado #2: hay par Basic, pero el ID de socio es de cada hotel (la
  // plataforma no tiene uno propio). La sonda es `property_details` de UN hotel
  // con UN ID de socio: sin id de plataforma no hay a qué hotel sondear sin
  // tomar prestado el de un cliente —y usar el secreto de un hotel para una
  // verificación de plataforma no es aceptable—. El estado NO se toca: este job
  // no puede pintar en rojo una capa que funciona porque su sonda no aplique; el
  // que sabe si ve sus propiedades es cada hotel, desde su Conectividad.
  if (partnerIdEsDeCadaHotel(provider)) {
    return {
      ok: null,
      ejecutado: false,
      motivo:
        'El ID de socio es de cada hotel: la sonda de plataforma no aplica. Cada hotel comprueba el suyo desde Conectividad.',
      hotelCode: null,
      estado: provider.estado,
      detalle: null,
      durationMs: Date.now() - startedAt,
    };
  }

  // La sonda es la del botón «Probar»: property_details con el hotel de la
  // sonda —lo configurado (entorno/config) y, si no hay nada, un hotel REAL ya
  // vinculado, no el sandbox del contrato, que un partner de producción no tiene
  // concedido y responde 403 «Access Denied»—. El health-check no inventa su
  // propia verdad sobre la capa.
  const hotelCode = await resolverHotelDeSonda(provider);
  const sondeo = await testConnectivityConnection(hotelCode);

  // Mover el estado de la capa con las MISMAS reglas que el botón «Probar»:
  // la sonda es la misma, así que las consecuencias también deben serlo.
  if (sondeo.ok) {
    await updateConnectivityStatus({
      estado: 'conectado',
      resetErrores: true,
      ultimaVerificacion: new Date(),
    });
  } else {
    await updateConnectivityStatus({
      estado: 'error',
      error: true,
      ultimaVerificacion: new Date(),
    });
  }

  // Auditoría del sondeo en AuditLog: el health-check es una acción de
  // plataforma sobre una fila global (ConnectivityProvider no tiene tenant), y
  // HospitalitySyncLog exige tenantId — no es su casa. Queda traza cronológica
  // de cada verificación, incluso de las que fallan. NO usa HospitalitySyncLog
  // a propósito: ese log describe tráfico de la capa y el diagnóstico del badge
  // filtra por sus tipos — un fallo del propio sondeo no puede aparecer como
  // «Credenciales rechazadas» ni como «Sin respuesta del servicio».
  const detalle = sondeo.ok ? null : (sondeo.error ?? 'Error desconocido en la sonda');
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: null,
        userId: null,
        accion: 'conectividad_health_check',
        entidad: 'connectivity_provider',
        entidadId: provider.id,
        descripcion: sondeo.ok
          ? `Health-check de conectividad OK (hotelCode ${hotelCode}).`
          : `Health-check de conectividad fallido: ${detalle}`,
        metadata: {
          hotelCode,
          ok: sondeo.ok,
          estado: sondeo.ok ? 'conectado' : 'error',
          detalle,
          duracionMs: Date.now() - startedAt,
        },
      },
    });
  } catch {
    // La auditoría no puede tumbar el health-check: si falla, el resultado
    // ya está persistido en la capa y el job lo reporta igual.
  }

  const result: ConnectivityHealthResult = {
    ok: sondeo.ok,
    ejecutado: true,
    motivo: null,
    hotelCode,
    estado: sondeo.ok ? 'conectado' : 'error',
    detalle,
    durationMs: Date.now() - startedAt,
  };

  console.log(
    `[Cron/ConnectivityHealth] DONE ok=${result.ok} estado=${result.estado} ` +
      `detalle=${detalle ?? '-'} durationMs=${result.durationMs}`,
  );

  return result;
}

/** Mensaje para el panel de estado de crons. */
export function mensajeDelHealthCheck(r: ConnectivityHealthResult): string {
  if (!r.ejecutado) return r.motivo ?? 'No ejecutado.';
  if (r.ok) {
    return `Conectividad verificada: la capa responde (${r.durationMs} ms).`;
  }
  return `Conectividad con problemas: ${r.detalle ?? 'sin detalle'}.`;
}

/** Avisos para el panel de estado: cosas que no son un error del job. */
export function avisosDelHealthCheck(r: ConnectivityHealthResult): string[] {
  if (r.ejecutado && !r.ok) {
    return [
      'La capa de conectividad no respondió bien al health-check diario: revisa el diagnóstico del panel de Conectividad.',
    ];
  }
  return [];
}
