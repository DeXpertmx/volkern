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

export const COMUNICACION_EVENTOS = [
  'confirmacion',
  'pre_llegada',
  'check_in',
  'post_salida',
  'resena',
] as const

export type ComunicacionEvento = (typeof COMUNICACION_EVENTOS)[number]

export const COMUNICACION_EVENTOS_LABEL: Record<string, string> = {
  confirmacion: 'Confirmación',
  pre_llegada: 'Pre-llegada',
  check_in: 'Check-in',
  post_salida: 'Post-salida',
  resena: 'Solicitud de reseña',
}

export const COMUNICACION_EVENTOS_DESC: Record<string, string> = {
  confirmacion: 'Al recibir una reserva nueva o confirmada',
  pre_llegada: 'Información útil antes de la llegada',
  check_in: 'Instrucciones de acceso el día del check-in',
  post_salida: 'Agradecimiento después de la salida',
  resena: 'Pedir reseña según las reglas configuradas',
}

/** Lee el nombre del huésped desde guestData (soporta formatos del seed y del webhook). */
export function guestNombre(guestData: any): string {
  if (!guestData) return ''
  return (
    guestData.nombre ||
    guestData.name ||
    [guestData.firstName, guestData.lastName].filter(Boolean).join(' ') ||
    ''
  ).trim()
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
 */
export function buildContextoPlantilla(params: {
  reserva: any
  unidad?: { nombre?: string | null } | null
  propiedad?: { nombre?: string | null } | null
}): Record<string, string> {
  const { reserva, unidad, propiedad } = params
  const gd = (reserva.guestData || {}) as any

  const checkIn = reserva.checkIn ? new Date(reserva.checkIn) : null
  const checkOut = reserva.checkOut ? new Date(reserva.checkOut) : null
  const noches = checkIn && checkOut
    ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000))
    : 0

  return {
    nombre: guestNombre(gd),
    email: guestEmail(gd),
    telefono: guestTelefono(gd),
    unidad: unidad?.nombre || '',
    propiedad: propiedad?.nombre || '',
    canal: reserva.channel || '',
    referencia: reserva.externalBookingId || reserva.id || '',
    checkIn: checkIn ? checkIn.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
    checkOut: checkOut ? checkOut.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
    noches: String(noches),
    importe: reserva.amountAfterTax != null
      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: reserva.currency || 'MXN' }).format(reserva.amountAfterTax)
      : '',
    estado: reserva.estado || '',
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
    const plantillas = await prisma.hospitalityCommunicationTemplate.findMany({
      where: { tenantId, evento, activo: true },
    })

    if (plantillas.length === 0) return []

    const contexto = buildContextoPlantilla({
      reserva,
      unidad: params.unidad || null,
      propiedad: params.propiedad || null,
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