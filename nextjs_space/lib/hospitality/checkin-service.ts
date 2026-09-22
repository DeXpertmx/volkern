/**
 * Check-in online del huésped (registro de viajeros, RD 933/2021).
 *
 * Es la pieza que hace que el parte de viajeros salga **completo y sin nadie
 * del hotel detrás**: el huésped recibe un enlace (en el email de pre-llegada o
 * al confirmar la reserva), sube los documentos de todo su grupo y, cuando la
 * documentación está completa, el parte puede emitirse.
 *
 * Decisiones que conviene tener presentes:
 *
 *  - **El token es la credencial.** Es opaco, único y por reserva: quien lo
 *    tiene edita esa reserva y solo esa. Por eso no se expone en listados y el
 *    enlace se genera al vuelo (`asegurarTokenCheckin`), incluso para reservas
 *    que ya existían antes de que esto se implementara.
 *  - **El parte NO se envía al guardar los datos, salvo que ya toque.** El
 *    Servicio de Hospedajes comunica el parte al INICIO del servicio: enviarlo
 *    el día que el huésped reserva comunicaría una entrada que aún no ha
 *    ocurrido (y un no-show obligaría a anularla). Al guardar solo se envía si
 *    la estancia ya empezó —misma condición que el cron—, y si no, el barrido
 *    horario lo envía solo cuando llegue el día.
 *  - **La documentación incompleta no bloquea el guardado.** El huésped guarda
 *    lo que sabe (puede volver al enlace) y la respuesta le dice exactamente qué
 *    queda por revisar; el parte se emite cuando esté completo.
 */

import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { idiomaDeValor } from './booking-i18n';
import {
  MAX_VIAJEROS_CHECKIN,
  fusionarViajerosEnGuestData,
  heredarDatosDelTitular,
  normalizarViajeros,
  resumenDocumentacion,
  titularPrimero,
  type DocumentacionReserva,
  type ViajeroCheckin,
} from './guest-checkin';
import {
  ESTADO_REGISTRO,
  enviarRegistroDeReserva,
} from './registro-viajeros-service';
import { ESTADOS_ACTIVOS_REGISTRO, type ErrorValidacionMIR } from './registro-viajeros';
import {
  normalizarPreguntas,
  validarRespuestas,
  type PreguntaCheckin,
  type RespuestasLimpias,
  type RespuestasCrudas,
} from './checkin-preguntas';

/** URL pública de la aplicación (misma convención que el resto del producto). */
function urlPublica(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/+$/, '');
}

/**
 * Token del enlace de check-in: 24 bytes al azar en base64url (192 bits).
 * Es una credencial de acceso a datos personales, así que no se deriva de nada
 * adivinable (ni del id de la reserva ni del correo del huésped).
 */
export function generarTokenCheckin(): string {
  return randomBytes(24).toString('base64url');
}

/** Enlace que se le manda al huésped, en su idioma. */
export function enlaceCheckin(token: string, idioma?: unknown): string {
  return `${urlPublica()}/checkin/${token}?lang=${idiomaDeValor(idioma)}`;
}

/**
 * Devuelve el token de la reserva, generándolo si aún no lo tiene.
 *
 * Se genera al vuelo —y no solo al crear la reserva— para que las reservas
 * anteriores (y las que llegan por canal) tengan enlace la primera vez que se
 * les envía la comunicación de pre-llegada.
 */
export async function asegurarTokenCheckin(reserva: {
  id: string;
  tokenCheckin?: string | null;
}): Promise<string> {
  const existente = (reserva.tokenCheckin || '').trim();
  if (existente) return existente;

  const token = generarTokenCheckin();
  await prisma.hospitalityReservation.update({
    where: { id: reserva.id },
    data: { tokenCheckin: token },
    select: { id: true },
  });
  return token;
}

/** Datos de la reserva que necesita el formulario público (sin nada sensible). */
export async function reservaParaCheckin(token: string) {
  const limpio = (token || '').trim();
  if (!limpio) return null;

  return prisma.hospitalityReservation.findFirst({
    where: { tokenCheckin: limpio },
    select: {
      id: true,
      tenantId: true,
      estado: true,
      externalBookingId: true,
      checkIn: true,
      checkOut: true,
      occupancyAdults: true,
      occupancyChildren: true,
      guestData: true,
      respuestasCheckin: true,
      property: { select: { nombre: true, ciudad: true, timezone: true } },
      unit: { select: { nombre: true } },
    },
  });
}

