/**
 * Mensajes del canal con el huésped — módulo PURO.
 *
 * El proveedor de conectividad llama a un webhook NUESTRO cada vez que llega un
 * mensaje de huésped (o del hotel) en una conversación de una OTA, y nosotros
 * respondemos por su API de respuesta. Aquí viven las reglas de VALOR de las dos
 * direcciones —qué mensaje entrante es válido y qué cuerpo lleva una respuesta—
 * sin tocar la base de datos ni la red: la ruta recibe el JSON, esta pieza lo
 * normaliza, y quien persiste es el servicio.
 *
 * Dos decisiones que no se negocian:
 *  - **Nada se inventa**: un mensaje sin fecha legible se guarda sin fecha (la
 *    fecha de recepción es otra cosa y se guarda aparte), y un canal exige su
 *    identificador de reserva para responder (Booking.com) o la respuesta se
 *    rechaza aquí, no en el proveedor.
 *  - **Nada se recorta en silencio**: si un mensaje entrante excede el tamaño
 *    admitido se rechaza con su motivo. Recortar la palabra del huésped sería
 *    publicar un texto que él no escribió.
 */

/** Límite de la respuesta que escribimos nosotros (texto del hotel). */
export const MAX_MENSAJE = 2000;
/**
 * Límite del mensaje que ENTRA. Es más alto que el nuestro a propósito: el
 * contrato del proveedor no publica límite para el huésped y no vamos a dejar
 * fuera una solicitud larga por un número inventado por nosotros.
 */
export const MAX_MENSAJE_ENTRANTE = 8000;
export const MAX_ADJUNTOS = 20;
export const MAX_NOMBRE_ADJUNTO = 200;
export const MAX_NOMBRE_HUESPED = 120;

export interface AdjuntoMensaje {
  /** Nombre del fichero tal y como lo mandó el proveedor. */
  nombre: string;
  /** Ruta del fichero en el proveedor (`/attachments/...`). */
  ruta: string;
  mime: string | null;
}

export interface MensajeEntrante {
  /** `hotel_id` del proveedor: la clave con la que se resuelve la propiedad. */
  hotelCode: string;
  /** OTA de la conversación (`booking.com`, `expedia`…), en minúsculas. */
  canal: string;
  /** `conversation_id`: el hilo al que pertenece el mensaje. */
  conversacionExternaId: string;
  /** `message_id`: dedupe de entregas repetidas. */
  mensajeExternoId: string;
  contenido: string;
  /** `message_type` del proveedor (`text`, `image`…). */
  tipo: string;
  /** `time_sent`. `null` si el proveedor no lo manda o no es legible. */
  enviadoEn: Date | null;
  /** `sender_type`: `property` es el hotel (el eco de lo que ya contestamos). */
  emisor: string;
  emisorId: string | null;
  bookingExterno: string | null;
  huespedNombre: string | null;
  huespedEmail: string | null;
  huespedTelefono: string | null;
  adjuntos: AdjuntoMensaje[];
  /** true cuando lo escribió el hotel (no el huésped). */
  esDelHotel: boolean;
}

export type ResultadoEntrante =
  | { ok: true; mensaje: MensajeEntrante }
  | { ok: false; error: string };

/** Lo que el panel enseña cuando el mensaje no lo escribió el huésped. */
export const EMISOR_PROPIEDAD = 'property';

/**
 * Cómo se llama cada canal en la interfaz. Los canales del proveedor llegan en
 * minúsculas y sin adornos (`booking.com`, `mmt`): el hotel reconoce el suyo en
 * su idioma (MakeMyTrip, no «mmt»). Un canal desconocido se enseña tal cual —
 * nunca se traduce a «Otro», porque eso borraría de dónde vino el mensaje.
 */
