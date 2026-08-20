import { ExecutionContext } from './types'

/**
 * Reemplaza variables de plantilla en textos de automatización.
 * Soporta variables de lead, estudiante, curso y cita.
 */
export function replaceVariables(text: string, context: ExecutionContext): string {
  if (!text) return ''

  const lead = context.lead
  const estudiante = context.estudiante
  const curso = context.curso
  const cita = context.cita

  let processed = text

  // Reemplaza primero las claves más largas ({{...}}) para que la variante de
  // llave simple ({...}) no corrompa la doble ({{nombre}} → {Bruno Hess}).
  const applyVars = (textValue: string, vars: Record<string, string>): string => {
    const entries = Object.entries(vars).sort((a, b) => b[0].length - a[0].length)
    for (const [key, value] of entries) {
      textValue = textValue.split(key).join(value)
    }
    return textValue
  }

  // Variables de lead
  if (lead) {
    const now = new Date()
    const fechaHoy = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

    const vars: Record<string, string> = {
      '{nombre}': lead.nombre || '',
      '{{nombre}}': lead.nombre || '',
      '{lead.nombre}': lead.nombre || '',
      '{{lead.nombre}}': lead.nombre || '',
      // Alias usados en plantillas de email (formato CRM)
      '{contact.first_name}': lead.nombre || '',
      '{{contact.first_name}}': lead.nombre || '',
      '{contact.firstName}': lead.nombre || '',
      '{{contact.firstName}}': lead.nombre || '',
      '{email}': lead.email || '',
      '{{email}}': lead.email || '',
      '{lead.email}': lead.email || '',
      '{{lead.email}}': lead.email || '',
      '{telefono}': lead.telefono || '',
      '{{telefono}}': lead.telefono || '',
      '{lead.telefono}': lead.telefono || '',
      '{{lead.telefono}}': lead.telefono || '',
      '{lead.estado}': lead.estado || '',
      '{{lead.estado}}': lead.estado || '',
      '{empresa}': lead.empresa || '',
      '{{empresa}}': lead.empresa || '',
      '{id_fiscal}': lead.perfilFiscal?.nif || '',
      '{{id_fiscal}}': lead.perfilFiscal?.nif || '',
      '{fecha_hoy}': fechaHoy,
      '{{fecha_hoy}}': fechaHoy,
    }

    processed = applyVars(processed, vars)
  }

  // Variables de estudiante
  if (estudiante) {
    const vars: Record<string, string> = {
      '{nombre}': estudiante.nombre || '',
      '{{nombre}}': estudiante.nombre || '',
      '{estudiante.nombre}': estudiante.nombre || '',
      '{{estudiante.nombre}}': estudiante.nombre || '',
      '{email}': estudiante.email || '',
      '{{email}}': estudiante.email || '',
      '{estudiante.email}': estudiante.email || '',
      '{{estudiante.email}}': estudiante.email || '',
      '{telefono}': estudiante.telefono || '',
      '{{telefono}}': estudiante.telefono || '',
      '{estudiante.telefono}': estudiante.telefono || '',
      '{{estudiante.telefono}}': estudiante.telefono || '',
    }

    processed = applyVars(processed, vars)
  }

  // Variables de curso
  if (curso) {
    const vars: Record<string, string> = {
      '{curso.titulo}': curso.titulo || '',
      '{{curso.titulo}}': curso.titulo || '',
      '{curso.descripcion}': curso.descripcion || '',
      '{{curso.descripcion}}': curso.descripcion || '',
    }

    processed = applyVars(processed, vars)
  }

  // Variables de cita
  if (cita) {
    const vars: Record<string, string> = {
      '{cita.fechaHora}': cita.fechaHora ? new Date(cita.fechaHora).toLocaleString('es-MX') : '',
      '{{cita.fechaHora}}': cita.fechaHora ? new Date(cita.fechaHora).toLocaleString('es-MX') : '',
      '{cita.servicio}': cita.servicio?.nombre || '',
      '{{cita.servicio}}': cita.servicio?.nombre || '',
    }

    processed = applyVars(processed, vars)
  }

  return processed
}
