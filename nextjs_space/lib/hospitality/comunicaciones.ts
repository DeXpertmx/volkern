/**
 * Comunicaciones de Hospitality (plan maestro §21).
 *
 * Un tenant define plantillas por evento (confirmación, pre-llegada, check-in,
 * post-salida, reseña) y canal (whatsapp|email). Al dispararse el evento se
 * reemplazan las variables {{...}} con los datos de la reserva/huésped y se
 * envía por las integraciones existentes de Volkern (sendWhatsAppMessage /
 * sendEmail). Nunca se lanza una excepción al enviar: el error queda registrado
 * en consola para auditoría y la operación que disparó sigue su curso.
 */

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/ses-email'
import { asegurarTokenCheckin, enlaceCheckin } from '@/lib/hospitality/checkin-service'
import { asegurarTokenResena, enlaceResena } from '@/lib/hospitality/resenas-service'
import { requeridasPendientes, type PreguntaCheckin } from '@/lib/hospitality/checkin-preguntas'
import {
  fechaLarga,
  idiomaDeValor,
  monedaFormateada,
  IDIOMA_POR_DEFECTO,
  IDIOMAS,
} from '@/lib/hospitality/booking-i18n'

/** Idiomas en los que existen plantillas de comunicación ("es"|"en"). */
export const IDIOMAS_COMUNICACION = IDIOMAS

export const COMUNICACION_EVENTOS = [
  'confirmacion',
  'pre_llegada',
  'check_in',
  'post_salida',
  'resena',
  'briefing_diario',
] as const

export type ComunicacionEvento = (typeof COMUNICACION_EVENTOS)[number]

export const COMUNICACION_EVENTOS_LABEL: Record<string, string> = {
  confirmacion: 'Confirmación',
  pre_llegada: 'Pre-llegada',
  check_in: 'Check-in',
  post_salida: 'Post-salida',
  resena: 'Solicitud de reseña',
  briefing_diario: 'Briefing matutino',
}

export const COMUNICACION_EVENTOS_DESC: Record<string, string> = {
  confirmacion: 'Al recibir una reserva nueva o confirmada',
  pre_llegada: 'Información útil antes de la llegada',
  check_in: 'Instrucciones de acceso el día del check-in',
  post_salida: 'Agradecimiento después de la salida',
  resena: 'Pedir reseña según las reglas configuradas',
  briefing_diario: 'Cada mañana al equipo: ocupación, llegadas, salidas, incidencias y cobros pendientes del día',
}

/**
 * Lee el nombre del huésped desde guestData (soporta formatos del seed y del
 * webhook). Solo cuando se pide un `idioma` (contexto de mensaje) la ausencia
 * de nombre cae a un respaldo legible en ese idioma ("Huésped"/"Guest") en
 * vez de un hueco en la frase; sin idioma, el contrato es el de siempre:
 * cadena vacía.
 */
export function guestNombre(guestData: any, idioma?: string): string {
  const nombre = (() => {
    if (!guestData) return ''
    return (
      guestData.nombre ||
      guestData.name ||
      [guestData.firstName, guestData.lastName].filter(Boolean).join(' ') ||
      ''
    ).trim()
  })()
  if (nombre) return nombre
  if (idioma === undefined) return ''
  return idiomaDeValor(idioma) === 'en' ? 'Guest' : 'Huésped'
}

/** Lee el email del huésped desde guestData (puede no existir en OTAs). */
export function guestEmail(guestData: any): string {
  if (!guestData) return ''
  return (guestData.email || '').trim()
}

/** Lee el teléfono del huésped desde guestData (puede no existir en OTAs). */
export function guestTelefono(guestData: any): string {
  if (!guestData) return ''
  return (guestData.telefono || guestData.phone || '').trim()
}

/**
 * Construye el contexto de variables para una plantilla a partir de una
 * reserva y (opcionalmente) su unidad y propiedad.
 *
 * Con `idioma`, las fechas y el importe se formatean al locale de ese idioma
 * ("Fri, Oct 16" / "viernes, 16 de octubre") — el resto del mensaje ya está
 * traducido por la plantilla; un fechas en otro idioma delataría el mensaje.
 */