/** ¿Esta reserva ya no admite check-in? (cancelada o no-show) */
export function reservaCerrada(estado: string): boolean {
  return estado === 'cancelled' || estado === 'no_show';
}

export interface ResultadoGuardadoCheckin {
  viajeros: ViajeroCheckin[];
  documentacion: DocumentacionReserva;
  /** Filas vacías del formulario que se ignoraron (no se descartan en silencio). */
  descartados: number;
  error?: 'sin_viajeros' | 'demasiados_viajeros';
  /** Respuestas validadas a las preguntas personalizadas del hotel (las que
   *  pasaron la validación; nunca viajan al parte MIR). */
  respuestas?: RespuestasLimpias;
  /** Ids de preguntas `requerida` que el huésped dejó sin responder. */
  faltanPreguntas?: string[];
}

/**
 * Preguntas activas del tenant, en el orden configurado. Tabla vacía si el
 * hotel no definió ninguna — el formulario simplemente no muestra el bloque.
 */
export async function preguntasCheckinDeTenant(tenantId: string): Promise<PreguntaCheckin[]> {
  const crudas = await prisma.hospitalityCheckinPregunta.findMany({
    where: { tenantId, activa: true },
    orderBy: [{ orden: 'asc' }, { fechaCreacion: 'asc' }],
  });
  return normalizarPreguntas(
    crudas.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      es: p.es,
      en: p.en,
      opciones: p.opciones,
      requerida: p.requerida,
      activa: p.activa,
      orden: p.orden,
    }))
  );
}

/**
 * Guarda los viajeros de la reserva y devuelve la cobertura resultante.
 *
 * Ordena al titular primero (el registro asigna el rol por posición), hereda el
 * contacto del grupo y —solo si el formulario lo pidió— la dirección del
 * titular, y **no toca nada más de `guestData`**: el idioma y el contacto del
 * titular siguen ahí para las comunicaciones automáticas.
 */
export async function guardarDocumentacionCheckin(params: {
  reserva: { id: string; tenantId: string; guestData: unknown; checkIn: Date };
  viajeros: unknown;
  heredarDireccion?: boolean;
  /** Respuestas del huésped a las preguntas personalizadas del hotel. */
  respuestas?: RespuestasCrudas;
  ahora?: Date;
}): Promise<ResultadoGuardadoCheckin> {
  const ahora = params.ahora ?? new Date();
  const { viajeros: normalizados, descartados } = normalizarViajeros(params.viajeros, ahora);
  const gd = (params.reserva.guestData || {}) as Record<string, unknown>;

  if (normalizados.length === 0) {
    return {
      viajeros: [],
      documentacion: resumenDocumentacion([], params.reserva.checkIn),
      descartados,
      error: 'sin_viajeros',
    };
  }
  if (normalizados.length > MAX_VIAJEROS_CHECKIN) {
    return {
      viajeros: [],
      documentacion: resumenDocumentacion([], params.reserva.checkIn),
      descartados,
      error: 'demasiados_viajeros',
    };
  }

  const ordenados = titularPrimero(normalizados, { correo: gd.email, telefono: gd.phone ?? gd.telefono });
  const conGrupo = heredarDatosDelTitular(ordenados, { heredarDireccion: params.heredarDireccion === true });

  // Preguntas personalizadas del hotel: se validan y se guardan para el hotel
  // en `respuestasCheckin` — jamás se pasan a la construcción del XML del
  // parte (la guardia de tests fija que el módulo MIR no importa este flujo).
  // Una `requerida` sin respuesta NO bloquea el guardado de los viajeros:
  // la respuesta lo informa (`faltanPreguntas`) para que la pantalla la pida.
  let respuestas: RespuestasLimpias | undefined;
  let faltanPreguntas: string[] | undefined;
  const preguntas = await preguntasCheckinDeTenant(params.reserva.tenantId);
  if (preguntas.length > 0) {
    const resultado = validarRespuestas(preguntas, params.respuestas);
    respuestas = resultado.respuestas;
    faltanPreguntas = resultado.faltan;
  }

  await prisma.hospitalityReservation.update({
    where: { id: params.reserva.id },
    data: {
      guestData: fusionarViajerosEnGuestData(params.reserva.guestData, conGrupo) as object,
      ...(respuestas !== undefined ? { respuestasCheckin: respuestas as object } : {}),
    },
    select: { id: true },
  });

  // La referencia para «mayor de edad» es la fecha de entrada: la misma que usa
  // el registro de viajeros al validar el parte.
  return {
    viajeros: conGrupo,
    documentacion: resumenDocumentacion(conGrupo, params.reserva.checkIn),
    descartados,
    respuestas,
    faltanPreguntas,
  };
}

