/**
 * lib/cron/hospitality-puesta-en-marcha-avisos.ts
 *
 * Avisa al operador —por email, fuera de la aplicación— cuando una cuenta de
 * Hospitality lleva días con la puesta en marcha a medias.
 *
 * El problema que resuelve: el listado de `/admin/hospitality` ya dice quién
 * está a medias, pero hay que abrirlo. Un alta que se queda parada no avisa a
 * nadie por sí sola: el cliente espera a que alguien le pase la puerta y el
 * operador espera a que el cliente avance. Este job rompe ese silencio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GARANTÍAS
 * ────────────────────────────────────────────────────────────────────────────
 *   • **Ancla honesta**: los días se cuentan desde la última señal de
 *     Hospitality (alta, roles del catálogo o propiedades), no desde el alta del
 *     cliente. Si la vertical se encendió ayer en una cuenta de hace un año, el
 *     reloj empieza ayer y no hay spam.
 *   • **Un aviso, no una avalancha**: un solo correo con todas las cuentas, y
 *     cada cuenta tiene su propio intervalo — no se repite el mismo cliente
 *     antes de `INTERVALO_AVISO_MS`, aunque el job corra todos los días.
 *   • **Sin nada que decir, no dice nada**: sin cuentas paradas no se envía ni
 *     se escribe una sola marca.
 *   • **La marca es el aviso**: cada cuenta avisada deja una fila en
 *     `HospitalitySyncLog` (tipo `aviso_puesta_en_marcha`), que es a la vez la
 *     auditoría del envío y el reloj del intervalo.
 *   • **Un cliente que falla no silencia a los demás.**
 *
 * Dos clases de cuenta entran en el aviso, porque las dos necesitan a una
 * persona y ninguna se ve sin abrir el panel:
 *
 *   1. **Parada** — no está lista y su última señal tiene `DIAS_ESPERA` días o
 *      más (roles del catálogo sin preparar o sin ninguna propiedad).
 *   2. **Módulo apagado con datos dentro** — el operador cortó Hospitality y
 *      hay propiedades y roles a los que el cliente no llega. No espera a los
 *      días: es una avería, no un onboarding lento.
 *
 * Se invoca desde el scheduler (job diario) y desde
 * `GET /api/cron/hospitality-puesta-en-marcha-avisos` (disparo a demanda con
 * `CRON_SECRET`).
 */

import { prisma } from '@/lib/db';
import {
  PuestaEnMarchaFila,
  listarPuestasEnMarchaHospitality,
} from '@/lib/provisioning/hospitality-alta';
import { avisarOperador, type ResultadoAvisoOperador } from '@/lib/notifications/aviso-operador';

export const JOB_ID_PUESTA_EN_MARCHA_AVISOS = 'hospitality-puesta-en-marcha-avisos';

/** Etiqueta y cadencia del job, para el panel de estado. */
export const JOB_LABEL_PUESTA_EN_MARCHA_AVISOS = 'Hospitality Puestas en Marcha Paradas';
export const JOB_SCHEDULE_PUESTA_EN_MARCHA_AVISOS = '20 9 * * *';

/** Tipo con el que se marca cada aviso en `HospitalitySyncLog`. */
export const TIPO_AVISO_PUESTA_EN_MARCHA = 'aviso_puesta_en_marcha';

/** Días que una cuenta puede estar parada antes de que alguien deba enterarse. */
export const DIAS_ESPERA_POR_DEFECTO = 3;

/** Intervalo mínimo entre avisos del MISMO cliente. */
export const INTERVALO_AVISO_MS = 3 * 24 * 60 * 60 * 1000;

const DIA_MS = 24 * 60 * 60 * 1000;
/** Cuentas que se detallan en el correo (el resto se cuenta). */
const MAX_DETALLE = 20;

export type MotivoAviso =
  | 'parada'
  | 'modulo_apagado'
  | 'aviso_reciente'
  | 'aun_es_pronto'
  | 'listo';

export interface DecisionAviso {
  avisar: boolean;
  motivo: MotivoAviso;
}

/** Días completos desde la última señal de Hospitality. */
export function diasSinAvanzar(senal: string | Date, ahora: Date): number {
  const desde = senal instanceof Date ? senal : new Date(senal);
  if (Number.isNaN(desde.getTime())) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / DIA_MS));
}

/**
 * ¿Toca avisar por esta cuenta? **Puro**: la decisión se prueba sin base de
 * datos ni fechas de verdad.
 *
 * El orden importa: primero lo que descarta (ya está lista), después el
 * intervalo —que evita repetirse— y solo entonces el motivo real.
 */