export function buildContextoPlantilla(params: {
  reserva: any
  unidad?: { nombre?: string | null } | null
  propiedad?: { nombre?: string | null } | null
  idioma?: string | null
  /** Enlace de check-in del huésped (`{{enlace_checkin}}`). */
  enlaceCheckin?: string | null
  /** Enlace de reseña del huésped (`{{enlace_resena}}`), solo evento `resena`. */
  enlaceResena?: string | null
  /**
   * Preguntas obligatorias del hotel que el huésped aún no ha respondido
   * (`{{preguntas_pendientes}}`), ya calculadas con las reglas del módulo
   * puro y en el idioma del mensaje. Vacía si no hay nada pendiente: la
   * variable desaparece del mensaje en vez de dejar la lista vacía.
   */
  preguntasPendientes?: string[]
}): Record<string, string> {
  const { reserva, unidad, propiedad } = params
  const idioma = idiomaDeValor(params.idioma)
  const gd = (reserva.guestData || {}) as any

  const noches = reserva.checkIn && reserva.checkOut
    ? Math.max(0, Math.round((new Date(reserva.checkOut).getTime() - new Date(reserva.checkIn).getTime()) / 86400000))
    : 0

  return {
    nombre: guestNombre(gd, idioma),
    email: guestEmail(gd),
    telefono: guestTelefono(gd),
    unidad: unidad?.nombre || '',
    propiedad: propiedad?.nombre || '',
    canal: reserva.channel || '',
    referencia: reserva.externalBookingId || reserva.id || '',
    checkIn: fechaLarga(reserva.checkIn, idioma),
    checkOut: fechaLarga(reserva.checkOut, idioma),
    noches: String(noches),
    importe: monedaFormateada(reserva.amountAfterTax, reserva.currency, idioma),
    estado: reserva.estado || '',
    // El enlace con el que el huésped completa los documentos de su grupo: es
    // lo que cierra el registro de viajeros sin que nadie del hotel lo pida.
    // Si por lo que sea no se pudo generar, queda vacío en vez de dejar un
    // `{{enlace_checkin}}` literal en el mensaje.
    enlace_checkin: params.enlaceCheckin || '',
    // El enlace con el que valora su estancia (solicitud §21). Si no se pudo
    // generar, queda vacío en vez de dejar un `{{enlace_resena}}` literal.
    enlace_resena: params.enlaceResena || '',
    // Las preguntas obligatorias del hotel que faltan, separadas por «; » —
    // el mismo delimitador que el saneado del módulo corta dentro de cada
    // texto, para que ningún texto del hotel fabrique líneas nuevas.
    preguntas_pendientes: (params.preguntasPendientes || []).join('; '),
  }
}

/** Reemplaza {{variable}} en el contenido con el contexto dado. */
export function renderPlantilla(contenido: string, contexto: Record<string, string>): string {
  return contenido.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    return key in contexto && contexto[key] !== undefined ? contexto[key] : match
  })
}

export type ResultadoComunicacion =
  | { ok: true; canal: string; destinatario: string }
  | { ok: false; error: string; canal: string; destinatario: string }

/**
 * Envía una plantilla renderizada por su canal. Devuelve un resultado sin
 * lanzar excepciones (la auditoría del error queda en consola).
 */