export type ResultadoEnvioParte =
  | { enviado: true; estado: string; descripcion?: string | null }
  | {
      enviado: false;
      /**
       * `datos_incompletos` y `rechazado` son estados REALES del registro: el
       * parte se intentó y el Ministerio (o la validación previa) lo rechazó.
       * No se mezclan con «enviado»: decir «enviado» de un parte que el
       * Ministerio no aceptó es justo lo que hay que evitar.
       *
       * `estado` también viaja cuando el fallo NO es del parte (`error`: el
       * servicio no contestó), para que quien llama pueda distinguir una
       * incidencia de entrega de una falta de datos sin leer el motivo.
       */
      estado?: string;
      motivo:
        | 'servicio_no_iniciado'
        | 'sin_configuracion'
        | 'datos_incompletos'
        | 'rechazado'
        | 'sin_entrega'
        | 'error';
      descripcion?: string;
      errores?: ErrorValidacionMIR[];
    };

/**
 * Envía el parte de viajeros **solo si ya toca**: la estancia empezó (misma
 * condición que el cron `hospitality-registro-viajeros`, que sigue siendo la
 * red de seguridad). Nunca lanza: un fallo del Ministerio no puede tumbar el
 * guardado del huésped.
 */
export async function enviarParteSiCorresponde(
  reserva: { id: string; tenantId: string; estado: string; checkIn: Date },
  ahora: Date = new Date()
): Promise<ResultadoEnvioParte> {
  if (!ESTADOS_ACTIVOS_REGISTRO.includes(reserva.estado)) {
    return { enviado: false, motivo: 'servicio_no_iniciado' };
  }
  if (new Date(reserva.checkIn).getTime() > ahora.getTime()) {
    return { enviado: false, motivo: 'servicio_no_iniciado' };
  }

  try {
    const envio = await enviarRegistroDeReserva(reserva.tenantId, reserva.id);
    const descripcion = envio.descripcion ?? undefined;

    if (envio.estado === ESTADO_REGISTRO.enviada || envio.estado === ESTADO_REGISTRO.aceptada) {
      return { enviado: true, estado: envio.estado, descripcion: descripcion ?? null };
    }
    if (envio.estado === ESTADO_REGISTRO.datosIncompletos) {
      return { enviado: false, motivo: 'datos_incompletos', descripcion, errores: envio.errores };
    }
    if (envio.estado === ESTADO_REGISTRO.rechazada) {
      return { enviado: false, estado: ESTADO_REGISTRO.rechazada, motivo: 'rechazado', descripcion, errores: envio.errores };
    }
    // El servicio no contestó (caída, timeout, HTTP sin cuerpo SOAP): el parte
    // NO se entregó. La pantalla del huésped no puede oír «rechazado» —nadie lo
    // leyó— ni «sin configuración», que manda al hotel a revisar credenciales
    // que están bien: es una incidencia de la entrega, y el parte se reintenta.
    if (envio.estado === ESTADO_REGISTRO.error) {
      return { enviado: false, estado: ESTADO_REGISTRO.error, motivo: 'sin_entrega', descripcion };
    }
    return { enviado: false, motivo: 'sin_configuracion', descripcion };
  } catch (error) {
    console.error('[Check-in] Error enviando el parte de viajeros:', error);
    return {
      enviado: false,
      motivo: 'error',
      descripcion: error instanceof Error ? error.message : 'error inesperado',
    };
  }
}

/**
 * Enlace de check-in de una reserva del tenant (lo usa el panel del hotel para
 * reenviárselo al huésped). `null` si la reserva no existe o ya no está activa.
 */
export async function enlaceCheckinDeReserva(
  tenantId: string,
  reservationId: string
): Promise<{ token: string; url: string } | null> {
  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { id: reservationId, tenantId },
    select: { id: true, tokenCheckin: true, estado: true, guestData: true },
  });
  if (!reserva || reservaCerrada(reserva.estado)) return null;

  const token = await asegurarTokenCheckin(reserva);
  const gd = (reserva.guestData || {}) as Record<string, unknown>;
  return { token, url: enlaceCheckin(token, gd.idioma) };
}
