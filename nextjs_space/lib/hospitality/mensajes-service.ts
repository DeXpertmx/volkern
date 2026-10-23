/**
 * Bandeja de mensajería del canal (OTAs) — capa de datos.
 *
 * Recibe lo que normaliza `mensajes-canal.ts` (puro) y lo persiste: resuelve la
 * propiedad por el mapping del `hotel_id`, abre o reutiliza el hilo, guarda el
 * mensaje sin duplicar entregas repetidas y, al responder, llama al proveedor
 * DEJANDO CONSTANCIA de si la respuesta salió o no.
 *
 * Dos reglas que vienen del resto del módulo y aquí se repiten:
 *  - **Sin mapping activo no se guarda nada** (404 y el proveedor reintenta):
 *    un mensaje que no sabemos de qué propiedad es no tiene dónde entregarse.
 *  - **La entrega repetida no duplica**: el proveedor puede entregar el mismo
 *    `message_id` más de una vez (su propio contrato lo advierte).
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  MAX_MENSAJE,
  construirRespuestaCanal,
  normalizarMensajeEntrante,
} from './mensajes-canal';
import { enviarMensajeCanal } from './connectivity';
import { VINCULO_PENDIENTE_REVISION } from './vinculo-revision';

/** Igual que el resto de la capa: un solo adapter de conectividad. */
const PROVIDER = 'channel_connectivity';
/** Mensajes que devuelve un hilo abierto en el panel. */
export const MAX_HILO = 200;
/** Hilos que devuelve la bandeja. */
export const MAX_BANDEJA = 100;

export type ResultadoRegistro =
  | {
      ok: true;
      /** `duplicado` = ya teníamos ese `message_id` (no se escribió nada). */
      estado: 'recibido' | 'duplicado';
      conversacionId: string;
      mensajeId: string | null;
      tenantId: string;
      propertyId: string | null;
    }
  | {
      ok: false;
      status: 'sin_mapping' | 'invalido';
      error: string;
      /**
       * Código y canal, cuando el payload llegó a normalizarse. Los necesita la
       * incidencia: un mensaje sin mapping no tiene tenant, pero sí un `hotel_id`
       * concreto que alguien tiene que vincular.
       */
      hotelCode?: string;
      canal?: string;
    };

/** `action` con la que se auditan los mensajes del canal en `hospitality_webhook_events`. */
export const ACCION_MENSAJE_CANAL = 'message';

/**
 * Propiedad (y por tanto tenant) del `hotel_id` del proveedor. El tenant sale
 * del mapping, no del payload: el webhook entrante no lleva credenciales de
 * cliente y admitir un tenant del cuerpo sería abrir la puerta a escribir en la
 * bandeja de otro hotel.
 */
async function resolverPropiedad(hotelCode: string) {
  // Lectura de ENTRADA (webhook de mensajes): un vínculo pendiente de revisión
  // también responde "de qué hotel es este mensaje" (ver vinculo-revision.ts).
  return prisma.connectivityMapping.findFirst({
    where: {
      provider: PROVIDER,
      externalPropertyId: hotelCode,
      estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] },
    },
    orderBy: { fechaCreacion: 'asc' },
    select: { tenantId: true, propertyId: true },
  });
}

/**
 * Registra un mensaje entrante del webhook. Idempotente por `message_id`.
 */