export async function enviarComunicacion(params: {
  tenantId: string
  canal: string
  asunto?: string | null
  contenido: string
  destinatario: string // email o teléfono
}): Promise<ResultadoComunicacion> {
  const { tenantId, canal, asunto, contenido, destinatario } = params

  if (!destinatario) {
    return { ok: false, error: 'El huésped no tiene destinatario (email/teléfono) para este canal', canal, destinatario: '' }
  }

  try {
    if (canal === 'email') {
      const res = await sendEmail({
        to: destinatario,
        subject: asunto || 'Comunicación de tu estancia',
        html: contenido.split('\n').map((l) => `<p>${l}</p>`).join(''),
        text: contenido,
        tenantId,
      })
      if (!res.success) {
        return { ok: false, error: res.error || 'Error enviando email', canal, destinatario }
      }
      return { ok: true, canal, destinatario }
    }

    // WhatsApp. Los mensajes al huésped son transaccionales y no deben
    // perderse: si el tenant NO ha conectado su propio WhatsApp, se envían
    // desde el número oficial de la plataforma (misma política que ya usan
    // las notificaciones). Cuando el tenant conecte el suyo, ese tiene
    // prioridad dentro de sendWhatsAppMessage y el respaldo no se usa.
    //
    // OJO: sendWhatsAppMessage NO lanza: devuelve { success: false, error }.
    // Ignorar ese resultado reportaba como enviado un mensaje que nunca salió.
    const res: any = await sendWhatsAppMessage(destinatario, contenido, tenantId, true)
    if (!res?.success) {
      return {
        ok: false,
        error: res?.error || 'Error enviando WhatsApp (respuesta sin éxito)',
        canal,
        destinatario,
      }
    }
    return { ok: true, canal: 'whatsapp', destinatario }
  } catch (err: any) {
    console.error('[Hospitality Comunicaciones] Error enviando:', err?.message || err)
    return { ok: false, error: err?.message || 'Error desconocido al enviar', canal, destinatario }
  }
}

/**
 * Carga la reserva (con unidad y propiedad) y dispara el evento. Conveniente
 * para llamar desde webhooks/operaciones con solo el id de la reserva.
 * No lanza errores (el try/catch interno la convierte en un fallo silencioso
 * registrado en consola).
 */
export async function dispararComunicacionReserva(params: {
  tenantId: string
  reservationId: string
  evento: ComunicacionEvento | string
}): Promise<Array<{ templateId: string; evento: string; canal: string; ok: boolean; error?: string }>> {
  try {
    const { tenantId, reservationId, evento } = params
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId },
      include: {
        unit: { select: { nombre: true } },
        property: { select: { nombre: true } },
      },
    })
    if (!reserva) return []
    return await dispararComunicacionPorEvento({
      tenantId,
      evento,
      reserva,
      unidad: reserva.unit,
      propiedad: reserva.property,
    })
  } catch (err: any) {
    console.error('[Hospitality Comunicaciones] Error disparando evento por reserva:', err?.message || err)
    return []
  }
}

/**
 * Dispara la plantilla activa del tenant para un evento concreto usando una
 * reserva ya persistida. No lanza errores: cada plantilla activa se intenta
 * enviar y el resultado se registra. Devuelve el detalle de lo intentado.
 */
