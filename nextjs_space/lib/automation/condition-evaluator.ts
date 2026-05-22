import { ExecutionContext } from './types'

/**
 * Evalúa una condición de automatización contra el contexto de ejecución.
 * Soporta operadores de igualdad, texto, existencia, numéricos, fecha, arrays y booleanos.
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

  if (!entity) return false

  const fieldValue = entity[field]

  switch (operator) {
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