export async function registrarMensajeEntrante(payload: unknown): Promise<ResultadoRegistro> {
  const normalizado = normalizarMensajeEntrante(payload);
  if (!normalizado.ok) return { ok: false, status: 'invalido', error: normalizado.error };
  const m = normalizado.mensaje;

  const mapping = await resolverPropiedad(m.hotelCode);
  if (!mapping) {
    return {
      ok: false,
      status: 'sin_mapping',
      error: `Sin mapping activo para hotelCode ${m.hotelCode}`,
      hotelCode: m.hotelCode,
      canal: m.canal,
    };
  }
  const tenantId = mapping.tenantId;
  const direccion = m.esDelHotel ? 'saliente' : 'entrante';

  // Reserva del hilo: el `booking_id` del proveedor, si esa reserva ya existe
  // aquí. No se exige: la conversación puede ser previa a la reserva.
  const reserva = m.bookingExterno
    ? await prisma.hospitalityReservation.findFirst({
        where: { tenantId, externalBookingId: m.bookingExterno },
        select: { id: true },
        orderBy: { checkIn: 'desc' },
      })
    : null;

  const clave = { tenantId, canal: m.canal, conversacionId: m.conversacionExternaId };
  const existente = await prisma.hospitalityCanalConversacion.findUnique({
    where: { tenantId_canal_conversacionId: clave },
  });

  const ahora = new Date();
  // Con la hora del proveedor si la trajo: el hilo se ordena por el momento en
  // que se escribió, no por cuándo nos llegó.
  const momento = m.enviadoEn ?? ahora;

  const conversacion = existente
    ? await prisma.hospitalityCanalConversacion.update({
        where: { id: existente.id },
        data: {
          // Los datos que ya teníamos no se pisan con un `null` de un mensaje
          // posterior: el canal deja de mandarlos cuando quiere.
          propertyId: existente.propertyId ?? mapping.propertyId,
          reservationId: existente.reservationId ?? reserva?.id ?? null,
          bookingExterno: existente.bookingExterno ?? m.bookingExterno,
          huespedNombre: existente.huespedNombre ?? m.huespedNombre,
          huespedEmail: existente.huespedEmail ?? m.huespedEmail,
          huespedTelefono: existente.huespedTelefono ?? m.huespedTelefono,
          // Una entrega tardía no retrocede el hilo en la bandeja.
          ultimoMensajeEn: momento > existente.ultimoMensajeEn ? momento : existente.ultimoMensajeEn,
        },
      })
    : await prisma.hospitalityCanalConversacion.create({
        data: {
          tenantId,
          propertyId: mapping.propertyId,
          reservationId: reserva?.id ?? null,
          canal: m.canal,
          hotelCode: m.hotelCode,
          conversacionId: m.conversacionExternaId,
          bookingExterno: m.bookingExterno,
          huespedNombre: m.huespedNombre,
          huespedEmail: m.huespedEmail,
          huespedTelefono: m.huespedTelefono,
          ultimoMensajeEn: momento,
        },
      });

  // Dedupe: la entrega repetida del mismo mensaje no escribe ni cuenta sin leer.
  const yaEsta = await prisma.hospitalityCanalMensaje.findUnique({
    where: {
      conversacionId_mensajeExternoId: {
        conversacionId: conversacion.id,
        mensajeExternoId: m.mensajeExternoId,
      },
    },
    select: { id: true },
  });
  if (yaEsta) {
    return {
      ok: true,
      estado: 'duplicado',
      conversacionId: conversacion.id,
      mensajeId: yaEsta.id,
      tenantId,
      propertyId: conversacion.propertyId,
    };
  }

  const mensaje = await prisma.hospitalityCanalMensaje.create({
    data: {
      tenantId,
      conversacionId: conversacion.id,
      mensajeExternoId: m.mensajeExternoId,
      direccion,
      emisor: m.emisor,
      contenido: m.contenido,
      tipo: m.tipo,
      enviadoEn: m.enviadoEn,
      adjuntos: m.adjuntos.length > 0 ? (m.adjuntos as unknown as Prisma.InputJsonValue) : undefined,
      // El eco del hotel desde la app del canal ya salió: no es una respuesta
      // nuestra y no se reintenta ni se cuenta como pendiente.
      estado: m.esDelHotel ? 'enviado' : 'recibido',
    },
  });

  if (direccion === 'entrante') {
    await prisma.hospitalityCanalConversacion.update({
      where: { id: conversacion.id },
      data: { sinLeer: { increment: 1 } },
    });
  }

  // El mapping ya existe para este código: si había una incidencia abierta por
  // mensajes suyos sin entregar, se cierra aquí. Nadie tiene que acordarse.
  await cerrarIncidenciasMensajeSinMapping(m.hotelCode).catch((e) =>
    console.error('[Hospitality] Error cerrando incidencia de mensajes sin mapping:', e)
  );

  return {
    ok: true,
    estado: 'recibido',
    conversacionId: conversacion.id,
    mensajeId: mensaje.id,
    tenantId,
    propertyId: conversacion.propertyId,
  };
}