const ETIQUETA_CANAL: Record<string, string> = {
  'booking.com': 'Booking.com',
  booking: 'Booking.com',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  agoda: 'Agoda',
  mmt: 'MakeMyTrip',
  makemytrip: 'MakeMyTrip',
  goibibo: 'Goibibo',
  'trip.com': 'Trip.com',
  ctrip: 'Trip.com',
  hotelbeds: 'HotelBeds',
  hostelworld: 'HostelWorld',
  traveloka: 'Traveloka',
  yatra: 'Yatra',
  easemytrip: 'Ease My Trip',
  cleartrip: 'Cleartrip',
  tiket: 'Tiket.com',
  travelguru: 'Travelguru',
  reconline: 'Reconline',
  travolounge: 'Travolounge',
  vhshub: 'VHS Hub',
  bookingsmaker: 'Bookings Maker',
  happyeasygo: 'HappyEasyGo',
  'directo': 'Venta directa',
};

/** Canal normalizado: minúsculas y sin espacios sobrantes. */
export function canalNormalizado(valor: unknown): string {
  return String(valor ?? '').trim().toLowerCase();
}

/** Nombre del canal para la interfaz (el suyo si no lo conocemos). */
export function etiquetaCanal(valor: unknown): string {
  const canal = canalNormalizado(valor);
  if (!canal) return 'Canal desconocido';
  return ETIQUETA_CANAL[canal] ?? canal;
}

/** El único canal del contrato que exige el id de reserva para responder. */
export const CANAL_QUE_EXIGE_RESERVA = 'booking.com';

/**
 * Fecha de un mensaje del proveedor. El contrato usa `YYYY-MM-DD HH:MM:SS`
 * (UTC) y también acepta ISO. Un valor ilegible devuelve `null`: el mensaje se
 * guarda con la fecha de RECEPCIÓN, que sí conocemos, y el hilo no miente
 * inventando la hora a la que lo escribió el huésped.
 */
export function fechaMensaje(valor: unknown): Date | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const contrato = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto);
  if (contrato) {
    const [, y, m, d, h, min, s] = contrato;
    const fecha = new Date(
      Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s ?? '0'))
    );
    // El rollover de Date RUEDA la fecha inválida (32/01 → 1 de febrero): una
    // fecha imposible no se corrige sola, se descarta.
    if (Number.isNaN(fecha.getTime())) return null;
    if (fecha.getUTCMonth() !== Number(m) - 1 || fecha.getUTCDate() !== Number(d)) return null;
    return fecha;
  }
  const iso = new Date(texto);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

/** Texto limpio o `null` (nunca la cadena vacía: ocupa y no dice nada). */
function textoDe(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number') return String(valor);
  return null;
}

/**
 * Adjuntos del mensaje, saneados: un elemento sin nombre o sin ruta no se
 * puede enseñar ni descargar, así que no se guarda. Se conserva el orden del
 * proveedor y se corta el exceso.
 */
export function adjuntosDe(valor: unknown): AdjuntoMensaje[] {
  if (!Array.isArray(valor)) return [];
  const adjuntos: AdjuntoMensaje[] = [];
  for (const item of valor.slice(0, MAX_ADJUNTOS)) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const nombre = textoDe(a.filename) ?? textoDe(a.name);
    const ruta = textoDe(a.path) ?? textoDe(a.url);
    if (!nombre || !ruta) continue;
    adjuntos.push({
      nombre: nombre.slice(0, MAX_NOMBRE_ADJUNTO),
      ruta,
      mime: textoDe(a.mime_type) ?? textoDe(a.mime),
    });
  }
  return adjuntos;
}

/**
 * Normaliza el webhook de mensajes del proveedor a un mensaje nuestro.
 *
 * Rechaza solo lo que no se puede representar: sin propiedad no hay a quién
 * entregarlo, sin hilo no hay conversación y sin identificador de mensaje no se
 * puede deduplicar una entrega repetida. Todo lo demás es opcional a propósito
 * —los canales mandan distinto, y un mensaje sin datos del huésped sigue siendo
 * un mensaje del huésped.
 */