export async function dispararComunicacionPorEvento(params: {
  tenantId: string
  evento: ComunicacionEvento | string
  reserva: any
  unidad?: { nombre?: string | null } | null
  propiedad?: { nombre?: string | null } | null
}): Promise<Array<{ templateId: string; evento: string; canal: string; ok: boolean; error?: string }>> {
  const { tenantId, evento, reserva } = params

  try {
    // El idioma del mensaje es el idioma en que reservó el huésped
    // (guestData.idioma, lo escribe la página pública). "es" es el defecto:
    // OTA y reservas manuales sin idioma reciben español.
    const idioma = idiomaDeValor((reserva.guestData || {})?.idioma)
    let plantillas = await prisma.hospitalityCommunicationTemplate.findMany({
      where: { tenantId, evento, activo: true, idioma },
    })
    if (plantillas.length === 0 && idioma !== IDIOMA_POR_DEFECTO) {
      // El huésped SIEMPRE recibe el mensaje: si el hotel no tradujo esta
      // plantilla, cae al español en vez de quedarse sin aviso.
      plantillas = await prisma.hospitalityCommunicationTemplate.findMany({
        where: { tenantId, evento, activo: true, idioma: IDIOMA_POR_DEFECTO },
      })
    }
    if (plantillas.length === 0) return []

    // El enlace de check-in se genera en el momento de enviar (y se guarda en la
    // reserva la primera vez): así lo tienen también las reservas que llegaron
    // por canal o que son anteriores a esta función. Si falla, el mensaje sale
    // igual sin enlace — una comunicación nunca debe caerse por esto.
    let enlace: string | null = null
    try {
      const token = await asegurarTokenCheckin({ id: reserva.id, tokenCheckin: reserva.tokenCheckin })
      enlace = enlaceCheckin(token, idioma)
    } catch (err: any) {
      console.error('[Hospitality Comunicaciones] No se pudo preparar el enlace de check-in:', err?.message || err)
    }

    // Enlace de reseña: SOLO para la solicitud post-salida (evento `resena`) —
    // generar token en cada comunicación escribiría en BD sin motivo. Misma
    // política que el check-in: si falla, el mensaje sale igual sin enlace.
    let enlaceReview: string | null = null
    if (evento === 'resena') {
      try {
        const tokenReview = await asegurarTokenResena({ id: reserva.id, tokenResena: reserva.tokenResena })
        enlaceReview = enlaceResena(tokenReview, idioma)
      } catch (err: any) {
        console.error('[Hospitality Comunicaciones] No se pudo preparar el enlace de reseña:', err?.message || err)
      }
    }

    // Preguntas obligatorias del hotel sin responder (`{{preguntas_pendientes}}`):
    // la pre-llegada es el momento de pedirlas — el huésped aún no ha llegado y
    // el enlace sigue abierto. Solo ACTIVE (el formulario no pregunta lo
    // desactivado) y solo REQUERIDAS (un recordatorio con cinco cosas no se lee).
    // Auxiliar: si la consulta falla, el mensaje sale sin el recordatorio —
    // perder el mensaje entero por una lista no.
    let pendientes: string[] = []
    try {
      const [preguntasCrudas, reservasActualizadas] = await Promise.all([
        prisma.hospitalityCheckinPregunta.findMany({
          where: { tenantId, activa: true, requerida: true },
          orderBy: [{ orden: 'asc' }, { fechaCreacion: 'asc' }],
        }),
        Promise.resolve(reserva),
      ])
      const preguntas: PreguntaCheckin[] = preguntasCrudas.map((p) => ({
        id: p.id,
        tipo: (typeof p.tipo === 'string' && ['texto', 'opcion', 'numero', 'fecha'].includes(p.tipo)
          ? p.tipo
          : 'texto') as PreguntaCheckin['tipo'],
        es: String(p.es ?? ''),
        en: String(p.en ?? ''),
        opciones: null,
        requerida: p.requerida === true,
        orden: p.orden ?? 0,
      }))
      pendientes = requeridasPendientes(
        preguntas,
        (reservasActualizadas.respuestasCheckin ?? null) as Record<string, string> | null,
        idioma
      ).map((p) => p.saneado)
    } catch (err: any) {
      console.error('[Hospitality Comunicaciones] No se pudieron leer las preguntas del check-in:', err?.message || err)
    }

    const contexto = buildContextoPlantilla({
      reserva,
      unidad: params.unidad || null,
      propiedad: params.propiedad || null,
      idioma,
      enlaceCheckin: enlace,
      enlaceResena: enlaceReview,
      preguntasPendientes: pendientes,
    })

    const resultados: Array<{ templateId: string; evento: string; canal: string; ok: boolean; error?: string }> = []

    for (const t of plantillas) {
      const contenido = renderPlantilla(t.contenido, contexto)
      const asunto = t.asunto ? renderPlantilla(t.asunto, contexto) : t.asunto
      const gd = (reserva.guestData || {}) as any
      const destinatario = t.canal === 'email' ? guestEmail(gd) : guestTelefono(gd)

      const res = await enviarComunicacion({
        tenantId,
        canal: t.canal,
        asunto,
        contenido,
        destinatario,
      })

      resultados.push({
        templateId: t.id,
        evento,
        canal: t.canal,
        ok: res.ok,
        error: res.ok ? undefined : res.error,
      })
    }

    return resultados
  } catch (err: any) {
    console.error('[Hospitality Comunicaciones] Error disparando evento:', err?.message || err)
    return [{ templateId: '', evento, canal: '', ok: false, error: err?.message || 'Error interno' }]
  }
}