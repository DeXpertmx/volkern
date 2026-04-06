export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface TestStep {
  nodeId: string
  nodeType: string
  label: string
  action?: string
  status: 'pending' | 'simulated' | 'skipped' | 'error'
  simulatedResult?: any
  message?: string
  duration?: number
}

interface TestResult {
  automationId: string
  testMode: true
  trigger: string
  startedAt: string
  completedAt: string
  totalSteps: number
  executedSteps: number
  skippedSteps: number
  steps: TestStep[]
  context: Record<string, any>
  warnings: string[]
}

/**
 * POST /api/automatizaciones/test
 * Ejecuta una automatización en modo de prueba (sin ejecutar acciones reales)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { automationId, mockContext } = body

    if (!automationId) {
      return NextResponse.json(
        { error: 'automationId es requerido' },
        { status: 400 }
      )
    }

    // Obtener la automatización
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    })

    if (!automation) {
      return NextResponse.json(
        { error: 'Automatización no encontrada' },
        { status: 404 }
      )
    }

    const flowData = automation.flowData as any
    const nodes = flowData?.nodes || []
    const edges = flowData?.edges || []

    // Crear contexto de prueba con datos mock
    const testContext = {
      tenantId: (session.user as any).tenantId || 'test-tenant',
      leadId: mockContext?.leadId || 'mock-lead-123',
      lead: mockContext?.lead || {
        id: 'mock-lead-123',
        nombre: 'Juan Pérez (Test)',
        email: 'juan.test@example.com',
        telefono: '+52 555 123 4567',
        empresa: 'Empresa Test S.A.',
        estado: 'nuevo',
        scoreValue: 65,
        tags: ['test', 'demo'],
      },
      cita: mockContext?.cita || null,
      estudiante: mockContext?.estudiante || null,
      workflowId: mockContext?.workflowId || null,
      workflowName: mockContext?.workflowName || 'Test Workflow',
      ...mockContext,
    }

    const startTime = Date.now()
    const steps: TestStep[] = []
    const warnings: string[] = []

    // Simular ejecución de cada nodo
    const nodeMap = new Map<string, any>(nodes.map((n: any) => [n.id, n]))
    const processedNodes = new Set<string>()

    // Encontrar nodo trigger
    const triggerNode = nodes.find((n: any) => n.type === 'trigger')
    if (!triggerNode) {
      warnings.push('No se encontró nodo de trigger')
    } else {
      steps.push({
        nodeId: triggerNode.id,
        nodeType: 'trigger',
        label: triggerNode.data?.label || 'Trigger',
        status: 'simulated',
        message: `Trigger "${automation.trigger}" activado`,
        duration: 1,
      })
      processedNodes.add(triggerNode.id)
    }

    // Recorrer el flujo
    const queue = triggerNode ? [triggerNode.id] : []
    
    while (queue.length > 0) {
      const currentId = queue.shift()!
      
      // Encontrar nodos conectados
      const outgoingEdges = edges.filter((e: any) => e.source === currentId)
      
      for (const edge of outgoingEdges) {
        const targetNode = nodeMap.get(edge.target) as any
        if (!targetNode || processedNodes.has(edge.target)) continue

        processedNodes.add(edge.target)
        const step = simulateNode(targetNode, testContext, edge.label)
        steps.push(step)

        // Si es condición, verificar qué rama seguir
        if (targetNode.type === 'condition') {
          const conditionResult = evaluateCondition(targetNode, testContext)
          step.simulatedResult = { conditionMet: conditionResult }
          step.message = conditionResult 
            ? 'Condición evaluada: VERDADERO' 
            : 'Condición evaluada: FALSO'

          // Solo agregar la rama correcta a la cola
          const branchEdges = edges.filter((e: any) => e.source === targetNode.id)
          const matchingEdge = branchEdges.find((e: any) => 
            conditionResult ? e.label === 'Sí' : e.label === 'No'
          )
          if (matchingEdge) {
            queue.push(targetNode.id)
          }
        } else {
          queue.push(edge.target)
        }
      }
    }

    // Verificar configuraciones faltantes
    for (const step of steps) {
      if (step.nodeType === 'action') {
        const node = nodeMap.get(step.nodeId) as any
        const config = node?.data?.config || {}

        if (config.actionType === 'ejecutar_workflow' && !config.workflowId) {
          warnings.push(`Nodo "${step.label}": No tiene workflow n8n configurado`)
        }
        if (config.actionType === 'webhook_externo_seguro' && !config.url) {
          warnings.push(`Nodo "${step.label}": No tiene URL de webhook configurada`)
        }
        if (config.actionType === 'enviar_email' && !config.subject && !config.asunto) {
          warnings.push(`Nodo "${step.label}": No tiene asunto de email configurado`)
        }
      }
    }

    const result: TestResult = {
      automationId,
      testMode: true,
      trigger: automation.trigger,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      totalSteps: steps.length,
      executedSteps: steps.filter(s => s.status === 'simulated').length,
      skippedSteps: steps.filter(s => s.status === 'skipped').length,
      steps,
      context: testContext,
      warnings,
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Test Mode] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error en modo de prueba' },
      { status: 500 }
    )
  }
}

function simulateNode(node: any, context: any, edgeLabel?: string): TestStep {
  const nodeType = node.type
  const config = node.data?.config || {}
  const label = node.data?.label || nodeType

  const step: TestStep = {
    nodeId: node.id,
    nodeType,
    label,
    status: 'simulated',
    duration: Math.random() * 100 + 10, // Simular duración
  }

  switch (nodeType) {
    case 'action':
      step.action = config.actionType
      step.simulatedResult = simulateAction(config, context)
      step.message = `Acción "${config.actionType}" simulada`
      break

    case 'delay':
      const delayValue = config.delayValue || 1
      const delayType = config.delayType || 'horas'
      step.simulatedResult = { delay: `${delayValue} ${delayType}` }
      step.message = `Espera de ${delayValue} ${delayType} (omitida en prueba)`
      break

    case 'condition':
      step.message = `Evaluando condición...`
      break

    default:
      step.status = 'skipped'
      step.message = `Tipo de nodo desconocido: ${nodeType}`
  }

  return step
}

function simulateAction(config: any, context: any): any {
  const actionType = config.actionType

  switch (actionType) {
    case 'enviar_email':
      return {
        to: context.lead?.email || 'test@example.com',
        subject: replaceVariables(config.subject || config.asunto || 'Sin asunto', context),
        preview: replaceVariables((config.message || config.mensaje || '').substring(0, 100), context),
      }

    case 'enviar_whatsapp':
    case 'enviar_sms':
      return {
        to: context.lead?.telefono || '+52 555 000 0000',
        message: replaceVariables(config.message || config.mensaje || '', context).substring(0, 50) + '...',
      }

    case 'ejecutar_workflow':
      return {
        workflowId: config.workflowId || 'NO_CONFIGURADO',
        workflowName: config.workflowName || 'Sin nombre',
        payload: {
          lead: config.includeLeadData !== false ? context.lead : undefined,
          customPayload: config.customPayload ? JSON.parse(config.customPayload) : undefined,
        },
      }

    case 'webhook_externo_seguro':
      return {
        url: config.url || 'NO_CONFIGURADO',
        method: config.method || 'POST',
        hasSignature: true,
      }

    case 'cambiar_etapa_lead':
      return {
        from: context.lead?.estado || 'nuevo',
        to: config.newStatus || 'contactado',
      }

    case 'asignar_tag':
    case 'agregar_tag':
      return {
        tag: config.tag || 'sin-tag',
        leadId: context.lead?.id,
      }

    case 'crear_tarea':
      return {
        titulo: replaceVariables(config.titulo || 'Nueva tarea', context),
        prioridad: config.prioridad || 'media',
      }

    default:
      return { action: actionType, simulated: true }
  }
}

function evaluateCondition(node: any, context: any): boolean {
  const config = node.data?.config || {}
  const { conditionType, field, operator, value } = config

  // En modo test, simular resultado basado en datos del contexto
  if (conditionType === 'lead' && context.lead) {
    const leadValue = context.lead[field]
    
    switch (operator) {
      case 'igual_a':
        return leadValue === value
      case 'no_igual_a':
        return leadValue !== value
      case 'contiene':
        return String(leadValue || '').toLowerCase().includes(String(value).toLowerCase())
      case 'no_vacio':
        return !!leadValue
      case 'vacio':
        return !leadValue
      case 'mayor_que':
        return Number(leadValue) > Number(value)
      case 'menor_que':
        return Number(leadValue) < Number(value)
      default:
        return Math.random() > 0.5 // Aleatorio si no se puede evaluar
    }
  }

  // Por defecto, simular resultado aleatorio
  return Math.random() > 0.5
}

function replaceVariables(text: string, context: any): string {
  if (!text) return ''
  
  return text
    .replace(/\{\{nombre\}\}/g, context.lead?.nombre || 'Nombre')
    .replace(/\{\{email\}\}/g, context.lead?.email || 'email@test.com')
    .replace(/\{\{telefono\}\}/g, context.lead?.telefono || '+52 555 000 0000')
    .replace(/\{\{empresa\}\}/g, context.lead?.empresa || 'Empresa')
    .replace(/\{\{workflowName\}\}/g, context.workflowName || 'Workflow')
    .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
    .replace(/\{\{empresa_nombre\}\}/g, 'Mi Empresa')
    .replace(/\{\{usuario_nombre\}\}/g, 'Usuario Test')
}
