import { Resend } from 'resend'
import * as jwt from 'jsonwebtoken'
import * as crypto from 'crypto'
import { notificationService } from './skills/notification-layer'
import { createSystemContext } from './skills/context'

const resend = new Resend(process.env.RESEND_API_KEY)

// Configuración del remitente
const EMAIL_FROM = 'Volkern <noreply@volkern.app>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'

// Generar token para acciones de cita
function generateCitaToken(citaId: string, action: 'confirmar' | 'cancelar' | 'reagendar'): string {
  return jwt.sign(
    { citaId, action, exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) }, // 7 días
    process.env.NEXTAUTH_SECRET || 'fallback-secret'
  )
}

/**
 * Genera un hash MD5 de los datos relevantes de la cita para detectar cambios
 * Se usa para determinar si se debe reenviar el correo de confirmación
 */
export function generateCitaEmailHash(cita: {
  fechaHora: Date
  duracion?: number
  titulo?: string | null
  servicioNombre?: string
}): string {
  const dataString = JSON.stringify({
    fechaHora: cita.fechaHora.toISOString(),
    duracion: cita.duracion || 60,
    titulo: cita.titulo || '',
    servicioNombre: cita.servicioNombre || ''
  })
  return crypto.createHash('md5').update(dataString).digest('hex')
}

export async function sendNewLeadNotification(lead: {
  nombre: string
  email: string
  telefono?: string | null
  notas?: string | null
  tenantId: string
}) {
  try {
    const context = createSystemContext(lead.tenantId);

    const body = `
      Nombre: ${lead.nombre}
      Email: ${lead.email}
      ${lead.telefono ? `Teléfono: ${lead.telefono}` : ''}
      ${lead.notas ? `Mensaje: ${lead.notas}` : ''}
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">¡Nuevo Lead Capturado!</h2>
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Nombre:</strong> ${lead.nombre}</p>
          <p><strong>Email:</strong> ${lead.email}</p>
          ${lead.telefono ? `<p><strong>Teléfono:</strong> ${lead.telefono}</p>` : ''}
          ${lead.notas ? `<p><strong>Mensaje:</strong> ${lead.notas}</p>` : ''}
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Este lead fue capturado desde tu formulario de contacto.
        </p>
      </div>
    `;

    return await notificationService.send(
      { type: 'user', email: process.env.ADMIN_EMAIL || 'admin@volkern.app' },
      { 
        subject: `Nuevo lead: ${lead.nombre}`,
        body: body,
        html: html
      },
      { 
        channel: 'email',
        priority: 'high'
      },
      context
    );
  } catch (error) {
    console.error('Error sending lead notification:', error)
    return { success: false, error: String(error) }
  }
}

// Helper para generar links de calendario
function generateCalendarLinks(cita: {
  servicio: { nombre: string; descripcion?: string | null }
  fechaHora: Date
  duracion?: number
  tenantNombre?: string
  linkReunion?: string | null
}) {
  const duracionMinutos = cita.duracion || 60
  const fechaInicio = cita.fechaHora
  const fechaFin = new Date(fechaInicio.getTime() + duracionMinutos * 60000)
  
  // Formato para Google Calendar: YYYYMMDDTHHmmssZ
  const formatGoogleDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d{3}/g, '')
  }
  
  const titulo = encodeURIComponent(cita.servicio.nombre)
  const descripcion = encodeURIComponent(
    `${cita.servicio.descripcion || ''}\n\nCita con ${cita.tenantNombre || 'el negocio'}${cita.linkReunion ? `\n\nEnlace de videollamada: ${cita.linkReunion}` : ''}`
  )
  const ubicacion = encodeURIComponent(cita.linkReunion || '')
  
  // Google Calendar
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${formatGoogleDate(fechaInicio)}/${formatGoogleDate(fechaFin)}&details=${descripcion}&location=${ubicacion}`
  
  // Outlook Web
  const outlookUrl = `https://outlook.live.com/calendar/0/action/compose?subject=${titulo}&startdt=${fechaInicio.toISOString()}&enddt=${fechaFin.toISOString()}&body=${descripcion}&location=${ubicacion}`
  
  // Yahoo Calendar
  const yahooUrl = `https://calendar.yahoo.com/?v=60&title=${titulo}&st=${formatGoogleDate(fechaInicio)}&et=${formatGoogleDate(fechaFin)}&desc=${descripcion}&in_loc=${ubicacion}`
  
  return { googleUrl, outlookUrl, yahooUrl }
}

