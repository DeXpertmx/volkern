
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  MiniMap,
  Panel,
  MarkerType,
  useReactFlow,
  SelectionMode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Play, ArrowLeft, ZoomIn, ZoomOut, Maximize, AlertCircle, TestTube, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { TriggerNode } from '@/components/automation/TriggerNode'
import { ActionNode } from '@/components/automation/ActionNode'
import { ConditionNode } from '@/components/automation/ConditionNode'
import { DelayNode } from '@/components/automation/DelayNode'
import { NodeToolbar } from '@/components/automation/NodeToolbar'
import { NodeConfigPanel } from '@/components/automation/NodeConfigPanel'
import { TemplatesGallery } from '@/components/automation/TemplatesGallery'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
}

interface AutomationData {
  id: string
  nombre: string
  descripcion?: string
  trigger: string
  activo: boolean
  flowData: {
    nodes: Node[]
    edges: Edge[]
  }
}

// Validación de nodos
const validateNode = (node: Node): { isValid: boolean; message?: string } => {
  const config = node.data.config || {}

  switch (node.type) {
    case 'action':
      if (!config.actionType) {
        return { isValid: false, message: 'Selecciona un tipo de acción' }
      }

      // Validar campos específicos por tipo de acción
      if (config.actionType === 'enviar_email') {
        if (!config.subject || !config.message) {
          return { isValid: false, message: 'Completa asunto y mensaje' }
        }
      } else if (config.actionType === 'enviar_sms' || config.actionType === 'enviar_whatsapp') {
        if (!config.message) {
          return { isValid: false, message: 'Escribe el mensaje' }
        }
      } else if (config.actionType === 'enviar_telegram') {
        if (!config.chatId || !config.message) {
          return { isValid: false, message: 'Completa Chat ID y mensaje' }
        }
      } else if (config.actionType === 'cambiar_etapa_lead' || config.actionType === 'actualizar_lead') {
        if (!config.newStatus) {
          return { isValid: false, message: 'Selecciona el nuevo estado' }
        }
      } else if (config.actionType === 'asignar_tag') {
        if (!config.tagName) {
          return { isValid: false, message: 'Especifica el tag' }
        }
      } else if (config.actionType === 'crear_tarea') {
        if (!config.taskTitle) {
          return { isValid: false, message: 'Escribe el título de la tarea' }
        }
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

// Validar todos los nodos
const validateAllNodes = (nodes: Node[]): { isValid: boolean; invalidNodes: string[] } => {
  const invalidNodes: string[] = []

  nodes.forEach(node => {
    if (node.type !== 'trigger') {
      const validation = validateNode(node)
      if (!validation.isValid) {
        invalidNodes.push(node.id)
      }
    }
  })

  return {
    isValid: invalidNodes.length === 0,
    invalidNodes
  }
}

export default function AutomationBuilderPage() {
  const params = useParams()
  const router = useRouter()
  const automationId = params?.id as string
  const isNew = automationId === 'new'

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [automation, setAutomation] = useState<AutomationData | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [showTestResult, setShowTestResult] = useState(false)
  const [invalidNodes, setInvalidNodes] = useState<string[]>([])
  const [dashboardSidebarCollapsed, setDashboardSidebarCollapsed] = useState(false)

  // Configuración de la automatización
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [trigger, setTrigger] = useState('nuevo_lead')

  // Sincronizar con el estado del sidebar del dashboard
  useEffect(() => {
    // Leer estado inicial
    const checkSidebar = () => {
      const savedState = localStorage.getItem('sidebar-collapsed')
      setDashboardSidebarCollapsed(savedState === 'true')
    }

    checkSidebar()

    // Escuchar cambios en localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sidebar-collapsed') {
        setDashboardSidebarCollapsed(e.newValue === 'true')
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // Polling como fallback
    const interval = setInterval(checkSidebar, 100)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [])

  // Validar nodos cuando cambian
  useEffect(() => {
    const validation = validateAllNodes(nodes)
    setInvalidNodes(validation.invalidNodes)
  }, [nodes])

  useEffect(() => {
    if (!isNew) {
      loadAutomation()
    } else {
      // Crear nodo trigger inicial para nuevas automatizaciones
      const initialNode: Node = {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 400, y: 100 },
        data: {
          label: 'Cuando ocurra...',
          trigger: 'nuevo_lead',
          config: {}
        },
      }
      setNodes([initialNode])
    }
  }, [automationId])

  const loadAutomation = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/automatizaciones/${automationId}`)
      if (!response.ok) throw new Error('Error al cargar automatización')

      const data = await response.json()
      setAutomation(data)
      setNombre(data.nombre)
      setDescripcion(data.descripcion || '')
      setTrigger(data.trigger)

      if (data.flowData?.nodes) {
        setNodes(data.flowData.nodes)
        setEdges(data.flowData.edges || [])
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar automatización')
    } finally {
      setLoading(false)
    }
  }

  // Configurar color y estilo de conexiones
  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find(n => n.id === params.source)

      let edgeColor = '#3b82f6' // azul por defecto
      let edgeLabel = ''

      // Si es una conexión desde un nodo de condición
      if (sourceNode?.type === 'condition') {
        if (params.sourceHandle === 'true') {
          edgeColor = '#22c55e' // verde para "Sí"
          edgeLabel = 'Sí'
        } else if (params.sourceHandle === 'false') {
          edgeColor = '#ef4444' // rojo para "No"
          edgeLabel = 'No'
        }
      }

      const newEdge = {
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: edgeColor, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 20,
          height: 20,
        },
        label: edgeLabel,
        labelStyle: { fill: edgeColor, fontWeight: 600, fontSize: 12 },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
      }

      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges, nodes]
  )

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const addNode = (type: string) => {
    const lastNode = nodes[nodes.length - 1]
    const baseY = lastNode ? lastNode.position.y + 150 : 300

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: {
        x: 350 + Math.random() * 100,
        y: baseY,
      },
      data: {
        label: getDefaultLabel(type),
        config: {},
        isInvalid: true,
      },
    }
    setNodes((nds) => [...nds, newNode])

    // Auto-seleccionar el nuevo nodo para configuración
    setTimeout(() => setSelectedNode(newNode), 100)
  }

  const getDefaultLabel = (type: string): string => {
    const labels: Record<string, string> = {
      action: 'Nueva acción',
      condition: 'Condición',
      delay: 'Esperar',
    }
    return labels[type] || 'Nuevo nodo'
  }

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const updatedNode = {
            ...node,
            data: {
              ...node.data,
              ...newData,
            },
          }

          // Validar el nodo actualizado
          const validation = validateNode(updatedNode)
          updatedNode.data.isInvalid = !validation.isValid
          updatedNode.data.validationMessage = validation.message

          // Si este es el nodo seleccionado, actualizar también selectedNode
          if (selectedNode && selectedNode.id === nodeId) {
            setSelectedNode(updatedNode)
          }

          return updatedNode
        }
        return node
      })
    )
  }

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId))
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null)
    }
  }

  const handleTest = async () => {
    if (isNew) {
      toast.error('Guarda la automatización primero')
      return
    }

    try {
      setTesting(true)
      const response = await fetch('/api/automatizaciones/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId }),
      })

      if (!response.ok) throw new Error('Error al probar')

      const result = await response.json()
      setTestResult(result)
      setShowTestResult(true)

      if (result.warnings.length > 0) {
        toast.warning(`Prueba completada con ${result.warnings.length} advertencia(s)`)
      } else {
        toast.success(`Prueba exitosa: ${result.executedSteps} pasos simulados`)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al probar automatización')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    // Validar todos los nodos
    const validation = validateAllNodes(nodes)
    if (!validation.isValid) {
      toast.error('Algunos nodos están incompletos. Por favor, revísalos.')
      return
    }

    try {
      setSaving(true)

      const flowData = {
        nodes,
        edges,
      }

      const body = {
        nombre,
        descripcion,
        trigger,
        flowData,
      }

      let response
      if (isNew) {
        response = await fetch('/api/automatizaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        response = await fetch(`/api/automatizaciones/${automationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (!response.ok) throw new Error('Error al guardar')

      const savedAutomation = await response.json()
      toast.success('Automatización guardada correctamente')

      if (isNew) {
        router.push(`/dashboard/automatizaciones/builder/${savedAutomation.id}`)
      } else {
        loadAutomation()
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar automatización')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const hasInvalidNodes = invalidNodes.length > 0

  return (
    <div
      className="fixed inset-0 top-16 flex flex-col bg-background transition-all duration-300"
      style={{
        left: dashboardSidebarCollapsed ? '64px' : '256px',
      }}
    >
      {/* Header - Compacto */}
      <div className="border-b bg-background px-6 py-2 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 flex-1">
          <Link href="/dashboard/automatizaciones">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Nombre de la automatización"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="h-8 text-sm font-semibold"
            />
          </div>
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nuevo_lead">Nuevo Lead</SelectItem>
              <SelectItem value="cita_agendada">Cita Agendada</SelectItem>
              <SelectItem value="cita_confirmada">Cita Confirmada</SelectItem>
              <SelectItem value="pago_recibido">Pago Recibido</SelectItem>
              <SelectItem value="lead_sin_respuesta">Lead Sin Respuesta (24h)</SelectItem>
              <SelectItem value="estudiante_inscrito">Estudiante Inscrito</SelectItem>
              <SelectItem value="estudiante_completa_curso">Estudiante Completa Curso</SelectItem>
              <SelectItem value="leccion_completada">Lección Completada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {hasInvalidNodes && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {invalidNodes.length} nodo{invalidNodes.length > 1 ? 's' : ''} incompleto{invalidNodes.length > 1 ? 's' : ''}
            </Badge>
          )}
          {!isNew && (
            <Button onClick={handleTest} disabled={testing || hasInvalidNodes} variant="outline" size="sm">
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <TestTube className="h-3.5 w-3.5 mr-1.5" />
              )}
              {testing ? 'Probando...' : 'Probar'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || hasInvalidNodes} size="sm">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Builder Layout - Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Container - Toolbar + Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar - Fixed at top */}
          <div className="border-b bg-background px-6 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground mr-2">Agregar:</span>
              <NodeToolbar onAddNode={addNode} orientation="horizontal" />
            </div>

            {/* Galería de Plantillas a la derecha */}
            <TemplatesGallery
              onSelectTemplate={(newNodes, newEdges) => {
                setNodes(newNodes)
                setEdges(newEdges)
                toast.success('Plantilla aplicada. Modifica los parámetros según tu negocio.')
              }}
            />
          </div>

          {/* Canvas - Fills remaining space */}
          <div className="flex-1 relative overflow-hidden">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={2}
              selectionOnDrag={true}
              selectionMode={SelectionMode.Partial}
              panOnScroll={false}
              selectionKeyCode="Shift"
              multiSelectionKeyCode="Shift"
              deleteKeyCode="Delete"
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#3b82f6', strokeWidth: 2 },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#3b82f6',
                },
              }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls showInteractive={true} />
              <MiniMap
                nodeColor={(node) => {
                  if (invalidNodes.includes(node.id)) return '#ef4444'
                  switch (node.type) {
                    case 'trigger': return '#3b82f6'
                    case 'action': return '#22c55e'
                    case 'condition': return '#eab308'
                    case 'delay': return '#a855f7'
                    default: return '#64748b'
                  }
                }}
                maskColor="rgb(240, 240, 240, 0.6)"
              />
            </ReactFlow>

            {/* Panel de configuración del nodo seleccionado */}
            {selectedNode && (
              <NodeConfigPanel
                node={selectedNode}
                onUpdate={updateNodeData}
                onDelete={deleteNode}
                onClose={() => setSelectedNode(null)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Test Result Dialog */}
      <Dialog open={showTestResult} onOpenChange={setShowTestResult}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Resultado de la Prueba</DialogTitle>
            <DialogDescription>
              Simulación de ejecución con datos de prueba
            </DialogDescription>
          </DialogHeader>

          {testResult && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{testResult.executedSteps}</div>
                    <div className="text-xs text-muted-foreground">Ejecutados</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{testResult.skippedSteps}</div>
                    <div className="text-xs text-muted-foreground">Omitidos</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">{testResult.totalSteps}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Pasos</h4>
                  {testResult.steps.map((step: any, idx: number) => (
                    <div key={step.nodeId} className="flex items-start gap-2 p-2 rounded border text-sm">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {step.nodeType}
                          </Badge>
                          <span className="font-medium">{step.label}</span>
                        </div>
                        {step.message && (
                          <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>
                        )}
                        {step.simulatedResult && (
                          <pre className="text-xs text-muted-foreground mt-0.5 bg-muted/50 rounded px-2 py-0.5 overflow-x-auto">
                            {JSON.stringify(step.simulatedResult, null, 0).substring(0, 120)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Warnings */}
                {testResult.warnings.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-yellow-600">Advertencias</h4>
                    {testResult.warnings.map((warning: string, idx: number) => (
                      <p key={idx} className="text-xs text-yellow-600 bg-yellow-50 rounded px-3 py-1.5">
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button onClick={() => setShowTestResult(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