export function normalizarMensajeEntrante(payload: unknown): ResultadoEntrante {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Payload inválido' };
  }
  const p = payload as Record<string, unknown>;

  const hotelCode = textoDe(p.hotel_id) ?? textoDe(p.hotelCode);
  const canal = canalNormalizado(p.channel);
  const conversacionExternaId = textoDe(p.conversation_id) ?? textoDe(p.conversationId);
  const mensajeExternoId = textoDe(p.message_id) ?? textoDe(p.messageId);

  const faltan: string[] = [];
  if (!hotelCode) faltan.push('hotel_id');
  if (!canal) faltan.push('channel');
  if (!conversacionExternaId) faltan.push('conversation_id');
  if (!mensajeExternoId) faltan.push('message_id');
  if (faltan.length > 0) {
    return { ok: false, error: `Faltan campos obligatorios: ${faltan.join(', ')}` };
  }

  const adjuntos = adjuntosDe(p.attachments);
  const contenido = (typeof p.content === 'string' ? p.content : '').trim();
  if (!contenido && adjuntos.length === 0) {
    return { ok: false, error: 'El mensaje no trae contenido ni adjuntos' };
  }
  if (contenido.length > MAX_MENSAJE_ENTRANTE) {
    return {
      ok: false,
      error: `El mensaje pasa de ${MAX_MENSAJE_ENTRANTE} caracteres: no se recorta, se rechaza.`,
    };
  }

  const emisor = canalNormalizado(p.sender_type) || 'guest';
  const detalle = (p.guest_details && typeof p.guest_details === 'object'
    ? p.guest_details
    : {}) as Record<string, unknown>;
  const nombre = textoDe(detalle.name);

  return {
    ok: true,
    mensaje: {
      hotelCode: hotelCode as string,
      canal,
      conversacionExternaId: conversacionExternaId as string,
      mensajeExternoId: mensajeExternoId as string,
      contenido,
      tipo: textoDe(p.message_type) ?? 'text',
      enviadoEn: fechaMensaje(p.time_sent ?? p.sent_at),
      emisor,
      emisorId: textoDe(p.sender_id),
      bookingExterno: textoDe(p.booking_id),
      huespedNombre: nombre ? nombre.slice(0, MAX_NOMBRE_HUESPED) : null,
      huespedEmail: textoDe(detalle.email),
      huespedTelefono: textoDe(detalle.phone),
      adjuntos,
      esDelHotel: emisor === EMISOR_PROPIEDAD,
    },
  };
}

/**
 * Entrada de una respuesta del hotel. `bookingExterno` solo lo exige
 * Booking.com (ver `CANAL_QUE_EXIGE_RESERVA`): el contrato lo pide porque en
 * ese canal la conversación puede existir sin reserva asociada y el mensaje hay
 * que colgarlo de una.
 */
export interface EntradaRespuestaCanal {
  canal: string;
  contenido: string;
  hotelCode: string;
  conversacionExternaId: string;
  bookingExterno?: string | null;
}

export type ResultadoRespuestaCanal =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Construye el cuerpo de la respuesta al proveedor. Valida ANTES de llamar:
 * una respuesta sin hilo o sin el id de reserva que exige el canal no se manda
 * a probar suerte — el proveedor la rechazaría con un mensaje genérico y el
 * hotel se quedaría mirando una pantalla sin saber qué falta.
 */
export function construirRespuestaCanal(entrada: unknown): ResultadoRespuestaCanal {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;
  const canal = canalNormalizado(e.canal);
  const contenido = (typeof e.contenido === 'string' ? e.contenido : '').trim();
  const hotelCode = textoDe(e.hotelCode);
  const conversacionExternaId = textoDe(e.conversacionExternaId);
  const bookingExterno = textoDe(e.bookingExterno);

  if (!contenido) return { ok: false, error: 'La respuesta no puede ir vacía' };
  if (contenido.length > MAX_MENSAJE) {
    return { ok: false, error: `La respuesta no puede pasar de ${MAX_MENSAJE} caracteres` };
  }
  if (!canal) return { ok: false, error: 'Falta el canal de la conversación' };
  if (!hotelCode) return { ok: false, error: 'Falta el identificador de la propiedad en el canal' };
  if (!conversacionExternaId) return { ok: false, error: 'Falta el identificador de la conversación' };
  if (canal === CANAL_QUE_EXIGE_RESERVA && !bookingExterno) {
    return {
      ok: false,
      error: 'Este canal exige el identificador de la reserva para responder a la conversación',
    };
  }

  return {
    ok: true,
    body: {
      channel: canal,
      content: contenido,
      hotel_code: hotelCode,
      conversation_id: conversacionExternaId,
      ...(bookingExterno ? { booking_id: bookingExterno } : {}),
    },
  };
}
