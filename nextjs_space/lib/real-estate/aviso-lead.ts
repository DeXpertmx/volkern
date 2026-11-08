/**
 * Aviso por email al equipo cuando entra un lead desde el widget embebible.
 *
 * Un lead que solo aparece en el CRM se pierde: nadie entra al panel a mirar
 * cada rato, y el visitante que dejó su teléfono en la web del cliente espera
 * una llamada. Este módulo manda el aviso en el momento, con los datos de
 * contacto, el mensaje y la propiedad, para que el equipo responda desde su
 * bandeja de entrada con un «Responder» normal (`replyTo` es el email del
 * visitante).
 *
 * Destinatarios: los usuarios del tenant que pueden ver leads; si ninguno tiene
 * ese permiso explícito, los administradores; si no hay usuarios, el email de
 * facturación de la cuenta. Se acota a 5 para que un equipo grande no convierta
 * cada consulta en una ráfaga de correos.
 *
 * Nunca lanza: un fallo de correo no puede tumbar un formulario público que ya
 * creó el lead. Lo que sí hace es devolver y registrar cada error.
 */

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/ses-email'
import { hasPermisoDeRol } from '@/lib/permissions-core'

/** Tope de destinatarios por aviso: una consulta no debe ser una ristra de correos. */
export const MAX_DESTINATARIOS = 5

/** Roles que se consideran «el equipo» cuando ningún rol declara el permiso. */
const ROLES_ADMIN = ['Admin', 'admin', 'Administrador', 'administrator', 'Superadmin', 'superadmin']

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/+$/, '')
}

/** Escapa el texto del visitante antes de meterlo en el HTML del correo. */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface AvisoLeadWidget {
  tenantId: string
  tenantName?: string | null
  tenantSubdomain?: string | null
  leadId?: string | null
  nombre: string
  email: string
  telefono?: string | null
  mensaje?: string | null
  propiedad?: { id: string; nombre: string } | null
  /** Consentimiento de contacto aceptado en el formulario. */
  consentimiento?: boolean
  /** Página del cliente donde estaba el widget. */
  origenUrl?: string | null
}

/**
 * A quién se avisa del lead: primero quien puede ver leads, luego los
 * administradores y, como último recurso, el email de facturación de la cuenta.
 */
export async function destinatariosAvisoLead(tenantId: string): Promise<string[]> {
  try {
    const usuarios = await prisma.user.findMany({
      where: { tenantId, estado: 'activo' },
      select: { email: true, role: { select: { nombre: true, permisos: true } } },
      take: 100,
    })

    let emails = usuarios
      .filter((usuario) => hasPermisoDeRol(usuario.role as never, 'leads', 'ver'))
      .map((usuario) => usuario.email)

    if (emails.length === 0) {
      emails = usuarios
        .filter((usuario) => ROLES_ADMIN.includes(usuario.role?.nombre ?? ''))
        .map((usuario) => usuario.email)
    }

    if (emails.length === 0) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { billingEmail: true },
      })
      if (tenant?.billingEmail) emails = [tenant.billingEmail]
    }

    return [...new Set(emails.filter((email) => Boolean(email && email.trim())))].slice(
      0,
      MAX_DESTINATARIOS
    )
  } catch (error) {
    console.error('[Aviso lead widget] No se pudieron resolver los destinatarios:', error)
    return []
  }
}

/** Asunto y cuerpos (HTML y texto) del aviso, ya con los datos escapados. */
export function construirAviso(aviso: AvisoLeadWidget): {
  subject: string
  html: string
  text: string
} {
  const propiedad = aviso.propiedad?.nombre?.trim()
  const subject = propiedad
    ? `Nuevo lead desde el widget: ${propiedad}`
    : 'Nuevo lead desde el widget de propiedades'

  const cuando = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  const enlaceLead = aviso.leadId ? `${appUrl()}/dashboard/leads/${aviso.leadId}` : `${appUrl()}/dashboard/leads`

  const filas: Array<[string, string]> = [
    ['Nombre', aviso.nombre],
    ['Email', aviso.email],
    ['Teléfono', aviso.telefono?.trim() || '—'],
    ['Propiedad', propiedad || '—'],
    ['Mensaje', aviso.mensaje?.trim() || '—'],
    ['Consentimiento', aviso.consentimiento ? 'Aceptado' : 'No registrado'],
    ['Cuándo', cuando],
  ]
  if (aviso.origenUrl) filas.push(['Visto en', aviso.origenUrl])

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;line-height:1.5">
    <h2 style="margin:0 0 4px;font-size:18px">Nuevo lead desde el widget</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px">
      Alguien ha pedido información${propiedad ? ` sobre <strong>${escaparHtml(propiedad)}</strong>` : ''}.
      Responde a este correo para contestarle directamente.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
      ${filas
        .map(
          ([etiqueta, valor]) => `<tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${etiqueta}</td>
        <td style="padding:6px 0;white-space:pre-wrap">${escaparHtml(valor)}</td>
      </tr>`
        )
        .join('')}
    </table>
    <p style="margin:20px 0 0">
      <a href="${enlaceLead}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-size:14px">
        Ver el lead en el CRM
      </a>
    </p>
  </div>`.trim()

  const text = [
    'Nuevo lead desde el widget',
    '',
    ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    '',
    `Ver el lead en el CRM: ${enlaceLead}`,
  ].join('\n')

  return { subject, html, text }
}

/**
 * Envía el aviso del lead al equipo del tenant. Nunca lanza: devuelve cuántos
 * correos salieron y los errores de los que no.
 */
export async function avisarLeadDesdeWidget(aviso: AvisoLeadWidget): Promise<{
  destinatarios: number
  enviados: number
  errores: string[]
}> {
  const destinatarios = await destinatariosAvisoLead(aviso.tenantId)
  if (destinatarios.length === 0) {
    console.warn(
      `[Aviso lead widget] El tenant ${aviso.tenantId} no tiene a quién avisar (sin usuarios con permiso de leads ni email de facturación)`
    )
    return { destinatarios: 0, enviados: 0, errores: [] }
  }

  const { subject, html, text } = construirAviso(aviso)

  const resultados = await Promise.allSettled(
    destinatarios.map(async (destinatario) => {
      const resultado = await sendEmail({
        to: destinatario,
        subject,
        html,
        text,
        // El equipo responde al visitante con un «Responder» normal.
        replyTo: aviso.email,
        tenantId: aviso.tenantId,
        tenantSubdomain: aviso.tenantSubdomain || undefined,
      })
      if (!resultado.success) {
        throw new Error(`${destinatario}: ${resultado.error || 'envío fallido'}`)
      }
      return destinatario
    })
  )

  const errores: string[] = []
  let enviados = 0
  for (const resultado of resultados) {
    if (resultado.status === 'fulfilled') enviados += 1
    else errores.push(String(resultado.reason?.message || resultado.reason))
  }

  if (errores.length > 0) {
    console.error(`[Aviso lead widget] ${errores.length} envío/s fallaron:`, errores.join(' | '))
  }
  console.log(
    `[Aviso lead widget] Lead ${aviso.leadId || '(sin id)'} de ${aviso.tenantName || aviso.tenantId}: ${enviados}/${destinatarios.length} aviso/s enviados`
  )

  return { destinatarios: destinatarios.length, enviados, errores }
}