export function decidirAviso(input: {
  listo: boolean;
  moduloApagado: boolean;
  diasParada: number;
  ultimoAviso: Date | null;
  ahora: Date;
  diasEspera?: number;
  intervaloMs?: number;
}): DecisionAviso {
  if (input.listo) return { avisar: false, motivo: 'listo' };

  const intervalo = input.intervaloMs ?? INTERVALO_AVISO_MS;
  if (
    input.ultimoAviso &&
    input.ahora.getTime() - input.ultimoAviso.getTime() < intervalo
  ) {
    return { avisar: false, motivo: 'aviso_reciente' };
  }

  // La avería no espera a los días: el cliente no ve lo que ya tiene.
  if (input.moduloApagado) return { avisar: true, motivo: 'modulo_apagado' };

  const diasEspera = input.diasEspera ?? DIAS_ESPERA_POR_DEFECTO;
  if (input.diasParada < diasEspera) return { avisar: false, motivo: 'aun_es_pronto' };

  return { avisar: true, motivo: 'parada' };
}

/** Una cuenta que entra en el aviso, con lo que hay que contarle al operador. */
export interface CuentaAvisada {
  fila: PuestaEnMarchaFila;
  motivo: 'parada' | 'modulo_apagado';
  diasParada: number;
}

function lineaCuenta(cuenta: CuentaAvisada): string {
  const { fila } = cuenta;
  const queFalta = fila.faltantes.length ? fila.faltantes.join(' · ') : 'sin detalle';
  const estado = `${fila.roles.alDia}/${fila.roles.catalogo} roles · ${fila.propiedades.total} propiedad(es) · ${fila.propiedades.unidades} unidad(es)`;

  if (cuenta.motivo === 'modulo_apagado') {
    return `• ${fila.tenant}: el módulo está APAGADO y la cuenta tiene ${estado}`;
  }
  return `• ${fila.tenant}: ${cuenta.diasParada} día(s) sin avanzar — ${estado}\n    Falta: ${queFalta}`;
}

/** Cuerpo del aviso: qué cuentas esperan a una persona y por qué. */
export function construirAviso(
  paradas: CuentaAvisada[],
  apagadas: CuentaAvisada[]
): { title: string; body: string } {
  const total = paradas.length + apagadas.length;
  const title = `Hospitality: ${total} cuenta(s) esperan al operador`;

  const bloques: string[] = [];
  if (paradas.length) {
    bloques.push(
      `PARADAS (${paradas.length}) — llevan días sin avanzar:\n` +
        paradas.slice(0, MAX_DETALLE).map((c) => lineaCuenta(c)).join('\n') +
        (paradas.length > MAX_DETALLE ? `\n… y ${paradas.length - MAX_DETALLE} más.` : '')
    );
  }
  if (apagadas.length) {
    bloques.push(
      `MÓDULO APAGADO CON DATOS DENTRO (${apagadas.length}) — el cliente no ve lo suyo:\n` +
        apagadas.slice(0, MAX_DETALLE).map((c) => lineaCuenta(c)).join('\n') +
        (apagadas.length > MAX_DETALLE ? `\n… y ${apagadas.length - MAX_DETALLE} más.` : '')
    );
  }

  const panel = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://volkern.app'}/admin/hospitality`;
  bloques.push(`Puestas en marcha: ${panel}`);

  return { title, body: bloques.join('\n\n') };
}

export interface HospitalityPuestaEnMarchaAvisosResult {
  success: boolean;
  message: string;
  /** Clientes de Hospitality en la cuenta. */
  tenantsHospitality: number;
  /** Cuentas paradas (no listas), avisadas o no. */
  paradas: number;
  /** Cuentas que entraron en el aviso. */
  avisados: number;
  /** Cuentas paradas que aún no cumplen los días. */
  aunEspronto: number;
  /** Cuentas silenciadas por el intervalo entre avisos. */
  enEspera: number;
  /** Frases para el panel de estado (se pintan en ámbar, no en rojo). */
  avisos: string[];
  errores: string[];
  durationMs: number;
  /** Solo si el propio listado falló: no hubo aviso ni marcas. */
  error?: string;
  /** Qué hizo cada canal del aviso (console / Apprise / Resend). */
  canales?: ResultadoAvisoOperador;
}

async function ultimoAvisoDe(tenantId: string): Promise<Date | null> {
  const fila = await prisma.hospitalitySyncLog.findFirst({
    where: { tenantId, tipo: TIPO_AVISO_PUESTA_EN_MARCHA },
    orderBy: { fechaCreacion: 'desc' },
    select: { fechaCreacion: true },
  });
  return fila?.fechaCreacion ?? null;
}