/** Un hilo de la bandeja, con lo mínimo para poder contestar sin abrirlo. */
export interface ConversacionResumen {
  id: string;
  canal: string;
  huespedNombre: string | null;
  huespedEmail: string | null;
  huespedTelefono: string | null;
  propertyId: string | null;
  propiedad: string | null;
  reservationId: string | null;
  bookingExterno: string | null;
  ultimoMensajeEn: string;
  sinLeer: number;
  /** Último mensaje del hilo (recortado): la vista previa de la bandeja. */
  ultimo: string | null;
  ultimoDireccion: string | null;
}

export interface OpcionesBandeja {
  propertyId?: string | null;
  /** Solo los que tienen algo sin leer. */
  soloSinLeer?: boolean;
  limite?: number;
}

const RECORTE_VISTA_PREVIA = 160;

/**
 * Hilos del tenant, del más reciente al más antiguo (lo que pide una bandeja).
 * El recorte de la vista previa es de PRESENTACIÓN: el mensaje completo se lee
 * al abrir el hilo y en la base está entero.
 */
export async function listarConversaciones(
  tenantId: string,
  opciones: OpcionesBandeja = {}
): Promise<ConversacionResumen[]> {
  const limite = Math.min(Math.max(opciones.limite ?? MAX_BANDEJA, 1), MAX_BANDEJA);
  const filas = await prisma.hospitalityCanalConversacion.findMany({
    where: {
      tenantId,
      ...(opciones.propertyId ? { propertyId: opciones.propertyId } : {}),
      ...(opciones.soloSinLeer ? { sinLeer: { gt: 0 } } : {}),
    },
    orderBy: { ultimoMensajeEn: 'desc' },
    take: limite,
    include: {
      property: { select: { nombre: true } },
      mensajes: {
        orderBy: { fechaCreacion: 'desc' },
        take: 1,
        select: { contenido: true, direccion: true },
      },
    },
  });

  return filas.map((f) => {
    const ultimo = f.mensajes[0];
    const texto = ultimo?.contenido ?? '';
    return {
      id: f.id,
      canal: f.canal,
      huespedNombre: f.huespedNombre,
      huespedEmail: f.huespedEmail,
      huespedTelefono: f.huespedTelefono,
      propertyId: f.propertyId,
      propiedad: f.property?.nombre ?? null,
      reservationId: f.reservationId,
      bookingExterno: f.bookingExterno,
      ultimoMensajeEn: f.ultimoMensajeEn.toISOString(),
      sinLeer: f.sinLeer,
      ultimo: texto ? texto.slice(0, RECORTE_VISTA_PREVIA) : ultimo ? '(adjunto)' : null,
      ultimoDireccion: ultimo?.direccion ?? null,
    };
  });
}

/**
 * Un hilo completo. El orden es de RECEPCIÓN (`fechaCreacion`): es el único que
 * existe siempre — la hora del proveedor puede faltar y el hilo no se puede
 * quedar desordenado por eso.
 */
export async function hiloDeConversacion(tenantId: string, conversacionId: string) {
  const conversacion = await prisma.hospitalityCanalConversacion.findFirst({
    where: { id: conversacionId, tenantId },
    include: {
      property: { select: { id: true, nombre: true } },
      reservation: {
        select: { id: true, externalBookingId: true, checkIn: true, checkOut: true, estado: true },
      },
    },
  });
  if (!conversacion) return null;

  const mensajes = await prisma.hospitalityCanalMensaje.findMany({
    where: { conversacionId: conversacion.id, tenantId },
    orderBy: { fechaCreacion: 'asc' },
    take: MAX_HILO,
  });

  return { conversacion, mensajes };
}

