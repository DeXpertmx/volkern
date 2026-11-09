'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { apiFetch, apiPost } from '@/lib/api-client'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'
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
import { sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
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
  Coins,
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
  AlertCircle,
  ListOrdered,
  Copy,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { MODULE_PIPELINES, getStagesForCategory } from '@/lib/pipelines'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Haptic feedback helper ──────────────────────────────────────────────────
function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40)
    }
  } catch {}
}

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
  const [showNewPipelineDialog, setShowNewPipelineDialog] = useState(false)
  const [newPipelineName, setNewPipelineName] = useState('')
  const [newPipelineCategory, setNewPipelineCategory] = useState('generic')
  const [creatingPipeline, setCreatingPipeline] = useState(false)
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())

  const [pipelines, setPipelines] = useState<any[]>([])
  const [activePipelineId, setActivePipelineId] = useState<string>('')
  const [maxPipelines, setMaxPipelines] = useState(1)
  const [showPipelineSelector, setShowPipelineSelector] = useState(false)
  const pipelineSearchRef = useRef<HTMLInputElement>(null)
  const [deletingPipeline, setDeletingPipeline] = useState<any>(null)
  const [deleteTargetPipelineId, setDeleteTargetPipelineId] = useState<string>('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteCountdownSecs, setDeleteCountdownSecs] = useState(30)
  const [deleteShakeKey, setDeleteShakeKey] = useState(0)
  const [renamingPipeline, setRenamingPipeline] = useState<any>(null)
  const [renamePipelineName, setRenamePipelineName] = useState('')
  const [renamePipelineColor, setRenamePipelineColor] = useState('#3b82f6')
  const [renamePipelineIcono, setRenamePipelineIcono] = useState('📈')
  const [renamingPipelineLoading, setRenamingPipelineLoading] = useState(false)
  const [showReorderDialog, setShowReorderDialog] = useState(false)
  const [reorderPipelines, setReorderPipelines] = useState<any[]>([])
  const [pipelineSearch, setPipelineSearch] = useState('')

  // ── Categorías de pipeline derivadas de MODULE_PIPELINES ─────────────────
  const pipelineCategories = useMemo(() => {
    const seen = new Set<string>()
    const cats: { categoria: string; nombre: string; icono: string; descripcion: string }[] = []

    for (const modulePipes of Object.values(MODULE_PIPELINES)) {
      for (const pipe of modulePipes) {
        if (seen.has(pipe.categoria)) continue
        seen.add(pipe.categoria)

        const stages = getStagesForCategory(pipe.categoria)
        const nonFinal = stages.filter(s => !s.esEtapaFinal)
        const first = nonFinal[0]?.nombre || ''
        const last = nonFinal[nonFinal.length - 1]?.nombre || ''

        cats.push({
          categoria: pipe.categoria,
          nombre: pipe.nombre,
          icono: pipe.icono,
          descripcion: `${pipe.nombre} — ${first} → ${last}`,
        })
      }
    }

    return cats.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [])

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

  // Atajo de teclado: Delete/Supr para eliminar pipeline activo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Del' && e.key !== 'Supr') return
      // No activar si el usuario está escribiendo en un input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // No activar si hay algún diálogo abierto
      if (deletingPipeline || renamingPipeline || showNewPipelineDialog || showNewDealDialog || showConfigDialog || showReorderDialog) return

      e.preventDefault()
      const active = pipelines.find(p => p.id === activePipelineId)
      if (active) {
        setDeletingPipeline(active)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [deletingPipeline, renamingPipeline, showNewPipelineDialog, showNewDealDialog, showConfigDialog, activePipelineId, pipelines])

  // Auto-cerrar diálogo de eliminación tras 30s
  useEffect(() => {
    if (!deletingPipeline) {
      setDeleteCountdownSecs(30)
      return
    }
    const timer = setInterval(() => {
      setDeleteCountdownSecs(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setDeletingPipeline(null)
          setDeleteTargetPipelineId('')
          setDeleteConfirmText('')
          toast.info('Eliminación cancelada por tiempo de espera')
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [deletingPipeline])

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
    fetchPipelines()
  }, [])

  useEffect(() => {
    if (activePipelineId) {
      fetchData(activePipelineId)
    }
  }, [activePipelineId])

  const fetchPipelines = async () => {
    try {
      const res = await apiFetch('/api/pipelines')
      if (res.ok) {
        const data = await res.json()
        setPipelines(data.pipelines || [])
        setMaxPipelines(data.maxPipelines || 1)
        
        // Auto-select first pipeline or persisted one
        const saved = localStorage.getItem('active-pipeline-id')
        const defaultId = saved && data.pipelines?.some((p: any) => p.id === saved)
          ? saved
          : data.pipelines?.[0]?.id || ''
        setActivePipelineId(defaultId)
      } else {
        console.error('Error al cargar pipelines:', res.status)
        toast.error('Error al cargar los pipelines')
      }
    } catch (e) {
      console.error('Error fetching pipelines:', e)
      toast.error('Error de conexión al cargar pipelines')
    } finally {
      setLoading(false)
    }
  }

  const handlePipelineChange = (value: string) => {
    if (value === '__new__') {
      setShowNewPipelineDialog(true)
      return
    }
    setActivePipelineId(value)
    localStorage.setItem('active-pipeline-id', value)
  }

  const handleDeletePipeline = async () => {
    if (!deletingPipeline) return
    try {
      const body: any = {}
      // If pipeline has deals and a target is selected, migrate them
      if (deletingPipeline._count?.deals > 0 && deleteTargetPipelineId) {
        body.migrateToPipelineId = deleteTargetPipelineId
      }
      const res = await fetch(`/api/pipelines/${deletingPipeline.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        triggerHaptic()
        const data = await res.json()
        toast.success(data.message || `Pipeline "${deletingPipeline.nombre}" eliminado`)
        setDeletingPipeline(null)
        setDeleteTargetPipelineId('')
        await fetchPipelines()
        // If deleted pipeline was active, switch to first available
        if (activePipelineId === deletingPipeline.id) {
          const remaining = pipelines.filter(p => p.id !== deletingPipeline.id)
          if (remaining.length > 0) {
            setActivePipelineId(remaining[0].id)
            localStorage.setItem('active-pipeline-id', remaining[0].id)
          }
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al eliminar pipeline')
      }
    } catch (e) {
      toast.error('Error de conexión')
    }
  }

  const handleRenamePipeline = async () => {
    if (!renamingPipeline || !renamePipelineName.trim()) {
      toast.error('Nombre requerido')
      return
    }
    setRenamingPipelineLoading(true)
    try {
      const body: any = { nombre: renamePipelineName.trim() }
      if (renamePipelineColor !== renamingPipeline.color) body.color = renamePipelineColor
      if (renamePipelineIcono !== renamingPipeline.icono) body.icono = renamePipelineIcono

      if (body.nombre === renamingPipeline.nombre && !body.color && !body.icono) {
        setRenamingPipeline(null)
        return
      }

      const res = await fetch(`/api/pipelines/${renamingPipeline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const changed = []
        if (body.nombre !== renamingPipeline.nombre) changed.push(`renombrado a "${body.nombre}"`)
        if (body.color) changed.push('color actualizado')
        if (body.icono) changed.push('icono actualizado')
        toast.success(`Pipeline ${changed.join(' y ')}`)
        setRenamingPipeline(null)
        await fetchPipelines()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al actualizar pipeline')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setRenamingPipelineLoading(false)
    }
  }

  const handleDuplicatePipeline = async (pipeline: any) => {
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/duplicate`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Pipeline duplicado como "${data.pipeline.nombre}"`)
        // Set active BEFORE fetchPipelines so auto-select picks it up
        localStorage.setItem('active-pipeline-id', data.pipeline.id)
        setActivePipelineId(data.pipeline.id)
        await fetchPipelines()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al duplicar pipeline')
      }
    } catch (e) {
      toast.error('Error de conexión')
    }
  }

  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim()) {
      toast.error('Nombre requerido')
      return
    }
    setCreatingPipeline(true)
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: newPipelineName.trim(),
          categoria: newPipelineCategory === 'generic' ? undefined : newPipelineCategory,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Pipeline "${data.pipeline.nombre}" creado`)
        setShowNewPipelineDialog(false)
        setNewPipelineName('')
        setNewPipelineCategory('generic')
        await fetchPipelines()
        setActivePipelineId(data.pipeline.id)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear pipeline')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setCreatingPipeline(false)
    }
  }

  const fetchData = async (pipelineId?: string) => {
    try {
      setLoading(true)
      const pipelineParam = pipelineId ? `?pipelineId=${pipelineId}` : ''
      
      const [dealsRes, stagesRes] = await Promise.all([
        apiFetch(`/api/deals${pipelineParam}`),
        apiFetch(`/api/pipeline/stages${pipelineParam}`),
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

  // La divisa de los totales es la del tenant, no una constante MXN: el embudo
  // de un cliente español mostraba «$» junto a tarjetas en euros.
  const monedaTenant = useMonedaTenant()
  const formatCurrency = (value: number, currency: string = monedaTenant || 'EUR') => {
    return new Intl.NumberFormat('es-ES', {
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

  const hayFiltros = searchTerm.trim() !== '' || filterPrioridad !== 'all' || filterSalud !== 'all'

  const normalizeStageName = (name: string | null | undefined) => {
    if (!name) return "";
    try {
      return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    } catch (e) {
      console.error("Error normalizing stage name:", name, e);
      return String(name).toLowerCase().trim();
    }
  };

  // `etapa` llega como nombre en unos deals y como id de etapa en otros (los
  // creados por API), así que se aceptan las dos formas: si no, la tarjeta
  // existía para las métricas pero no aparecía en ninguna columna.
  const getDealsByStage = (stage: Stage) => {
    const nombreEtapa = normalizeStageName(stage.nombre)
    return filteredDeals.filter((deal) =>
      normalizeStageName(deal.etapa) === nombreEtapa || deal.etapa === stage.id
    )
  }

  const handleSincronizarPipelines = async () => {
    const res = await fetch('/api/pipelines/seed', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      toast.success(data.message || 'Pipelines sincronizados')
      await fetchPipelines()
    } else {
      const err = await res.json()
      toast.error(err.error || 'Error al sincronizar pipelines')
    }
  }

  const handleSincronizarOraculo = () => {
    toast.promise(apiFetch('/api/deals/sync', { method: 'POST' }), {
      loading: 'Consultando Oráculo de Ventas...',
      success: () => {
        fetchData(activePipelineId)
        return 'Pipeline sincronizado'
      },
      error: 'Error en la sincronización',
    })
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 sm:text-3xl">
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8" />
              Pipeline
            </h2>
            {pipelines.length > 0 && (
              <div className="flex items-center gap-1">
              <Select
                value={activePipelineId}
                onValueChange={(value) => {
                  setPipelineSearch('')
                  handlePipelineChange(value)
                }}
                onOpenChange={(open) => {
                  if (open) {
                    setPipelineSearch('')
                    setTimeout(() => pipelineSearchRef.current?.focus(), 50)
                  }
                }}
              >
                <SelectTrigger className="w-[190px] border-primary/20 sm:w-[260px]">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <SelectValue placeholder="Seleccionar pipeline" className="flex-1 min-w-0" />
                    <span className={`text-xs whitespace-nowrap flex-shrink-0 ${pipelines.length >= maxPipelines ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
                      {pipelines.length}/{maxPipelines}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {pipelines.length > 5 && (
                    <div
                      className="sticky top-0 z-10 bg-popover px-2 pb-1.5 pt-1"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          ref={pipelineSearchRef}
                          value={pipelineSearch}
                          onChange={(e) => setPipelineSearch(e.target.value)}
                          placeholder="Buscar pipeline..."
                          className="h-8 pl-8 text-xs"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  )}
                  {(() => {
                    const filtered = pipelines.filter(p => !pipelineSearch || p.nombre.toLowerCase().includes(pipelineSearch.toLowerCase()))
                    if (filtered.length === 0 && pipelineSearch) {
                      return (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          <Search className="h-4 w-4 mx-auto mb-1.5 opacity-40" />
                          Sin resultados para "{pipelineSearch}"
                        </div>
                      )
                    }
                    return filtered.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="group relative">
                      <div className="flex items-center gap-2 w-full min-w-0">
                        <span className="flex-shrink-0 text-sm">{p.icono || '📈'}</span>
                      <span className="truncate flex-1 min-w-0" title={p.nombre}>{p.nombre}</span>
                      {p.color && p.color !== '#3b82f6' && (
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      )}
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({p._count?.deals || 0})
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                            onPointerDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                            }}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[140px]">
                          <DropdownMenuItem
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setRenamingPipeline(p)
                              setRenamePipelineName(p.nombre)
                              setRenamePipelineColor(p.color || '#3b82f6')
                              setRenamePipelineIcono(p.icono || '📈')
                            }}
                          >
                            <Palette className="h-3.5 w-3.5 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              handleDuplicatePipeline(p)
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDeletingPipeline(p)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </SelectItem>
                    ))
                  })()}
                  {/* Always show create/limit footer, but hide border when search is active and no results */}
                  {pipelines.length < maxPipelines ? (
                    <>
                      <SelectItem value="__separator__" disabled className="h-px bg-border my-1" />
                      <SelectItem value="__new__" className="text-primary font-medium">
                        <Plus className="h-3.5 w-3.5 mr-2 inline" />
                        Crear pipeline
                      </SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="__separator__" disabled className="h-px bg-border my-1" />
                      <SelectItem value="__limit__" disabled className="text-xs text-muted-foreground opacity-70 cursor-not-allowed">
                        <AlertCircle className="h-3.5 w-3.5 mr-2 inline" />
                        Límite alcanzado ({pipelines.length}/{maxPipelines})
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => setShowNewPipelineDialog(true)}
                      disabled={pipelines.length >= maxPipelines}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {pipelines.length >= maxPipelines
                      ? `Límite de pipelines alcanzado (${maxPipelines}). Actualiza tu plan para crear más.`
                      : 'Crear nuevo pipeline'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setReorderPipelines([...pipelines].sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0)))
                  setShowReorderDialog(true)
                }}
                title="Reordenar pipelines"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              </div>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Visualiza y gestiona tus oportunidades de venta
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* En escritorio las acciones secundarias se ven directamente */}
          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="outline"
              className="border-muted-foreground/20 hover:bg-muted/50"
              onClick={handleSincronizarPipelines}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar pipelines
            </Button>
            <Button variant="outline" onClick={() => setShowConfigDialog(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Configurar etapas
            </Button>
            <Button
              variant="outline"
              className="border-primary/20 hover:bg-primary/5 text-primary"
              onClick={handleSincronizarOraculo}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Sincronizar oráculo
            </Button>
          </div>

          {/* En móvil caben en un solo menú para no empujar el botón principal */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="md:hidden">
                <MoreVertical className="h-4 w-4 mr-2" />
                Acciones
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowConfigDialog(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurar etapas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSincronizarPipelines}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sincronizar pipelines
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSincronizarOraculo}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Sincronizar oráculo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={showNewDealDialog} onOpenChange={setShowNewDealDialog}>
            <DialogTrigger asChild>
              <Button className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo deal
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
                pipelineId={activePipelineId}
                onSuccess={() => {
                  setShowNewDealDialog(false)
                  fetchData(activePipelineId)
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Métricas */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Oportunidades</CardTitle>
              <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-xl font-bold tabular-nums sm:text-2xl">{metrics.totalDeals}</div>
              <p className="text-[11px] text-muted-foreground">Deals activos en el embudo</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Valor del pipeline</CardTitle>
              <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="truncate text-xl font-bold tabular-nums sm:text-2xl">
                {formatCurrency(metrics.totalValor)}
              </div>
              <p className="text-[11px] text-muted-foreground">Suma de oportunidades abiertas</p>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-xs font-semibold text-primary">Previsión ponderada</CardTitle>
              <Coins className="h-4 w-4 shrink-0 text-primary" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="truncate text-xl font-bold tabular-nums text-primary sm:text-2xl">
                {formatCurrency(metrics.valorPonderado)}
              </div>
              <p className="text-[11px] text-muted-foreground">Ajustada por probabilidad de cada etapa</p>
            </CardContent>
          </Card>
          <Card className={metrics.gapAnalysis > 0 ? 'border-destructive/20 bg-destructive/5' : 'border-emerald-500/20 bg-emerald-500/5'}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className={`text-xs font-semibold ${metrics.gapAnalysis > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>Brecha vs objetivo</CardTitle>
              <ArrowUpDown className={`h-4 w-4 shrink-0 ${metrics.gapAnalysis > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`} />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className={`truncate text-xl font-bold tabular-nums sm:text-2xl ${metrics.gapAnalysis > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {formatCurrency(metrics.gapAnalysis)}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {metrics.gapAnalysis > 0 ? 'Falta para la meta' : 'Objetivo superado'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="search-deals"
            name="searchDeals"
            placeholder="Buscar por título, cliente o empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPrioridad} onValueChange={setFilterPrioridad}>
            <SelectTrigger className="flex-1 sm:w-[170px]">
              <Filter className="mr-2 h-4 w-4 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda prioridad</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="baja">Baja</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSalud} onValueChange={setFilterSalud}>
            <SelectTrigger className="flex-1 sm:w-[170px]">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <SelectValue placeholder="Estado de salud" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cualquier estado</SelectItem>
              <SelectItem value="HEALTHY">Saludables</SelectItem>
              <SelectItem value="WARNING">En observación</SelectItem>
              <SelectItem value="CRITICAL">Críticos</SelectItem>
              <SelectItem value="ZOMBIE">Zombies</SelectItem>
            </SelectContent>
          </Select>

          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => {
                setSearchTerm('')
                setFilterPrioridad('all')
                setFilterSalud('all')
              }}
              title="Quitar filtros"
            >
              <X className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Limpiar</span>
            </Button>
          )}
        </div>
      </div>

      {hayFiltros && (
        <p className="text-xs text-muted-foreground">
          {filteredDeals.length} de {deals.length} oportunidades coinciden con los filtros
        </p>
      )}

      {/* Pipeline Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:gap-4 sm:px-0 md:snap-none">
          {stages.filter((stage) => !stage.nombre.toLowerCase().includes('perdido')).length === 0 && (
            <div className="w-full rounded-xl border border-dashed p-10 text-center">
              <ListOrdered className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium">Este pipeline todavía no tiene etapas</p>
              <p className="mt-1 text-xs text-muted-foreground">Configura las etapas para empezar a mover oportunidades.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowConfigDialog(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurar etapas
              </Button>
            </div>
          )}
          {stages
            .filter((stage) => !stage.nombre.toLowerCase().includes('perdido'))
            .map((stage) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                deals={getDealsByStage(stage)}
                formatCurrency={formatCurrency}
                getPriorityColor={getPriorityColor}
                isCollapsed={collapsedStages.has(stage.nombre)}
                onToggleCollapse={() => toggleCollapseStage(stage.nombre)}
                activeDealId={activeId}
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

      {/* Modal de Editar Pipeline (nombre + color + icono) */}
      <Dialog open={!!renamingPipeline} onOpenChange={() => setRenamingPipeline(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Editar Pipeline
            </DialogTitle>
            <DialogDescription>
              Cambia el nombre, color o icono del pipeline
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleRenamePipeline(); }} className="space-y-4">
            <div>
              <Label htmlFor="renamePipelineName">Nombre *</Label>
              <Input
                id="renamePipelineName"
                value={renamePipelineName}
                onChange={(e) => setRenamePipelineName(e.target.value)}
                placeholder="Nombre del pipeline"
                autoFocus
              />
            </div>

            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {['#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#84cc16', '#f97316'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      renamePipelineColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setRenamePipelineColor(c)}
                  />
                ))}
                <Input
                  type="color"
                  value={renamePipelineColor}
                  onChange={(e) => setRenamePipelineColor(e.target.value)}
                  className="h-8 w-12 p-0 border-0"
                />
              </div>
            </div>

            <div>
              <Label>Icono</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {['📈', '👥', '🏗️', '🏠', '💰', '🚚', '🎯', '⭐', '🔥', '💼', '📊', '🛒', '🤝', '📋', '⚡', '🎓', '🏆', '🔧', '📦', '🌐'].map((ico) => (
                  <button
                    key={ico}
                    type="button"
                    className={`h-9 w-9 flex items-center justify-center rounded-lg border-2 text-lg transition-all ${
                      renamePipelineIcono === ico ? 'border-primary bg-primary/10 scale-110' : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                    onClick={() => setRenamePipelineIcono(ico)}
                  >
                    {ico}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenamingPipeline(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={renamingPipelineLoading}>
                {renamingPipelineLoading ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Nuevo Pipeline */}
      <Dialog open={showNewPipelineDialog} onOpenChange={setShowNewPipelineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Pipeline</DialogTitle>
            <DialogDescription>
              Los pipelines te permiten organizar deals por categoría
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreatePipeline(); }} className="space-y-4">
            <div>
              <Label htmlFor="pipelineName">Nombre del Pipeline *</Label>
              <Input
                id="pipelineName"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="Ej: CRM Ventas, RRHH, Proyectos..."
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="pipelineCategory">Categoría (etapas predefinidas)</Label>
              <Select value={newPipelineCategory} onValueChange={setNewPipelineCategory}>
                <SelectTrigger id="pipelineCategory">
                  <SelectValue placeholder="Etapas genéricas (por defecto)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generic">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📊</span>
                      <span>Etapas genéricas</span>
                    </div>
                  </SelectItem>
                  {pipelineCategories.map(cat => (
                    <SelectItem key={cat.categoria} value={cat.categoria}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat.icono}</span>
                        <span>{cat.descripcion}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Al seleccionar una categoría, el pipeline se creará con etapas predefinidas para ese tipo de negocio.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewPipelineDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creatingPipeline}>
                {creatingPipeline ? 'Creando...' : 'Crear Pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación de pipeline */}
      <AlertDialog open={!!deletingPipeline} onOpenChange={(open) => { if (!open) { setDeletingPipeline(null); setDeleteTargetPipelineId(''); setDeleteConfirmText(''); setDeleteCountdownSecs(30); setDeleteShakeKey(0); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              ¿Eliminar pipeline "{deletingPipeline?.nombre}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta acción eliminará el pipeline y sus etapas. No se puede deshacer.</p>

              {deletingPipeline?._count?.deals > 0 && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-2">
                  <p className="text-amber-600 font-medium text-sm">
                    ⚠️ Tiene {deletingPipeline._count.deals} deals activos.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="migrate-pipeline" className="text-sm font-medium">
                      Mover deals a:
                    </Label>
                    <Select
                      value={deleteTargetPipelineId}
                      onValueChange={setDeleteTargetPipelineId}
                    >
                      <SelectTrigger id="migrate-pipeline" className="w-full">
                        <SelectValue placeholder="Seleccionar pipeline destino..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines
                          .filter(p => p.id !== deletingPipeline?.id)
                          .map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2 w-full min-w-0">
                                <span className="truncate flex-1 min-w-0" title={p.nombre}>{p.nombre}</span>
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {p._count?.deals || 0} deals
                                </span>
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 flex-shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                                  +{deletingPipeline?._count?.deals || 0}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {deleteTargetPipelineId && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ArrowUpDown className="h-3 w-3" />
                        Se migrarán <strong>{deletingPipeline?._count?.deals || 0} deals</strong> a este pipeline
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Type-to-confirm */}
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                <Label htmlFor="delete-confirm" className="text-sm font-medium text-destructive">
                  Escribe <strong className="select-none">{deletingPipeline?.nombre}</strong> para confirmar
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deletingPipeline?.nombre || ''}
                  key={deleteShakeKey}
                  className={`border-destructive/30 focus-visible:ring-destructive/50 ${deleteShakeKey > 0 ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                  autoComplete="off"
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-destructive/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        deleteConfirmText === deletingPipeline?.nombre ? 'bg-green-500' : 'bg-destructive/40'
                      }`}
                      style={{ width: `${deletingPipeline?.nombre ? (deleteConfirmText.length / deletingPipeline.nombre.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono flex-shrink-0 ${
                    deleteConfirmText === deletingPipeline?.nombre ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {deleteConfirmText.length}/{deletingPipeline?.nombre?.length || 0}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  Se cerrará automáticamente en {deleteCountdownSecs}s
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Cancelar</AlertDialogCancel>
            <div onClick={() => {
              if (deleteConfirmText !== deletingPipeline?.nombre) {
                setDeleteShakeKey(k => k + 1)
              }
            }}>
              <AlertDialogAction
                onClick={() => {
                  setDeleteConfirmText('')
                  handleDeletePipeline()
                }}
                disabled={
                  deleteConfirmText !== deletingPipeline?.nombre ||
                  (deletingPipeline?._count?.deals > 0 && !deleteTargetPipelineId)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingPipeline?._count?.deals > 0
                  ? `Eliminar y migrar ${deletingPipeline._count.deals} deals`
                  : 'Eliminar permanentemente'}
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Configuración de Etapas */}
      <StageConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        stages={stages}
        pipelineId={activePipelineId}
        onUpdate={fetchData}
      />

      {/* Modal de Reordenar Pipelines */}
      <PipelineReorderDialog
        open={showReorderDialog}
        onOpenChange={(open) => { setShowReorderDialog(open); if (!open) fetchPipelines(); }}
        pipelines={reorderPipelines}
        setPipelines={setReorderPipelines}
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
  activeDealId,
}: {
  stage: Stage
  deals: Deal[]
  formatCurrency: (value: number, currency?: string) => string
  getPriorityColor: (prioridad: string) => string
  isCollapsed: boolean
  onToggleCollapse: () => void
  activeDealId?: string | null
}) {
  const totalValor = deals.reduce((sum, deal) => sum + deal.valor, 0)
  // Si toda la columna comparte divisa, el total se muestra en esa divisa y no
  // en la del tenant: un deal en euros no debe sumarse como si fuera en pesos.
  const monedaColumna = deals.length > 0 && deals.every((d) => d.moneda === deals[0].moneda)
    ? deals[0].moneda
    : undefined
  
  const { setNodeRef } = useDroppable({
    id: stage.nombre,
  })

  if (isCollapsed) {
    return (
      <div className="w-14 flex-shrink-0 snap-start">
        <div
          ref={setNodeRef}
          className="flex min-h-[520px] cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-2 transition-colors hover:bg-muted/50"
          style={{ borderColor: stage.color }}
          onClick={onToggleCollapse}
          aria-label={`Expandir ${stage.nombre}`}
        >
          <div
            className="mb-2 h-3 w-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-xs font-semibold" style={{ writingMode: 'vertical-rl' }}>
            {stage.nombre}
          </span>
          <Badge variant="secondary" className="mt-2 text-xs tabular-nums">
            {deals.length}
          </Badge>
          <span className="mt-2 text-[11px] text-muted-foreground" style={{ writingMode: 'vertical-rl' }}>
            {formatCurrency(totalValor, monedaColumna)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[85vw] max-w-[320px] flex-shrink-0 snap-start sm:w-80">
      <div
        ref={setNodeRef}
        className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card/60 shadow-sm"
      >
        {/* Franja del color de la etapa: identifica la columna de un vistazo */}
        <div className="h-1 w-full" style={{ backgroundColor: stage.color }} />

        <div className="border-b bg-card px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleCollapse}
              className="-ml-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Contraer ${stage.nombre}`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <h3 className="truncate text-sm font-semibold">{stage.nombre}</h3>
            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px] tabular-nums">
              {deals.length}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-1.5 pl-6 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{formatCurrency(totalValor, monedaColumna)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{stage.probabilidad}% de cierre</span>
          </div>
        </div>

        <div className="flex-1 space-y-2.5 p-2.5">
          {deals.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-center">
              <p className="text-xs font-medium text-muted-foreground">Sin oportunidades</p>
              <p className="mt-0.5 px-3 text-[11px] text-muted-foreground/70">Arrastra una tarjeta aquí</p>
            </div>
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                formatCurrency={formatCurrency}
                getPriorityColor={getPriorityColor}
                estaArrastrando={activeDealId === deal.id}
              />
            ))
          )}
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
  estaArrastrando = false,
}: {
  deal: Deal | undefined
  formatCurrency: (value: number, currency?: string) => string
  getPriorityColor: (prioridad: string) => string
  isDragging?: boolean
  estaArrastrando?: boolean
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal?.id || 'unknown',
  })

  if (!deal) return null;

  // El overlay ya sigue al puntero: aplicar aquí el transform duplicaría la tarjeta.
  const style = transform && !isDragging
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const handleViewDeal = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    router.push(`/dashboard/pipeline/${deal.id}`)
  }

  // Quién está detrás del deal, en una sola línea con los datos que existan.
  const contacto = deal.contact
    ? [deal.contact.nombre, deal.contact.cargo, deal.company?.nombre].filter(Boolean).join(' · ')
    : deal.lead
      ? [deal.lead.nombre, deal.lead.empresa].filter(Boolean).join(' · ')
      : ''

  const saludColor =
    deal.healthStatus === 'HEALTHY' ? 'bg-emerald-500'
      : deal.healthStatus === 'WARNING' ? 'bg-amber-500'
        : deal.healthStatus === 'CRITICAL' ? 'bg-red-500 ring-2 ring-red-500/25'
          : 'bg-slate-400'

  const fechaCierre = deal.fechaEstimadaCierre ? new Date(deal.fechaEstimadaCierre) : null
  const vencida = !!fechaCierre && fechaCierre.getTime() < Date.now()

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`group overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-primary/30 ${
        isDragging ? 'shadow-xl ring-2 ring-primary/40' : 'hover:shadow-md'
      } ${estaArrastrando ? 'opacity-40' : ''}`}
    >
      <CardContent className="p-3">
        {/* Zona de arrastre - Solo esta parte es draggable */}
        <div {...listeners} {...attributes} className="cursor-grab overflow-hidden active:cursor-grabbing">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${saludColor}`}
                  title={`Salud: ${deal.healthScore}/100`}
                  aria-label={`Salud ${deal.healthScore} de 100`}
                />
                <h4 className="truncate text-sm font-semibold">{deal.titulo}</h4>
              </div>
              {contacto && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={contacto}>
                  {contacto}
                </p>
              )}
            </div>
            <Badge
              variant={getPriorityColor(deal.prioridad) as any}
              className="shrink-0 px-1.5 text-[10px] capitalize"
            >
              {deal.prioridad}
            </Badge>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="truncate text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(deal.valor, deal.moneda)}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {deal.probabilidad}% cierre
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {fechaCierre && (
              <span className={`flex items-center gap-1 ${vencida ? 'font-medium text-destructive' : ''}`}>
                <Calendar className="h-3 w-3 shrink-0" />
                {fechaCierre.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                {vencida && ' · vencido'}
              </span>
            )}
            {deal.usuarioAsignado && (
              <span className="flex min-w-0 items-center gap-1">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{deal.usuarioAsignado.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Zona de acciones - NO es draggable */}
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            {deal._count && (
              <>
                <span className="truncate">{deal._count.actividades} act.</span>
                <span aria-hidden>·</span>
                <span className="truncate">{deal._count.cotizaciones} cotiz.</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={handleViewDeal}
            aria-label={`Abrir ${deal.titulo}`}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Abrir
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
  pipelineId,
  onUpdate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: Stage[]
  pipelineId?: string
  onUpdate: () => void
}) {
  const [localStages, setLocalStages] = useState<Stage[]>([])
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [showNewStageForm, setShowNewStageForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Stage | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteCountdownSecs, setDeleteCountdownSecs] = useState(30)
  const [deleteShakeKey, setDeleteShakeKey] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocalStages([...stages].sort((a, b) => a.orden - b.orden))
  }, [stages, open])

  // Auto-cerrar diálogo de eliminación tras 30s
  useEffect(() => {
    if (!deleteConfirm) {
      setDeleteCountdownSecs(30)
      return
    }
    const timer = setInterval(() => {
      setDeleteCountdownSecs(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setDeleteConfirm(null)
          setDeleteConfirmText('')
          toast.info('Eliminación cancelada por tiempo de espera')
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [deleteConfirm])

  const handleCreateStage = async (data: { nombre: string; color: string; probabilidad: number }) => {
    try {
      setSaving(true)
      const response = await apiFetch('/api/pipeline/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, pipelineId: pipelineId || undefined }),
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
        body: JSON.stringify({ ...data, pipelineId: pipelineId || undefined }),
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

      triggerHaptic()
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
                      Probabilidad: {stage.probabilidad}% • Orden: {stage.orden}
                    </span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[160px]">
                      <DropdownMenuItem
                        disabled={index === 0 || stage.esEtapaFinal || localStages[index - 1]?.esEtapaFinal}
                        onClick={() => handleReorder(stage.id, 'up')}
                      >
                        <ChevronRight className="h-3.5 w-3.5 mr-2 rotate-[-90deg]" />
                        Mover arriba
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === localStages.length - 1 || stage.esEtapaFinal || localStages[index + 1]?.esEtapaFinal}
                        onClick={() => handleReorder(stage.id, 'down')}
                      >
                        <ChevronRight className="h-3.5 w-3.5 mr-2 rotate-90" />
                        Mover abajo
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setEditingStage(stage)}
                      >
                        <Edit className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      {!stage.esEtapaFinal && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteConfirm(stage)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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

      {/* Confirmación de eliminación de etapa */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) { setDeleteConfirm(null); setDeleteConfirmText(''); setDeleteCountdownSecs(30); setDeleteShakeKey(0); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              ¿Eliminar etapa "{deleteConfirm?.nombre}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Esta acción no se puede deshacer. La etapa será eliminada permanentemente.</p>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                <Label htmlFor="delete-stage-confirm" className="text-sm font-medium text-destructive">
                  Escribe <strong className="select-none">{deleteConfirm?.nombre}</strong> para confirmar
                </Label>
                <Input
                  id="delete-stage-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteConfirm?.nombre || ''}
                  key={deleteShakeKey}
                  className={`border-destructive/30 focus-visible:ring-destructive/50 ${deleteShakeKey > 0 ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                  autoComplete="off"
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-destructive/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        deleteConfirmText === deleteConfirm?.nombre ? 'bg-green-500' : 'bg-destructive/40'
                      }`}
                      style={{ width: `${deleteConfirm?.nombre ? (deleteConfirmText.length / deleteConfirm.nombre.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono flex-shrink-0 ${
                    deleteConfirmText === deleteConfirm?.nombre ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {deleteConfirmText.length}/{deleteConfirm?.nombre?.length || 0}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  Se cerrará automáticamente en {deleteCountdownSecs}s
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Cancelar</AlertDialogCancel>
            <div onClick={() => {
              if (deleteConfirmText !== deleteConfirm?.nombre) {
                setDeleteShakeKey(k => k + 1)
              }
            }}>
              <AlertDialogAction
                onClick={() => {
                  setDeleteConfirmText('')
                  deleteConfirm && handleDeleteStage(deleteConfirm)
                }}
                disabled={deleteConfirmText !== deleteConfirm?.nombre}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar permanentemente
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Pipeline Reorder Dialog (drag & drop) ──────────────────────────────────

function PipelineReorderDialog({
  open,
  onOpenChange,
  pipelines,
  setPipelines,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelines: any[]
  setPipelines: (pipelines: any[]) => void
}) {
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const originalOrderRef = useRef<any[]>([])

  // Snapshot original order when dialog opens
  useEffect(() => {
    if (open) {
      originalOrderRef.current = [...pipelines]
    }
  }, [open])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = pipelines.findIndex((p) => p.id === active.id)
    const newIndex = pipelines.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(pipelines, oldIndex, newIndex)
    setPipelines(reordered)

    setSaving(true)
    try {
      // Persist new order: send PATCH calls in parallel
      const updates = reordered.map((p, i) =>
        fetch(`/api/pipelines/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: i + 1 }),
        })
      )
      const results = await Promise.all(updates)
      if (results.some(r => !r.ok)) {
        const err = await results.find(r => !r.ok)?.json()
        throw new Error(err?.error || 'Error al guardar orden')
      }
      toast.success('Orden actualizado')
    } catch (error: any) {
      toast.error(error.message)
      // Revert to original order before this drag
      setPipelines([...originalOrderRef.current])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5" />
            Reordenar Pipelines
          </DialogTitle>
          <DialogDescription>
            Arrastra los pipelines para cambiar su orden en el selector
          </DialogDescription>
        </DialogHeader>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={pipelines.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 py-2">
              {pipelines.map((p, i) => (
                <SortablePipelineItem
                  key={p.id}
                  pipeline={p}
                  index={i}
                  isDragging={activeId === p.id}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId && (
              <div className="bg-card border rounded-lg p-3 shadow-lg opacity-90">
                {pipelines.find(p => p.id === activeId)?.nombre}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <DialogFooter className="gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            {saving ? 'Guardando...' : `${pipelines.length} pipeline${pipelines.length !== 1 ? 's' : ''}`}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SortablePipelineItem({
  pipeline,
  index,
  isDragging,
}: {
  pipeline: any
  index: number
  isDragging: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: pipeline.id })

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
        isDragging ? 'z-50' : ''
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-xs text-muted-foreground font-mono w-5 flex-shrink-0">
        {index + 1}
      </span>
      <span className="font-medium truncate flex-1 min-w-0" title={pipeline.nombre}>{pipeline.nombre}</span>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {pipeline._count?.deals || 0} deals
      </span>
    </div>
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

function NewDealForm({ stages, pipelineId, onSuccess }: { stages: Stage[]; pipelineId?: string; onSuccess: () => void }) {
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
        pipelineId: pipelineId || undefined,
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
        const details = data.details ? Object.values(data.details).flat().join(' ') : ''
        throw new Error(details || data.error || 'Error al crear deal')
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
