import { ExecutionContext } from './types'

/**
 * Normaliza un nombre de campo de la UI (ej: contact.tags, form.formName) al
 * path real dentro del contexto. La UI guarda prefijos como `contact.` o
 * `form.` que NO existen como propiedades directas del lead, así que se
 * resuelven aquí antes de evaluar.
 */
function resolveFieldValue(field: string, entity: any, context: ExecutionContext): any {
  const f = String(field || '')

  // Campos del formulario web (trigger 'formulario_enviado')
  if (f.startsWith('form.')) {
    const formKey = f.slice('form.'.length)
    const formData = (context as any).form || {}
    if (formKey === 'formName') return (context as any).formName
    if (formKey === 'formId') return (context as any).formId
    if (formKey === 'submissionId') return (context as any).submissionId
    if (formData && formKey in formData) return formData[formKey]
    return undefined
  }

  // Campos de lead con prefijo contact. → propiedad real del lead
  if (f.startsWith('contact.')) {
    const leadKey = f.slice('contact.'.length)
    const aliasMap: Record<string, string> = {
      name: 'nombre',
      first_name: 'nombre',
      email: 'email',
      phone: 'telefono',
      company: 'empresa',
      source: 'fuente',
      channel: 'canal',
      score: 'scoreValue',
      tags: 'tags',
      pipeline_stage: 'estado',
      estado: 'estado',
      city: 'ciudad',
      country: 'pais',
    }
    const realKey = aliasMap[leadKey] || leadKey
    return entity ? entity[realKey] : undefined
  }

  // Campo directo (sin prefijo) contra la entidad
  if (entity && f in entity) return entity[f]

  // Sin prefijo: probar alias de lead directamente
  const directAliases: Record<string, string> = {
    source: 'fuente',
    channel: 'canal',
    score: 'scoreValue',
    name: 'nombre',
    phone: 'telefono',
    company: 'empresa',
  }
  if (entity && directAliases[f]) return entity[directAliases[f]]

  return undefined
}

/**
 * Evalúa una condición de automatización contra el contexto de ejecución.
 * Soporta operadores de igualdad, texto, existencia, numéricos, fecha, arrays y booleanos.
 * Acepta tanto los operadores de la UI (equals, contains, exists...) como los
 * históricos en español (igual, contiene, vacio...).
 */
export function evaluateCondition(config: any, context: ExecutionContext): boolean {
  const { field, operator, value, conditionType = 'lead' } = config

  // Determinar qué entidad evaluar
  let entity: any = null
  switch (conditionType) {
    case 'lead':
      entity = context.lead
      break
    case 'estudiante':
      entity = context.estudiante
      break
    case 'curso':
      entity = context.curso
      break
    case 'cita':
      entity = context.cita
      break
    case 'inscripcion':
      entity = context.inscripcion
      break
    default:
      entity = context.lead
  }

  if (!entity && !String(field || '').startsWith('form.')) return false

  const fieldValue = resolveFieldValue(field, entity, context)

  // Alias de operadores de la UI → operadores del evaluador
  const opAliases: Record<string, string> = {
    'equals': 'igual',
    'not_equals': 'diferente',
    'contains': 'contiene',
    'not_contains': 'no_contiene',
    'starts_with': 'empieza_con',
    'ends_with': 'termina_con',
    'exists': 'no_vacio',
    'not_exists': 'vacio',
    'gt': 'mayor_que',
    'lt': 'menor_que',
    'gte': 'mayor_igual',
    'lte': 'menor_igual',
    'greater_than': 'mayor_que',
    'less_than': 'menor_que',
    'includes': 'incluye',
    'not_includes': 'no_incluye',
    'is_true': 'es_verdadero',
    'is_false': 'es_falso',
    'before': 'antes_de',
    'after': 'despues_de',
  }
  const op = opAliases[operator] || operator

  switch (op) {
    // Operadores de igualdad
    case 'igual':
      return fieldValue === value
    case 'diferente':
      return fieldValue !== value

    // Operadores de texto
    case 'contiene':
      return fieldValue?.toString().toLowerCase().includes(value?.toLowerCase())
    case 'no_contiene':
      return !fieldValue?.toString().toLowerCase().includes(value?.toLowerCase())
    case 'empieza_con':
      return fieldValue?.toString().toLowerCase().startsWith(value?.toLowerCase())
    case 'termina_con':
      return fieldValue?.toString().toLowerCase().endsWith(value?.toLowerCase())

    // Operadores de existencia
    case 'vacio':
      return !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined
    case 'no_vacio':
      return !!fieldValue && fieldValue !== ''

    // Operadores numéricos
    case 'mayor_que':
      return parseFloat(fieldValue) > parseFloat(value)
    case 'menor_que':
      return parseFloat(fieldValue) < parseFloat(value)
    case 'mayor_igual':
      return parseFloat(fieldValue) >= parseFloat(value)
    case 'menor_igual':
      return parseFloat(fieldValue) <= parseFloat(value)

    // Operadores de fecha
    case 'antes_de':
      return new Date(fieldValue) < new Date(value)
    case 'despues_de':
      return new Date(fieldValue) > new Date(value)
    case 'entre_fechas': {
      const date = new Date(fieldValue)
      const startDate = new Date(config.startDate)
      const endDate = new Date(config.endDate)
      return date >= startDate && date <= endDate
    }
    case 'ultimos_x_dias': {
      const date = new Date(fieldValue)
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - parseInt(value))
      return date >= daysAgo
    }

    // Operadores de arrays y tags
    case 'incluye':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value)
      }
      if (typeof fieldValue === 'string') {
        const items = fieldValue.split(',').map((i: string) => i.trim())
        return items.includes(value)
      }
      return false
    case 'no_incluye':
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(value)
      }
      if (typeof fieldValue === 'string') {
        const items = fieldValue.split(',').map((i: string) => i.trim())
        return !items.includes(value)
      }
      return true

    // Operadores booleanos
    case 'es_verdadero':
      return fieldValue === true || fieldValue === 'true' || fieldValue === 1
    case 'es_falso':
      return fieldValue === false || fieldValue === 'false' || fieldValue === 0

    default:
      return false
  }
}
