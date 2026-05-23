'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { apiFetch, apiPost } from '@/lib/api-client'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Search,
  Filter,
  TrendingUp,
  DollarSign,
  Calendar,
  User,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  GripVertical,
  Settings,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Palette,
  ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Deal {
  id: string
  titulo: string
  valor: number
  moneda: string
  etapa: string
  probabilidad: number
  prioridad: string
  fechaEstimadaCierre: string | null
  lead?: {
    id: string
    nombre: string
    email: string
    empresa: string | null
  }
  contact?: {
    id: string
    nombre: string
    email: string
    telefono: string | null
    cargo: string | null
  }
  company?: {
    id: string
    nombre: string
  }
  usuarioAsignado?: {
    id: string
    name: string
  }
  _count?: {
    cotizaciones: number
    actividades: number
  }
  healthScore: number
  healthStatus: string
  tags?: string
}

interface Stage {
  id: string
  nombre: string
  color: string
  probabilidad: number
  orden: number
  esEtapaFinal?: boolean
  tipoEtapaFinal?: string
}

interface Metrics {
  totalValor: number
  valorPonderado: number
  totalDeals: number
  porEtapa: Record<string, number>
  gapAnalysis: number
}

export default function PipelinePage() {
  const { data: session } = useSession() || {}
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPrioridad, setFilterPrioridad] = useState<string>('all')
  const [filterSalud, setFilterSalud] = useState<string>('all')
  const [showNewDealDialog, setShowNewDealDialog] = useState(false)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Cargar estado de columnas colapsadas desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pipeline-collapsed-stages')
    if (saved) {
      try {
        setCollapsedStages(new Set(JSON.parse(saved)))
      } catch (e) {
        // Ignorar error de parse
      }
    }
  }, [])

  // Guardar estado de columnas colapsadas
  const toggleCollapseStage = (stageName: string) => {
    setCollapsedStages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stageName)) {
        newSet.delete(stageName)
      } else {
        newSet.add(stageName)
      }
      localStorage.setItem('pipeline-collapsed-stages', JSON.stringify([...newSet]))
      return newSet
    })
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [dealsRes, stagesRes] = await Promise.all([
        apiFetch('/api/deals'),
        apiFetch('/api/pipeline/stages'),
      ])

      if (dealsRes.ok && stagesRes.ok) {
        const dealsData = await dealsRes.json()
        const stagesData = await stagesRes.json()
        
        setDeals(dealsData.deals || [])
        setMetrics(dealsData.metrics || null)
        setStages(stagesData.stages || [])
      }
    } catch (error) {
      console.error('Error al cargar datos:', error)
      toast.error('Error al cargar el pipeline')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveId(null)
      return
    }

    const dealId = active.id as string
    const newStageName = over.id as string

    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.etapa === newStageName) {
      setActiveId(null)
      return
    }

    // Actualizar optimistically
    setDeals((prevDeals) =>
      prevDeals.map((d) => (d.id === dealId ? { ...d, etapa: newStageName } : d))
    )

    try {
      const stage = stages.find((s) => s.nombre === newStageName)
      
      const response = await apiFetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa: newStageName,
          probabilidad: stage?.probabilidad || deal.probabilidad,
        }),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar deal')
      }

      toast.success(`Deal movido a ${newStageName}`)
      await fetchData()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al mover el deal')
      await fetchData()
    }

    setActiveId(null)
  }

  const formatCurrency = (value: number, currency: string = 'MXN') => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(value)
  }

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'urgente':
        return 'destructive' as const
      case 'alta':
        return 'default' as const
      case 'media':
        return 'secondary' as const
      case 'baja':
        return 'outline' as const
      default:
        return 'secondary' as const
    }
  }

  const filteredDeals = deals.filter((deal) => {
    const matchesSearch =
      deal.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (deal.contact?.nombre && deal.contact.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (deal.contact?.email && deal.contact.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (deal.company?.nombre && deal.company.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (deal.lead?.nombre && deal.lead.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (deal.lead?.empresa && deal.lead.empresa.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesPrioridad =
      filterPrioridad === 'all' || deal.prioridad === filterPrioridad

    const matchesSalud =
      filterSalud === 'all' || deal.healthStatus === filterSalud

    return matchesSearch && matchesPrioridad && matchesSalud
  })

  const normalizeStageName = (name: string | null | undefined) => {
    if (!name) return "";
    try {
      return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    } catch (e) {
      console.error("Error normalizing stage name:", name, e);
      return String(name).toLowerCase().trim();
    }
  };

  const getDealsByStage = (stageName: string) => {
    return filteredDeals.filter((deal) => normalizeStageName(deal.etapa) === normalizeStageName(stageName))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando pipeline...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8" />
            Pipeline de Ventas
          </h2>
          <p className="text-muted-foreground mt-1">
            Visualiza y gestiona tus oportunidades de venta
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowConfigDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configurar Etapas
          </Button>
          <Button 
            variant="outline" 
            className="border-primary/20 hover:bg-primary/5 text-primary"
            onClick={async () => {
              toast.promise(apiFetch('/api/deals/sync', { method: 'POST' }), {
                loading: 'Consultando Oráculo de Ventas...',
                success: () => {
                  fetchData()
                  return 'Pipeline Sincronizado'
                },
                error: 'Error en la sincronización'
              })
            }}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Sincronizar Oráculo
          </Button>
          <Dialog open={showNewDealDialog} onOpenChange={setShowNewDealDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Deal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Deal</DialogTitle>
                <DialogDescription>
                  Crea una nueva oportunidad de venta
                </DialogDescription>
              </DialogHeader>
              <NewDealForm
                stages={stages}
                onSuccess={() => {
                  setShowNewDealDialog(false)
                  fetchData()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Métricas */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalDeals}</div>
              <p className="text-xs text-muted-foreground">Oportunidades activas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(metrics.totalValor)}
              </div>
              <p className="text-xs text-muted-foreground">En pipeline</p>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold text-primary">Weighted Value</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">
                {formatCurrency(metrics.valorPonderado)}
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Forecast Proyectado</p>
            </CardContent>
          </Card>
          <Card className={metrics.gapAnalysis > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-bold ${metrics.gapAnalysis > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Gap vs Objetivo</CardTitle>
              <ArrowUpDown className={`h-4 w-4 ${metrics.gapAnalysis > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-black ${metrics.gapAnalysis > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(metrics.gapAnalysis)}
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                {metrics.gapAnalysis > 0 ? 'Restante para meta' : 'Objetivo superado'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar deals, leads, empresas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={filterPrioridad} onValueChange={setFilterPrioridad}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las prioridades</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterSalud} onValueChange={setFilterSalud}>
          <SelectTrigger className="w-[180px]">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <SelectValue placeholder="Filtrar por Salud" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las saludes</SelectItem>
            <SelectItem value="HEALTHY">Saludables</SelectItem>
            <SelectItem value="WARNING">En Observación</SelectItem>
            <SelectItem value="CRITICAL">Críticos</SelectItem>
            <SelectItem value="ZOMBIE">Zombies</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pipeline Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages
            .filter((stage) => !stage.nombre.toLowerCase().includes('perdido'))
            .map((stage) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                deals={getDealsByStage(stage.nombre)}
                formatCurrency={formatCurrency}
                getPriorityColor={getPriorityColor}
                isCollapsed={collapsedStages.has(stage.nombre)}
                onToggleCollapse={() => toggleCollapseStage(stage.nombre)}
              />
            ))}
        </div>
        <DragOverlay>
          {activeId && deals.find((d) => d.id === activeId) ? (
            <DealCard
              deal={deals.find((d) => d.id === activeId)!}
              formatCurrency={formatCurrency}
              getPriorityColor={getPriorityColor}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal de Configuración de Etapas */}
      <StageConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        stages={stages}
        onUpdate={fetchData}
      />
    </div>
  )
}

// Componente de columna del pipeline
function PipelineColumn({
  stage,
  deals,
  formatCurrency,
  getPriorityColor,
  isCollapsed,
  onToggleCollapse,
}: {
  stage: Stage
  deals: Deal[]
  formatCurrency: (value: number, currency?: string) => string
  getPriorityColor: (prioridad: string) => string
  isCollapsed: boolean
  onToggleCollapse: () => void
}) {
  const totalValor = deals.reduce((sum, deal) => sum + deal.valor, 0)
  
  const { setNodeRef } = useDroppable({
    id: stage.nombre,
  })

  if (isCollapsed) {
    return (
      <div className="flex-shrink-0 w-16">
        <div
          ref={setNodeRef}
          className="rounded-lg border-2 border-dashed p-2 min-h-[600px] flex flex-col items-center cursor-pointer hover:bg-muted/50 transition-colors"
          style={{ borderColor: stage.color }}
          onClick={onToggleCollapse}
        >
          <div
            className="h-3 w-3 rounded-full mb-2"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-xs font-semibold writing-mode-vertical rotate-180" style={{ writingMode: 'vertical-rl' }}>
            {stage.nombre}
          </span>
          <Badge variant="secondary" className="mt-2 text-xs">
            {deals.length}
          </Badge>
          <span className="text-xs text-muted-foreground mt-2 writing-mode-vertical rotate-180" style={{ writingMode: 'vertical-rl' }}>
            {formatCurrency(totalValor)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-80">
      <div
        ref={setNodeRef}
        className="rounded-lg border-2 border-dashed p-4 min-h-[600px]"
        style={{ borderColor: stage.color }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="font-semibold">{stage.nombre}</h3>
            <Badge variant="secondary">{deals.length}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {stage.probabilidad}%
          </span>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium">{formatCurrency(totalValor)}</p>
        </div>

        <div className="space-y-3">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              formatCurrency={formatCurrency}
              getPriorityColor={getPriorityColor}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Componente de tarjeta de deal - FIX: Separar zona de drag de acciones
function DealCard({
  deal,
  formatCurrency,
  getPriorityColor,
  isDragging = false,
}: {
  deal: Deal | undefined
  formatCurrency: (value: number, currency?: string) => string
  getPriorityColor: (prioridad: string) => string
  isDragging?: boolean
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal?.id || 'unknown',
  })

  if (!deal) return null;

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  const handleViewDeal = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    router.push(`/dashboard/pipeline/${deal.id}`)
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`hover:shadow-md transition-shadow overflow-hidden ${isDragging ? 'opacity-50' : ''}`}
    >
      <CardContent className="p-4 overflow-hidden">
        {/* Zona de arrastre - Solo esta parte es draggable */}
        <div {...listeners} {...attributes} className="cursor-move overflow-hidden">
          <div className="space-y-3 overflow-hidden">
            <div className="flex items-start justify-between gap-2 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <h4 className="font-semibold text-sm truncate">{deal.titulo}</h4>
                  {deal.contact ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {deal.contact.nombre}
                      {deal.contact.cargo && ` • ${deal.contact.cargo}`}
                      {deal.company && ` • ${deal.company.nombre}`}
                    </p>
                  ) : deal.lead && (
                    <p className="text-xs text-muted-foreground truncate">
                      {deal.lead.nombre}
                      {deal.lead.empresa && ` • ${deal.lead.empresa}`}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={getPriorityColor(deal.prioridad) as any} className="flex-shrink-0 text-xs">
                {deal.prioridad}
              </Badge>
              {/* Indicador de Salud */}
              <div className={`h-2 w-2 rounded-full ${
                deal.healthStatus === 'HEALTHY' ? 'bg-emerald-500' :
                deal.healthStatus === 'WARNING' ? 'bg-amber-500' :
                deal.healthStatus === 'CRITICAL' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-400'
              }`} title={`Salud: ${deal.healthScore}/100`} />
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-green-600">
                {formatCurrency(deal.valor, deal.moneda)}
              </span>
              <span className="text-xs text-muted-foreground">
                {deal.probabilidad}%
              </span>
            </div>

            {deal.fechaEstimadaCierre && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(deal.fechaEstimadaCierre).toLocaleDateString('es-MX')}
              </div>
            )}

            {deal.usuarioAsignado && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {deal.usuarioAsignado.name}
              </div>
            )}
          </div>
        </div>

        {/* Zona de acciones - NO es draggable */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t gap-2 overflow-hidden">
          <div className="flex gap-2 text-xs text-muted-foreground truncate min-w-0 flex-1">
            {deal._count && (
              <>
                <span className="truncate">{deal._count.actividades} actividades</span>
                <span>•</span>
                <span className="truncate">{deal._count.cotizaciones} cotizaciones</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={handleViewDeal}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Modal de configuración de etapas del pipeline
function StageConfigDialog({
  open,
  onOpenChange,
  stages,
  onUpdate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: Stage[]
  onUpdate: () => void
}) {
  const [localStages, setLocalStages] = useState<Stage[]>([])
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [showNewStageForm, setShowNewStageForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Stage | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocalStages([...stages].sort((a, b) => a.orden - b.orden))
  }, [stages, open])

  const handleCreateStage = async (data: { nombre: string; color: string; probabilidad: number }) => {
    try {
      setSaving(true)
      const response = await apiFetch('/api/pipeline/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear etapa')
      }

      toast.success('Etapa creada')
      setShowNewStageForm(false)
      onUpdate()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStage = async (id: string, data: Partial<Stage>) => {
    try {
      setSaving(true)
      const response = await apiFetch(`/api/pipeline/stages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al actualizar etapa')
      }

      toast.success('Etapa actualizada')
      setEditingStage(null)
      onUpdate()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStage = async (stage: Stage) => {
    try {
      setSaving(true)
      const response = await apiFetch(`/api/pipeline/stages/${stage.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al eliminar etapa')
      }

      toast.success('Etapa eliminada')
      setDeleteConfirm(null)
      onUpdate()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReorder = async (stageId: string, direction: 'up' | 'down') => {
    const index = localStages.findIndex(s => s.id === stageId)
    if (index === -1) return
    
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= localStages.length) return

    // No permitir mover etapas finales
    const currentStage = localStages[index]
    const targetStage = localStages[newIndex]
    if (currentStage.esEtapaFinal || targetStage.esEtapaFinal) {
      toast.error('No se pueden reordenar las etapas finales')
      return
    }

    const newStages = [...localStages]
    ;[newStages[index], newStages[newIndex]] = [newStages[newIndex], newStages[index]]
    
    const stagesWithNewOrder = newStages.map((s, i) => ({ ...s, orden: i + 1 }))
    setLocalStages(stagesWithNewOrder)

    try {
      const response = await apiFetch('/api/pipeline/stages/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stages: stagesWithNewOrder.map(s => ({ id: s.id, orden: s.orden })),
        }),
      })

      if (!response.ok) {
        throw new Error('Error al reordenar')
      }

      onUpdate()
    } catch (error) {
      toast.error('Error al reordenar etapas')
      setLocalStages([...stages].sort((a, b) => a.orden - b.orden))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar Etapas del Pipeline
            </DialogTitle>
            <DialogDescription>
              Agrega, edita, elimina o reordena las etapas de tu pipeline de ventas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Lista de etapas */}
            <div className="space-y-2">
              {localStages.map((stage, index) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0 || stage.esEtapaFinal || localStages[index - 1]?.esEtapaFinal}
                      onClick={() => handleReorder(stage.id, 'up')}
                    >
                      <ChevronRight className="h-4 w-4 rotate-[-90deg]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === localStages.length - 1 || stage.esEtapaFinal || localStages[index + 1]?.esEtapaFinal}
                      onClick={() => handleReorder(stage.id, 'down')}
                    >
                      <ChevronRight className="h-4 w-4 rotate-90" />
                    </Button>
                  </div>

                  <div
                    className="h-6 w-6 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{stage.nombre}</span>
                      {stage.esEtapaFinal && (
                        <Badge variant="outline" className="text-xs">
                          {stage.tipoEtapaFinal === 'ganado' ? 'Ganado' : 'Perdido'}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Probabilidad: {stage.probabilidad}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingStage(stage)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {!stage.esEtapaFinal && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(stage)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Botón agregar etapa */}
            {!showNewStageForm ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowNewStageForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar Nueva Etapa
              </Button>
            ) : (
              <StageForm
                onSubmit={handleCreateStage}
                onCancel={() => setShowNewStageForm(false)}
                saving={saving}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de edición de etapa */}
      <Dialog open={!!editingStage} onOpenChange={() => setEditingStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Etapa</DialogTitle>
          </DialogHeader>
          {editingStage && (
            <StageForm
              initialData={editingStage}
              onSubmit={(data) => handleUpdateStage(editingStage.id, data)}
              onCancel={() => setEditingStage(null)}
              saving={saving}
              isEditing
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etapa "{deleteConfirm?.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La etapa será eliminada permanentemente.
              Asegúrate de que no hay deals en esta etapa antes de eliminarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDeleteStage(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Formulario para crear/editar etapa
function StageForm({
  initialData,
  onSubmit,
  onCancel,
  saving,
  isEditing = false,
}: {
  initialData?: Stage
  onSubmit: (data: { nombre: string; color: string; probabilidad: number }) => void
  onCancel: () => void
  saving: boolean
  isEditing?: boolean
}) {
  const [nombre, setNombre] = useState(initialData?.nombre || '')
  const [color, setColor] = useState(initialData?.color || '#3b82f6')
  const [probabilidad, setProbabilidad] = useState(initialData?.probabilidad?.toString() || '50')

  const colors = [
    '#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981',
    '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316'
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    onSubmit({
      nombre: nombre.trim(),
      color,
      probabilidad: parseInt(probabilidad),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div>
        <Label htmlFor="nombre">Nombre de la Etapa *</Label>
        <Input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Demostración"
          disabled={initialData?.esEtapaFinal}
        />
      </div>

      <div>
        <Label>Color</Label>
        <div className="flex gap-2 mt-2">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              className={`h-8 w-8 rounded-full border-2 transition-all ${
                color === c ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <Input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-12 p-0 border-0"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="probabilidad">Probabilidad de Cierre (%)</Label>
        <div className="flex items-center gap-3">
          <Input
            id="probabilidad"
            type="range"
            min="0"
            max="100"
            value={probabilidad}
            onChange={(e) => setProbabilidad(e.target.value)}
            className="flex-1"
          />
          <span className="font-medium w-12 text-right">{probabilidad}%</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Etapa'}
        </Button>
      </div>
    </form>
  )
}

// Formulario de nuevo deal
interface Contact {
  id: string
  nombre: string
  email: string
  telefono: string | null
  tipo: string
  cargo: string | null
  company?: {
    id: string
    nombre: string
  }
}

function NewDealForm({ stages, onSuccess }: { stages: Stage[]; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactMode, setContactMode] = useState<'existing' | 'new'>('existing')
  const [searchContact, setSearchContact] = useState('')

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    valor: '',
    moneda: 'MXN',
    etapa: '',
    probabilidad: '25',
    prioridad: 'media',
    fechaEstimadaCierre: '',
    contactId: '',
  })

  const [newContactData, setNewContactData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    cargo: '',
    ubicacion: '',
    notas: '',
  })

  useEffect(() => {
    fetchContacts()
  }, [])

  useEffect(() => {
    // Establecer la primera etapa activa como default
    const firstStage = stages.find((s) => !s.esEtapaFinal)
    if (firstStage && !formData.etapa) {
      setFormData(prev => ({
        ...prev,
        etapa: firstStage.nombre,
        probabilidad: firstStage.probabilidad.toString()
      }))
    }
  }, [stages])

  const fetchContacts = async () => {
    try {
      setLoadingContacts(true)
      const response = await apiFetch('/api/contacts')
      if (response.ok) {
        const data = await response.json()
        // El API retorna un array directo de contactos
        setContacts(Array.isArray(data) ? data : (data.data || []))
      }
    } catch (error) {
      console.error('Error al cargar contactos:', error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const filteredContacts = contacts.filter((contact) =>
    contact.nombre.toLowerCase().includes(searchContact.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchContact.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload: any = {
        titulo: formData.titulo,
        descripcion: formData.descripcion,
        valor: formData.valor,
        moneda: formData.moneda,
        etapa: formData.etapa,
        probabilidad: formData.probabilidad,
        prioridad: formData.prioridad,
        fechaEstimadaCierre: formData.fechaEstimadaCierre || null,
      }

      if (contactMode === 'existing') {
        if (!formData.contactId) {
          toast.error('Por favor selecciona un contacto')
          setLoading(false)
          return
        }
        payload.contactId = formData.contactId
      } else {
        if (!newContactData.nombre || !newContactData.email) {
          toast.error('Nombre y email del contacto son obligatorios')
          setLoading(false)
          return
        }
        payload.newContact = newContactData
      }

      const response = await apiFetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear deal')
      }

      toast.success('Deal creado exitosamente')
      onSuccess()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al crear deal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Sección de Contacto */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <User className="h-4 w-4" />
          Información del Contacto *
        </h3>
        
        <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as 'existing' | 'new')}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="existing" onClick={() => setContactMode('existing')}>
              Seleccionar Existente
            </TabsTrigger>
            <TabsTrigger value="new" onClick={() => setContactMode('new')}>
              <UserPlus className="h-4 w-4 mr-2" />
              Crear Nuevo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-3">
            <div>
              <Label htmlFor="searchContact">Buscar Contacto</Label>
              <Input
                id="searchContact"
                placeholder="Buscar por nombre o email..."
                value={searchContact}
                onChange={(e) => setSearchContact(e.target.value)}
                className="mb-2"
              />
            </div>
            <div>
              <Label htmlFor="contactId">Contacto *</Label>
              <Select
                value={formData.contactId}
                onValueChange={(value) => setFormData({ ...formData, contactId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un contacto" />
                </SelectTrigger>
                <SelectContent>
                  {loadingContacts ? (
                    <SelectItem value="loading" disabled>Cargando...</SelectItem>
                  ) : filteredContacts.length === 0 ? (
                    <SelectItem value="empty" disabled>No hay contactos disponibles</SelectItem>
                  ) : (
                    filteredContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="font-medium">{contact.nombre}</span>
                            <span className="text-xs text-muted-foreground">{contact.email}</span>
                          </div>
                          <Badge variant="outline" className={`ml-2 text-[10px] h-4 ${
                            contact.tipo === 'company' 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}>
                            {contact.tipo === 'company' ? 'Empresa' : 'Persona'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="new" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="newContactNombre">Nombre *</Label>
                <Input
                  id="newContactNombre"
                  value={newContactData.nombre}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, nombre: e.target.value })
                  }
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <Label htmlFor="newContactEmail">Email *</Label>
                <Input
                  id="newContactEmail"
                  type="email"
                  value={newContactData.email}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, email: e.target.value })
                  }
                  placeholder="juan@empresa.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="newContactTelefono">Teléfono</Label>
                <Input
                  id="newContactTelefono"
                  value={newContactData.telefono}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, telefono: e.target.value })
                  }
                  placeholder="+52 123 456 7890"
                />
              </div>
              <div>
                <Label htmlFor="newContactCargo">Cargo</Label>
                <Input
                  id="newContactCargo"
                  value={newContactData.cargo}
                  onChange={(e) =>
                    setNewContactData({ ...newContactData, cargo: e.target.value })
                  }
                  placeholder="Director"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Información del Deal */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Información del Deal</h3>
        
        <div>
          <Label htmlFor="titulo">Título *</Label>
          <Input
            id="titulo"
            value={formData.titulo}
            onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
            placeholder="Ej: Proyecto de consultoría"
            required
          />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea
            id="descripcion"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Detalles del deal..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="valor">Valor *</Label>
            <Input
              id="valor"
              type="number"
              value={formData.valor}
              onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
              placeholder="10000"
              required
            />
          </div>
          <div>
            <Label htmlFor="moneda">Moneda</Label>
            <Select
              value={formData.moneda}
              onValueChange={(value) => setFormData({ ...formData, moneda: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MXN">MXN</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="COP">COP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="etapa">Etapa del Pipeline</Label>
            <Select
              value={formData.etapa}
              onValueChange={(value) => {
                const selectedStage = stages.find(s => s.nombre === value)
                setFormData({ 
                  ...formData, 
                  etapa: value,
                  probabilidad: selectedStage ? selectedStage.probabilidad.toString() : formData.probabilidad
                })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages
                  .filter(stage => !stage.esEtapaFinal)
                  .map((stage) => (
                    <SelectItem key={stage.id} value={stage.nombre}>
                      {stage.nombre} ({stage.probabilidad}%)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="prioridad">Prioridad</Label>
            <Select
              value={formData.prioridad}
              onValueChange={(value) => setFormData({ ...formData, prioridad: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="fechaEstimadaCierre">Fecha Estimada de Cierre</Label>
          <Input
            id="fechaEstimadaCierre"
            type="date"
            value={formData.fechaEstimadaCierre}
            onChange={(e) =>
              setFormData({ ...formData, fechaEstimadaCierre: e.target.value })
            }
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creando...' : 'Crear Deal'}
        </Button>
      </div>
    </form>
  )
}