export async function sendAppointmentConfirmation(cita: {
  id: string
  lead: { nombre: string; email: string }
  servicio: { nombre: string; descripcion?: string | null; precio: number; moneda: string }
  fechaHora: Date
  duracion?: number
  tenantNombre?: string
  linkReunion?: string | null
  tenantId: string
}) {
  try {
    const fechaFormateada = new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Mexico_City'
    }).format(cita.fechaHora)

    // Generar tokens para confirmar/cancelar/reagendar
    const tokenConfirmar = generateCitaToken(cita.id, 'confirmar')
    const tokenCancelar = generateCitaToken(cita.id, 'cancelar')
    const tokenReagendar = generateCitaToken(cita.id, 'reagendar')

    const urlConfirmar = `${APP_URL}/cita/accion?token=${tokenConfirmar}`
    const urlCancelar = `${APP_URL}/cita/accion?token=${tokenCancelar}`
    const urlReagendar = `${APP_URL}/cita/accion?token=${tokenReagendar}`

    const negocioNombre = cita.tenantNombre || 'Nuestro equipo'

    // Generar links de calendario
    const calendarLinks = generateCalendarLinks(cita)

    // Sección de Google Meet si hay enlace
    const meetSection = cita.linkReunion ? `
      <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #9333EA; text-align: center;">
        <p style="margin: 0 0 12px 0; color: #6b21a8; font-weight: bold; font-size: 16px;">📹 Cita Virtual por Google Meet</p>
        <a href="${cita.linkReunion}" style="display: inline-block; background: #9333EA; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Unirse a la videollamada
        </a>
        <p style="margin: 12px 0 0 0; color: #7c3aed; font-size: 12px;">
          ${cita.linkReunion}
        </p>
      </div>
    ` : ''

    // Sección de agregar al calendario
    const calendarSection = `
      <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #10B981; text-align: center;">
        <p style="margin: 0 0 16px 0; color: #065f46; font-weight: bold; font-size: 16px;">📅 Agregar a tu calendario</p>
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <a href="${calendarLinks.googleUrl}" target="_blank" style="display: inline-block; background: #4285F4; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">
            Google Calendar
          </a>
          <a href="${calendarLinks.outlookUrl}" target="_blank" style="display: inline-block; background: #0078D4; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">
            Outlook
          </a>
          <a href="${calendarLinks.yahooUrl}" target="_blank" style="display: inline-block; background: #6001D2; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">
            Yahoo
          </a>
        </div>
      </div>
    `

    const context = createSystemContext(cita.tenantId);

    const body = `Cita Programada: ${cita.servicio.nombre}\nFecha: ${fechaFormateada}\nCliente: ${cita.lead.nombre}`;

    return await notificationService.send(
      { type: 'lead', id: cita.id, email: cita.lead.email },
      {
        subject: `Confirmación de cita: ${cita.servicio.nombre}`,
        body: body,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1f2937; margin: 0;">📅 Cita Programada</h1>
            </div>
            
            <p style="font-size: 16px; color: #374151;">Hola <strong>${cita.lead.nombre}</strong>,</p>
            <p style="font-size: 16px; color: #374151;">Tu cita ha sido programada con los siguientes detalles:</p>
            
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #3B82F6;">
              <h2 style="margin: 0 0 16px 0; color: #1e40af; font-size: 20px;">${cita.servicio.nombre}</h2>
              ${cita.servicio.descripcion ? `<p style="color: #4b5563; margin: 0 0 12px 0;">${cita.servicio.descripcion}</p>` : ''}
              <p style="margin: 8px 0; color: #374151;"><strong>📆 Fecha:</strong> ${fechaFormateada}</p>
              <p style="margin: 8px 0; color: #374151;"><strong>💰 Precio:</strong> $${cita.servicio.precio} ${cita.servicio.moneda}</p>
            </div>
            
            ${meetSection}
            
            ${calendarSection}
            
            <div style="text-align: center; margin: 32px 0;">
              <p style="color: #6b7280; margin-bottom: 16px;">Por favor confirma tu asistencia:</p>
              <a href="${urlConfirmar}" style="display: inline-block; background: #10B981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px;">
                ✓ Confirmar Cita
              </a>
              <a href="${urlReagendar}" style="display: inline-block; background: #F59E0B; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px;">
                🔄 Reagendar Cita
              </a>
              <a href="${urlCancelar}" style="display: inline-block; background: #EF4444; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px;">
                ✕ Cancelar Cita
              </a>
            </div>
            
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 24px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚠️ Importante:</strong> Si no puedes asistir, por favor cancela con al menos 24 horas de anticipación.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Este correo fue enviado por ${negocioNombre}.<br>
              Si tienes dudas, responde a este correo o contáctanos directamente.
            </p>
          </div>
        `
      },
      {
        channel: 'email',
        priority: 'normal'
      },
      context
    );
  } catch (error) {
    console.error('Error sending appointment confirmation:', error)
    return { success: false, error: String(error) }
  }
}

export async function sendPaymentConfirmation(cita: {
  lead: { nombre: string; email: string }
  servicio: { nombre: string; precio: number; moneda: string }
  montoPagado: number
  stripePaymentId: string
  tenantId: string
}) {
  try {
    const context = createSystemContext(cita.tenantId);

    return await notificationService.send(
      { type: 'lead', email: cita.lead.email },
      {
        subject: 'Confirmación de pago recibido',
        body: `¡Pago Confirmado! Hola ${cita.lead.nombre}, hemos recibido tu pago de ${cita.montoPagado} ${cita.servicio.moneda} para el servicio ${cita.servicio.nombre}.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10B981;">¡Pago Confirmado!</h2>
            <p>Hola ${cita.lead.nombre},</p>
            <p>Hemos recibido tu pago correctamente:</p>
            
            <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #10B981;">
              <h3 style="margin-top: 0; color: #1f2937;">${cita.servicio.nombre}</h3>
              <p><strong>Monto pagado:</strong> ${cita.montoPagado} ${cita.servicio.moneda}</p>
              <p><strong>ID de transacción:</strong> ${cita.stripePaymentId}</p>
            </div>
            
            <p>Tu cita está confirmada y pagada. Recibirás un recordatorio antes de la fecha programada.</p>
            
            <p style="color: #6b7280; font-size: 14px;">
              Gracias por tu confianza en nuestros servicios.
            </p>
          </div>
        `
      },
      { channel: 'email', priority: 'normal' },
      context
    );
  } catch (error) {
    console.error('Error sending payment confirmation:', error)
    return { success: false, error: String(error) }
  }
}

// Enviar recordatorio de cita
export async function sendAppointmentReminder(cita: {
  id: string
  lead: { nombre: string; email: string }
  servicio: { nombre: string }
  fechaHora: Date
  tenantNombre?: string
  tenantId: string
}) {
  try {
    const fechaFormateada = new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Mexico_City'
    }).format(cita.fechaHora)

    const tokenCancelar = generateCitaToken(cita.id, 'cancelar')
    const urlCancelar = `${APP_URL}/cita/accion?token=${tokenCancelar}`

    const context = createSystemContext(cita.tenantId);

    return await notificationService.send(
      { type: 'lead', email: cita.lead.email },
      {
        subject: `Recordatorio: Tu cita de ${cita.servicio.nombre} es pronto`,
        body: `⏰ Recordatorio de Cita. Hola ${cita.lead.nombre}, te recordamos tu cita de ${cita.servicio.nombre} para el ${fechaFormateada}.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1f2937; margin: 0;">⏰ Recordatorio de Cita</h1>
            </div>
            
            <p style="font-size: 16px; color: #374151;">Hola <strong>${cita.lead.nombre}</strong>,</p>
            <p style="font-size: 16px; color: #374151;">Te recordamos que tienes una cita próximamente:</p>
            
            <div style="background: #fef3c7; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B; text-align: center;">
              <h2 style="margin: 0 0 8px 0; color: #92400e;">${cita.servicio.nombre}</h2>
              <p style="margin: 0; color: #78350f; font-size: 18px;"><strong>${fechaFormateada}</strong></p>
            </div>
            
            <p style="text-align: center; color: #6b7280;">
              Si no puedes asistir, por favor cancela lo antes posible:<br>
              <a href="${urlCancelar}" style="color: #EF4444;">Cancelar mi cita</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              ${cita.tenantNombre || 'Nuestro equipo'}
            </p>
          </div>
        `
      },
      { channel: 'email', priority: 'normal' },
      context
    );
  } catch (error) {
    console.error('Error sending appointment reminder:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Envía notificación al propietario del tenant cuando un cliente 
 * confirma, cancela o modifica su cita desde el correo
 */
export async function sendAppointmentStatusNotification(params: {
  ownerEmail: string
  ownerName?: string
  lead: { nombre: string; email: string }
  cita: {
    titulo?: string | null
    servicio?: string | null
    fechaHora: Date
  }
  accion: 'confirmada' | 'cancelada' | 'modificada'
  tenantNombre?: string
  tenantId: string
}) {
  try {
    const { ownerEmail, ownerName, lead, cita, accion, tenantNombre, tenantId } = params

    const context = createSystemContext(tenantId);

    const fechaFormateada = new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Mexico_City'
    }).format(cita.fechaHora)

    // Configuración según la acción
    const config = {
      confirmada: {
        emoji: '✅',
        color: '#10B981',
        bgColor: '#ecfdf5',
        borderColor: '#10B981',
        titulo: 'Cita Confirmada',
        mensaje: 'El cliente ha confirmado su asistencia a la cita.'
      },
      cancelada: {
        emoji: '❌',
        color: '#EF4444',
        bgColor: '#fef2f2',
        borderColor: '#EF4444',
        titulo: 'Cita Cancelada',
        mensaje: 'El cliente ha cancelado su cita. El horario está ahora disponible.'
      },
      modificada: {
        emoji: '📝',
        color: '#F59E0B',
        bgColor: '#fffbeb',
        borderColor: '#F59E0B',
        titulo: 'Cita Modificada',
        mensaje: 'Los datos de la cita han sido actualizados.'
      }
    }

    const c = config[accion]

    const body = `${c.emoji} ${c.titulo}: ${lead.nombre} - ${cita.servicio || cita.titulo || 'Cita'}\n${c.mensaje}\nFecha: ${fechaFormateada}`;

    return await notificationService.send(
      { type: 'user', email: ownerEmail, name: ownerName },
      {
        subject: `${c.emoji} ${c.titulo}: ${lead.nombre} - ${cita.servicio || cita.titulo || 'Cita'}`,
        body: body,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: ${c.color}; margin: 0;">${c.emoji} ${c.titulo}</h1>
            </div>
            
            <p style="font-size: 16px; color: #374151;">
              ${ownerName ? `Hola ${ownerName},` : 'Hola,'}
            </p>
            <p style="font-size: 16px; color: #374151;">${c.mensaje}</p>
            
            <div style="background: ${c.bgColor}; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid ${c.borderColor};">
              <h2 style="margin: 0 0 16px 0; color: #1f2937;">${cita.servicio || cita.titulo || 'Cita'}</h2>
              <p style="margin: 8px 0; color: #374151;"><strong>👤 Cliente:</strong> ${lead.nombre}</p>
              <p style="margin: 8px 0; color: #374151;"><strong>📧 Email:</strong> ${lead.email}</p>
              <p style="margin: 8px 0; color: #374151;"><strong>📆 Fecha:</strong> ${fechaFormateada}</p>
            </div>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${APP_URL}/dashboard/citas" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Ver en Panel de Citas
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Notificación automática de ${tenantNombre || 'Volkern CRM'}.<br>
              Esta acción fue realizada por el cliente desde su correo de confirmación.
            </p>
          </div>
        `
      },
      {
        channel: 'email',
        priority: 'high'
      },
      context
    );
  } catch (error) {
    console.error('Error sending appointment status notification:', error)
    return { success: false, error: String(error) }
  }
}