export async function runHospitalityPuestaEnMarchaAvisosScan(
  ahora: Date = new Date(),
  opciones: { diasEspera?: number; intervaloMs?: number } = {}
): Promise<HospitalityPuestaEnMarchaAvisosResult> {
  const startedAt = Date.now();

  const base = {
    success: true,
    message: '',
    tenantsHospitality: 0,
    paradas: 0,
    avisados: 0,
    aunEspronto: 0,
    enEspera: 0,
    avisos: [] as string[],
    errores: [] as string[],
    durationMs: 0,
  };

  // La lectura es lo único que no se puede aislar por cuenta: si falla, no hay
  // aviso ni marcas, y se dice por qué en vez de fingir que no había nada.
  let listado: Awaited<ReturnType<typeof listarPuestasEnMarchaHospitality>>;
  try {
    listado = await listarPuestasEnMarchaHospitality();
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      success: false,
      error: mensaje,
      message: `No se pudo leer la puesta en marcha: ${mensaje}`,
      durationMs: Date.now() - startedAt,
    };
  }
  if (!listado.ok) {
    return {
      ...base,
      success: false,
      error: listado.error,
      message: `No se pudo leer la puesta en marcha: ${listado.error}`,
      durationMs: Date.now() - startedAt,
    };
  }

  const filas = listado.listado.tenants;
  const noListas = filas.filter((f) => !f.listo);
  if (!noListas.length) {
    return {
      ...base,
      tenantsHospitality: filas.length,
      message: `Sin cuentas de Hospitality a medias (${filas.length} cliente(s) al día).`,
      durationMs: Date.now() - startedAt,
    };
  }

  const paradas: CuentaAvisada[] = [];
  const apagadas: CuentaAvisada[] = [];
  let enEspera = 0;
  let aunEspronto = 0;

  for (const fila of noListas) {
    try {
      const diasParada = diasSinAvanzar(fila.senal, ahora);
      const ultimoAviso = await ultimoAvisoDe(fila.tenantId);
      const decision = decidirAviso({
        listo: fila.listo,
        moduloApagado: fila.moduloApagado,
        diasParada,
        ultimoAviso,
        ahora,
        diasEspera: opciones.diasEspera,
        intervaloMs: opciones.intervaloMs,
      });

      if (decision.motivo === 'aviso_reciente') enEspera += 1;
      else if (decision.motivo === 'aun_es_pronto') aunEspronto += 1;

      if (!decision.avisar) continue;
      const cuenta: CuentaAvisada = {
        fila,
        motivo: decision.motivo === 'modulo_apagado' ? 'modulo_apagado' : 'parada',
        diasParada,
      };
      if (cuenta.motivo === 'modulo_apagado') apagadas.push(cuenta);
      else paradas.push(cuenta);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      base.errores.push(`${fila.tenantId}: ${mensaje}`);
      console.error(`[Cron/PuestaEnMarcha] ${fila.tenant} falló:`, mensaje);
    }
  }

  if (!paradas.length && !apagadas.length) {
    return {
      ...base,
      tenantsHospitality: filas.length,
      paradas: noListas.length,
      enEspera,
      aunEspronto,
      message:
        `Sin avisos que enviar: ${noListas.length} cuenta(s) a medias, ` +
        `${enEspera} dentro del intervalo y ${aunEspronto} aún dentro del plazo.`,
      durationMs: Date.now() - startedAt,
    };
  }

  const { title, body } = construirAviso(paradas, apagadas);
  const canales = await avisarOperador({ title, body, tag: 'hospitality-puesta-en-marcha' });
  const salio = canales.apprise === 'enviado' || canales.resend === 'enviado';

  // La marca del intervalo —y la auditoría del envío— por cuenta avisada.
  for (const cuenta of [...paradas, ...apagadas]) {
    try {
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId: cuenta.fila.tenantId,
          propertyId: cuenta.fila.propiedades.primera?.id ?? null,
          tipo: TIPO_AVISO_PUESTA_EN_MARCHA,
          operacion: 'manual',
          estado: salio ? 'exito' : 'pendiente',
          responseBody: {
            motivo: cuenta.motivo,
            diasParada: cuenta.diasParada,
            rolesAlDia: cuenta.fila.roles.alDia,
            propiedades: cuenta.fila.propiedades.total,
            faltantes: cuenta.fila.faltantes,
            canales,
          } as never,
        },
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      base.errores.push(`marca ${cuenta.fila.tenantId}: ${mensaje}`);
      console.error(`[Cron/PuestaEnMarcha] No se pudo marcar ${cuenta.fila.tenant}:`, mensaje);
    }
  }

  const avisos: string[] = [];
  if (paradas.length) {
    avisos.push(
      `${paradas.length} cuenta(s) paradas: ${paradas.map((c) => c.fila.tenant).join(', ')}`
    );
  }
  if (apagadas.length) {
    avisos.push(
      `${apagadas.length} con el módulo apagado y datos dentro: ` +
        apagadas.map((c) => c.fila.tenant).join(', ')
    );
  }
  if (!salio) {
    avisos.push('El aviso no salió por ningún canal externo (revisa ADMIN_EMAIL/RESEND_API_KEY).');
  }

  const avisados = paradas.length + apagadas.length;
  console.log(
    `[Cron/PuestaEnMarcha] DONE aMedias=${noListas.length} avisados=${avisados} ` +
      `enEspera=${enEspera} pronto=${aunEspronto} canal=${canales.resend}/${canales.apprise} ` +
      `durationMs=${Date.now() - startedAt}`
  );

  return {
    ...base,
    tenantsHospitality: filas.length,
    paradas: noListas.length,
    avisados,
    enEspera,
    aunEspronto,
    avisos,
    canales,
    message:
      `Aviso enviado por ${paradas.length + apagadas.length} cuenta(s): ` +
      `${paradas.length} parada(s) y ${apagadas.length} con el módulo apagado ` +
      `(resend=${canales.resend}, apprise=${canales.apprise}).`,
    durationMs: Date.now() - startedAt,
  };
}