/** Marca el hilo como leído (acción explícita del operador, no un efecto de abrirlo). */
export async function marcarHiloLeido(tenantId: string, conversacionId: string): Promise<number> {
  const { count } = await prisma.hospitalityCanalConversacion.updateMany({
    where: { id: conversacionId, tenantId, sinLeer: { gt: 0 } },
    data: { sinLeer: 0 },
  });
  return count;
}

export type ResultadoRespuesta =
  | { ok: true; mensajeId: string; httpStatus?: number }
  | {
      ok: false;
      /** `invalido` = no se llegó a llamar; `canal` = el canal la rechazó. */
      motivo: 'invalido' | 'canal' | 'no_encontrada';
      error: string;
      /** El mensaje que quedó en el hilo con su error (solo en `canal`). */
      mensajeId?: string;
    };

/**
 * Responde al huésped en la conversación y deja constancia de lo que pasó.
 *
 * La respuesta se guarda SIEMPRE que se haya intentado: si el canal la rechazó,
 * queda en el hilo como `error` con su motivo (el hotel tiene que ver que NO
 * salió, y reescribirla; no hay reintento ciego de un mensaje al huésped).
 * `enviadoEn` de un mensaje nuestro es NUESTRA hora de envío: el proveedor no
 * devuelve la suya y no hay nada que inventar.
 */
export async function responderConversacion(
  tenantId: string,
  conversacionId: string,
  contenido: unknown
): Promise<ResultadoRespuesta> {
  const conversacion = await prisma.hospitalityCanalConversacion.findFirst({
    where: { id: conversacionId, tenantId },
  });
  if (!conversacion) {
    return { ok: false, motivo: 'no_encontrada', error: 'La conversación no existe en este tenant' };
  }

  const cuerpo = construirRespuestaCanal({
    canal: conversacion.canal,
    contenido,
    hotelCode: conversacion.hotelCode,
    conversacionExternaId: conversacion.conversacionId,
    bookingExterno: conversacion.bookingExterno,
  });
  if (!cuerpo.ok) return { ok: false, motivo: 'invalido', error: cuerpo.error };

  const texto = String(contenido ?? '').trim().slice(0, MAX_MENSAJE);
  const envio = await enviarMensajeCanal(cuerpo.body, tenantId);
  const ahora = new Date();

  const mensaje = await prisma.hospitalityCanalMensaje.create({
    data: {
      tenantId,
      conversacionId: conversacion.id,
      direccion: 'saliente',
      emisor: 'hotel',
      contenido: texto,
      tipo: 'text',
      enviadoEn: ahora,
      estado: envio.ok ? 'enviado' : 'error',
      error: envio.ok ? null : envio.error ?? 'Error enviando al canal',
    },
    select: { id: true },
  });

  await prisma.hospitalityCanalConversacion.update({
    where: { id: conversacion.id },
    data: { ultimoMensajeEn: ahora },
  });

  if (!envio.ok) {
    return {
      ok: false,
      motivo: 'canal',
      error: envio.error ?? 'Error enviando al canal',
      mensajeId: mensaje.id,
    };
  }

  return { ok: true, mensajeId: mensaje.id, httpStatus: envio.httpStatus };
}

// ─── Incidencia: mensajes de un `hotel_id` SIN mapping ────────────────────
//
// Un mensaje de un hotelCode sin mapping no tiene tenant (no hay a quién
// entregarlo), así que la incidencia vive donde vive la de las reservas que
// llegan igual: en `hospitality_webhook_events`, visible en el panel de
// Conectividad con su código. La diferencia con las reservas es de forma: una
// reserva perdida se audita una vez por entrega, pero el proveedor reintenta el
// mismo mensaje cada 5 minutos — UNA fila por (hotelCode, canal) que se refresca,
// con `intentos` y `ultimoIntentoEn`, dice más y ensucia menos.
//
// El payload NO se guarda aquí: el mensaje del huésped lleva datos personales
// (nombre, teléfono, email) y para actuar solo hacen falta el código, el canal y
// cuántas entregas se han quedado fuera.

/** Incidencias abiertas que devuelve el panel. */
export const MAX_INCIDENCIAS_MENSAJE = 50;

