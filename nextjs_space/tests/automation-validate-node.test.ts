import { describe, it, expect } from 'vitest'
import { validateNode, validateAllNodes } from '../lib/automation/validate-node'
import type { Node } from 'reactflow'

function makeNode(type: string, config: any): Node {
  return {
    id: 'n1',
    type,
    position: { x: 0, y: 0 },
    data: { config },
  } as Node
}

describe('validateNode - action nodes', () => {
  it('requiere un tipo de acción', () => {
    const res = validateNode(makeNode('action', {}))
    expect(res.isValid).toBe(false)
    expect(res.message).toBe('Selecciona un tipo de acción')
  })

  it('asignar_tag es válido con config.tag (la clave que escribe el panel)', () => {
    const res = validateNode(makeNode('action', { actionType: 'asignar_tag', tag: 'VIP' }))
    expect(res.isValid).toBe(true)
  })

  it('asignar_tag sigue inválido si el tag está vacío o solo espacios', () => {
    expect(validateNode(makeNode('action', { actionType: 'asignar_tag' })).isValid).toBe(false)
    expect(validateNode(makeNode('action', { actionType: 'asignar_tag', tag: '   ' })).isValid).toBe(false)
    expect(validateNode(makeNode('action', { actionType: 'asignar_tag', tag: '' })).message).toBe('Especifica el tag')
  })

  it('asignar_tag NO depende de la llave vieja tagName', () => {
    // Regression: antes se validaba config.tagName, que el panel nunca escribe
    const res = validateNode(makeNode('action', { actionType: 'asignar_tag', tagName: 'VIP' }))
    expect(res.isValid).toBe(false)
  })

  it('remover_tag también se valida con config.tag', () => {
    expect(validateNode(makeNode('action', { actionType: 'remover_tag', tag: 'Antiguo' })).isValid).toBe(true)
    expect(validateNode(makeNode('action', { actionType: 'remover_tag' })).isValid).toBe(false)
  })

  it('actualizar_lead es válido con config.updateField (la clave que escribe el panel)', () => {
    const res = validateNode(makeNode('action', { actionType: 'actualizar_lead', updateField: 'email', updateValue: 'x@y.com' }))
    expect(res.isValid).toBe(true)
  })

  it('actualizar_lead no depende de newStatus', () => {
    // Regression: antes compartía la validación de cambiar_etapa_lead (newStatus) y nunca era válido
    const res = validateNode(makeNode('action', { actionType: 'actualizar_lead', newStatus: 'nuevo' }))
    expect(res.isValid).toBe(false)
    expect(validateNode(makeNode('action', { actionType: 'actualizar_lead' })).message).toBe('Selecciona el campo a actualizar')
  })

  it('cambiar_etapa_lead se valida con newStatus', () => {
    expect(validateNode(makeNode('action', { actionType: 'cambiar_etapa_lead', newStatus: 'contactado' })).isValid).toBe(true)
    expect(validateNode(makeNode('action', { actionType: 'cambiar_etapa_lead' })).isValid).toBe(false)
  })

  it('crear_tarea es válido con config.titulo (la clave que escribe el panel)', () => {
    expect(validateNode(makeNode('action', { actionType: 'crear_tarea', titulo: 'Llamar' })).isValid).toBe(true)
    expect(validateNode(makeNode('action', { actionType: 'crear_tarea' })).message).toBe('Escribe el título de la tarea')
  })

  it('crear_tarea no depende de la llave vieja taskTitle', () => {
    const res = validateNode(makeNode('action', { actionType: 'crear_tarea', taskTitle: 'Llamar' }))
    expect(res.isValid).toBe(false)
  })

  it('crear_cita requiere título y fecha', () => {
    expect(validateNode(makeNode('action', { actionType: 'crear_cita', titulo: 'Demo', fechaHora: '2026-08-20T10:00' })).isValid).toBe(true)
    expect(validateNode(makeNode('action', { actionType: 'crear_cita', titulo: 'Demo' })).isValid).toBe(false)
  })

  it('mensajes: email requiere asunto y mensaje, whatsapp solo mensaje', () => {
    expect(validateNode(makeNode('action', { actionType: 'enviar_email', subject: 'Hola', message: 'Mundo' })).isValid).toBe(true)
    expect(validateNode(makeNode('action', { actionType: 'enviar_email', subject: 'Hola' })).isValid).toBe(false)
    expect(validateNode(makeNode('action', { actionType: 'enviar_whatsapp', message: 'Hola' })).isValid).toBe(true)
  })
})

describe('validateNode - condition y delay', () => {
  it('condición requiere campo, operador y valor (salvo vacio/no_vacio)', () => {
    expect(validateNode(makeNode('condition', { field: 'nombre', operator: 'igual', value: 'Juan' })).isValid).toBe(true)
    expect(validateNode(makeNode('condition', { field: 'nombre', operator: 'igual' })).isValid).toBe(false)
    expect(validateNode(makeNode('condition', { field: 'tags', operator: 'vacio' })).isValid).toBe(true)
  })

  it('delay requiere duración y unidad', () => {
    expect(validateNode(makeNode('delay', { duration: 2, unit: 'hours' })).isValid).toBe(true)
    expect(validateNode(makeNode('delay', { duration: 2 })).isValid).toBe(false)
  })
})

describe('validateAllNodes', () => {
  it('ignora los nodos trigger', () => {
    const nodes = [makeNode('trigger', {})]
    const res = validateAllNodes(nodes)
    expect(res.isValid).toBe(true)
    expect(res.invalidNodes).toEqual([])
  })

  it('reporta los ids de los nodos inválidos', () => {
    const a = { ...makeNode('action', { actionType: 'asignar_tag', tag: 'VIP' }), id: 'ok' }
    const b = { ...makeNode('action', { actionType: 'asignar_tag' }), id: 'bad' }
    const res = validateAllNodes([a, b])
    expect(res.isValid).toBe(false)
    expect(res.invalidNodes).toEqual(['bad'])
  })

  it('una automatización con asignar_tag completo pasa la validación completa', () => {
    const nodes = [
      makeNode('trigger', {}),
      { ...makeNode('action', { actionType: 'asignar_tag', tag: 'Nuevo Ingreso' }), id: 'a1' },
      { ...makeNode('action', { actionType: 'enviar_email', subject: 'Bienvenido', message: 'Hola' }), id: 'a2' },
    ]
    expect(validateAllNodes(nodes).isValid).toBe(true)
  })
})
