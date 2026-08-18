import type { Node } from 'reactflow'

export interface NodeValidation {
  isValid: boolean
  message?: string
}

/**
 * Valida un nodo del builder de automatizaciones.
 *
 * IMPORTANTE: los campos que se comprueban deben coincidir EXACTAMENTE con
 * las claves que escriben los editores (NodeConfigPanel / ActionNode):
 *  - asignar_tag / remover_tag -> config.tag
 *  - actualizar_lead           -> config.updateField
 *  - crear_tarea               -> config.titulo
 *  - crear_cita                -> config.titulo + config.fechaHora
 *  - cambiar_etapa_lead        -> config.newStatus
 *
 * Si una clave se desincroniza, el nodo queda "incompleto" para siempre y
 * la automatización no se puede guardar aunque el usuario haya rellenado todo.
 */
export const validateNode = (node: Node): NodeValidation => {
  const config = node.data.config || {}

  switch (node.type) {
    case 'action':
      if (!config.actionType) {
        return { isValid: false, message: 'Selecciona un tipo de acción' }
      }

      switch (config.actionType) {
        case 'enviar_email':
          if (!config.subject || !config.message) {
            return { isValid: false, message: 'Completa asunto y mensaje' }
          }
          break
        case 'enviar_sms':
        case 'enviar_whatsapp':
          if (!config.message) {
            return { isValid: false, message: 'Escribe el mensaje' }
          }
          break
        case 'enviar_telegram':
          if (!config.chatId || !config.message) {
            return { isValid: false, message: 'Completa Chat ID y mensaje' }
          }
          break
        case 'cambiar_etapa_lead':
          if (!config.newStatus) {
            return { isValid: false, message: 'Selecciona el nuevo estado' }
          }
          break
        case 'actualizar_lead':
          if (!config.updateField) {
            return { isValid: false, message: 'Selecciona el campo a actualizar' }
          }
          break
        case 'asignar_tag':
        case 'remover_tag':
          if (!config.tag || !config.tag.trim()) {
            return { isValid: false, message: 'Especifica el tag' }
          }
          break
        case 'crear_tarea':
          if (!config.titulo) {
            return { isValid: false, message: 'Escribe el título de la tarea' }
          }
          break
        case 'crear_cita':
          if (!config.titulo || !config.fechaHora) {
            return { isValid: false, message: 'Completa título y fecha de la cita' }
          }
          break
      }
      break

    case 'condition':
      if (!config.field || !config.operator) {
        return { isValid: false, message: 'Configura campo y operador' }
      }
      if (config.operator !== 'vacio' && config.operator !== 'no_vacio' && !config.value) {
        return { isValid: false, message: 'Especifica el valor a comparar' }
      }
      break

    case 'delay':
      if (!config.duration || !config.unit) {
        return { isValid: false, message: 'Configura duración y unidad' }
      }
      break
  }

  return { isValid: true }
}

export const validateAllNodes = (nodes: Node[]): { isValid: boolean; invalidNodes: string[] } => {
  const invalidNodes: string[] = []

  nodes.forEach((node) => {
    if (node.type !== 'trigger') {
      const validation = validateNode(node)
      if (!validation.isValid) {
        invalidNodes.push(node.id)
      }
    }
  })

  return {
    isValid: invalidNodes.length === 0,
    invalidNodes,
  }
}