/** Un `hotel_id` del canal recibiendo mensajes que no se pueden entregar. */
export interface IncidenciaMensajeSinMapping {
  id: string;
  hotelCode: string;
  canal: string | null;
  bookingExterno: string | null;
  /** Entregas acumuladas (cada reintento del proveedor suma uno). */
  intentos: number;
  primeraFecha: string;
  ultimaFecha: string;
  errorMensaje: string | null;
}

/**
 * Registra (o refresca) la incidencia de un mensaje sin mapping. Devuelve el id
 * de la fila, o `null` si la propia escritura falló — nunca lanza: el webhook
 * tiene que poder responder su 404 aunque la incidencia no se pueda anotar.
 */
export async function registrarIncidenciaMensajeSinMapping(input: {
  hotelCode: string;
  canal: string;
  error: string;
  bookingExterno?: string | null;
}): Promise<string | null> {
  const ahora = new Date();
  try {
    const abierta = await prisma.hospitalityWebhookEvent.findFirst({
      where: {
        action: ACCION_MENSAJE_CANAL,
        hotelCode: input.hotelCode,
        channel: input.canal,
        estado: 'sin_mapping',
      },
      orderBy: { fechaCreacion: 'desc' },
      select: { id: true },
    });

    if (abierta) {
      await prisma.hospitalityWebhookEvent.update({
        where: { id: abierta.id },
        data: {
          intentos: { increment: 1 },
          ultimoIntentoEn: ahora,
          errorMensaje: input.error,
          ...(input.bookingExterno ? { bookingId: input.bookingExterno } : {}),
        },
      });
      return abierta.id;
    }

    const creada = await prisma.hospitalityWebhookEvent.create({
      data: {
        action: ACCION_MENSAJE_CANAL,
        channel: input.canal,
        hotelCode: input.hotelCode,
        bookingId: input.bookingExterno ?? null,
        estado: 'sin_mapping',
        errorMensaje: input.error,
        intentos: 1,
        ultimoIntentoEn: ahora,
      },
      select: { id: true },
    });
    return creada.id;
  } catch (e) {
    console.error('[Hospitality] Error registrando incidencia de mensaje sin mapping:', e);
    return null;
  }
}

/**
 * Cierra las incidencias abiertas de un `hotelCode` (el mapping ya existe: el
 * propio mensaje que acaba de entregarse lo demuestra). Se conserva el motivo
 * original —lo que pasó es parte de la historia— y lo que cambia es el estado.
 */
export async function cerrarIncidenciasMensajeSinMapping(hotelCode: string): Promise<number> {
  const { count } = await prisma.hospitalityWebhookEvent.updateMany({
    where: { action: ACCION_MENSAJE_CANAL, hotelCode, estado: 'sin_mapping' },
    data: { estado: 'procesado' },
  });
  return count;
}

/**
 * Incidencias abiertas para el panel. Sin filtro de tenant a propósito: si no
 * hay mapping no hay tenant, y quien vincula el código es el operador de la
 * plataforma (o el hotel desde su onboarding).
 */
export async function listarIncidenciasMensajeSinMapping(): Promise<IncidenciaMensajeSinMapping[]> {
  const filas = await prisma.hospitalityWebhookEvent.findMany({
    where: { action: ACCION_MENSAJE_CANAL, estado: 'sin_mapping' },
    orderBy: { fechaCreacion: 'desc' },
    take: MAX_INCIDENCIAS_MENSAJE,
    select: {
      id: true,
      hotelCode: true,
      channel: true,
      bookingId: true,
      intentos: true,
      ultimoIntentoEn: true,
      errorMensaje: true,
      fechaCreacion: true,
    },
  });

  return filas.map((f) => ({
    id: f.id,
    hotelCode: f.hotelCode ?? '',
    canal: f.channel,
    bookingExterno: f.bookingId,
    intentos: f.intentos,
    primeraFecha: f.fechaCreacion.toISOString(),
    // Sin último intento anotado, la primera entrega es la única que hubo.
    ultimaFecha: (f.ultimoIntentoEn ?? f.fechaCreacion).toISOString(),
    errorMensaje: f.errorMensaje,
  }));
}
