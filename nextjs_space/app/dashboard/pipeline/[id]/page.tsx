'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Calendar,
  User,
  DollarSign,
  Edit,
  Trash2,
  Plus,
  Phone,
  Mail,
  MessageSquare,
  FileText,
  Upload,
  Download,
  Clock,
  TrendingUp,
  CheckCircle2,
  XCircle,
  MoreVertical,
  ExternalLink,
  CalendarPlus,
  ListTodo,
  StickyNote,
  Video,
  MapPin,
  Link as LinkIcon,
  ScrollText,
  Briefcase,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Deal {
  id: string
  titulo: string
  descripcion: string | null
  valor: number
  moneda: string
  etapa: string
  probabilidad: number
  prioridad: string
  estado: string
  fechaEstimadaCierre: string | null
  fechaCierre: string | null
  fechaCreacion: string
  fechaActualizacion: string
  origen: string | null
  tags: string | null
  razonPerdida: string | null
  competidor: string | null
  notasInternas: string | null
  valorReal: number | null
  descuento: number | null
  leadId: string | null
  contactId: string | null
  lead: {
    id: string
    nombre: string
    email: string
    telefono: string | null
    empresa: string | null
  } | null
  contact: {
    id: string
    nombre: string
    email: string
    telefono: string | null
    cargo: string | null
  } | null
  company: {
    id: string
    nombre: string
  } | null
  usuarioAsignado: {
    id: string
    name: string
    email: string
  } | null
  _count?: {
    actividades: number
    cotizaciones: number
    archivos: number
    comisiones: number
    contratos: number
  }
}

interface TimelineItem {
  id: string
  tipo: 'actividad' | 'cita' | 'tarea' | 'nota' | 'interaccion' | 'cambio_etapa' | 'cotizacion' | 'contrato'
  subtipo?: string
  titulo: string
  descripcion?: string | null
  fecha: string
  estado?: string
  resultado?: string | null
  duracion?: number | null
  usuario?: {
    id: string
    name: string | null
  } | null
  metadata?: any
}

interface TimelineStats {
  totalActividades: number
  totalCitas: number
  totalTareas: number
  tareasCompletadas: number
  totalNotas: number
  totalInteracciones: number
  totalCotizaciones: number
  totalContratos: number
}

export default function DealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession() || {}
  const [deal, setDeal] = useState<Deal | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [timelineStats, setTimelineStats] = useState<TimelineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timelineFilter, setTimelineFilter] = useState<string>('all')
  
  // Dialogs
  const [showNewActivityDialog, setShowNewActivityDialog] = useState(false)
  const [showNewNoteDialog, setShowNewNoteDialog] = useState(false)
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false)
  const [showNewCitaDialog, setShowNewCitaDialog] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  useEffect(() => {
    fetchDeal()
    fetchTimeline()
  }, [params.id])

  const fetchDeal = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/deals/${params.id}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar deal')
      }

      const data = await response.json()
      setDeal(data.deal)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar el deal')
      router.push('/dashboard/pipeline')
    } finally {
      setLoading(false)
    }
  }

  const fetchTimeline = async () => {
    try {
      const response = await fetch(`/api/deals/${params.id}/timeline`)
      if (response.ok) {
        const data = await response.json()
        setTimeline(data.timeline || [])
        setTimelineStats(data.stats || null)
      }
    } catch (error) {
      console.error('Error al cargar timeline:', error)
    }
  }

  const handleUpdateDeal = async (updates: Partial<Deal>) => {
    try {
      const response = await fetch(`/api/deals/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar deal')
      }

      toast.success('Deal actualizado')
      fetchDeal()
      fetchTimeline()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar deal')
    }
  }

  const handleDeleteDeal = async () => {
    if (!confirm('¿Estás seguro de eliminar este deal? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      const response = await fetch(`/api/deals/${params.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Error al eliminar deal')
      }

      toast.success('Deal eliminado')
      router.push('/dashboard/pipeline')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar deal')
    }
  }

  const handleMarkAsWon = async () => {
    await handleUpdateDeal({ estado: 'ganado', etapa: 'ganado' } as any)
  }

  const handleMarkAsLost = async () => {
    const razon = prompt('¿Por qué se perdió este deal?')
    if (razon !== null) {
      await handleUpdateDeal({ estado: 'perdido', etapa: 'perdido', razonPerdida: razon } as any)
    }
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

  const getTimelineIcon = (item: TimelineItem) => {
    switch (item.tipo) {
      case 'cita':
        return <Calendar className="h-4 w-4" />
      case 'tarea':
        return <ListTodo className="h-4 w-4" />
      case 'nota':
        return <StickyNote className="h-4 w-4" />
      case 'interaccion':
        if (item.subtipo === 'llamada') return <Phone className="h-4 w-4" />
        if (item.subtipo === 'email') return <Mail className="h-4 w-4" />
        if (item.subtipo === 'whatsapp') return <MessageSquare className="h-4 w-4" />
        return <MessageSquare className="h-4 w-4" />
      case 'actividad':
        if (item.subtipo === 'llamada') return <Phone className="h-4 w-4" />
        if (item.subtipo === 'email') return <Mail className="h-4 w-4" />
        if (item.subtipo === 'reunion' || item.subtipo === 'reunión') return <Video className="h-4 w-4" />
        if (item.subtipo === 'cambio_etapa') return <TrendingUp className="h-4 w-4" />
        return <Clock className="h-4 w-4" />
      case 'cotizacion':
        return <FileText className="h-4 w-4" />
      case 'contrato':
        return <ScrollText className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getTimelineColor = (item: TimelineItem) => {
    switch (item.tipo) {
      case 'cita':
        return 'bg-blue-500'
      case 'tarea':
        return item.estado === 'completada' ? 'bg-green-500' : 'bg-orange-500'
      case 'nota':
        return 'bg-yellow-500'
      case 'interaccion':
        return 'bg-purple-500'
      case 'actividad':
        return 'bg-gray-500'
      case 'cotizacion':
        return 'bg-indigo-500'
      case 'contrato':
        return 'bg-emerald-500'
      default:
        return 'bg-gray-500'
    }
  }

  const filteredTimeline = timeline.filter(item => {
    if (timelineFilter === 'all') return true
    return item.tipo === timelineFilter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando deal...</p>
        </div>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Deal no encontrado</h2>
          <p className="text-muted-foreground mb-4">
            El deal que buscas no existe o no tienes acceso a él
          </p>
          <Link href="/dashboard/pipeline">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Pipeline
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/pipeline">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{deal.titulo}</h2>
            <p className="text-muted-foreground mt-1">
              {deal.contact ? (
                <>
                  {deal.contact.nombre}
                  {deal.contact.cargo && ` • ${deal.contact.cargo}`}
                  {deal.company && ` • ${deal.company.nombre}`}
                </>
              ) : deal.lead && (
                <>
                  {deal.lead.nombre}
                  {deal.lead.empresa && ` • ${deal.lead.empresa}`}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {deal.estado === 'activo' && (
            <>
              <Button onClick={handleMarkAsWon} variant="default">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Marcar Ganado
              </Button>
              <Button onClick={handleMarkAsLost} variant="outline">
                <XCircle className="h-4 w-4 mr-2" />
                Marcar Perdido
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteDeal} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(deal.valor, deal.moneda)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Valor ponderado: {formatCurrency(deal.valor * deal.probabilidad / 100, deal.moneda)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Etapa</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{deal.etapa}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Probabilidad: {deal.probabilidad}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prioridad</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={getPriorityColor(deal.prioridad)} className="text-base">
              {deal.prioridad}
            </Badge>
            {deal.fechaEstimadaCierre && (
              <p className="text-xs text-muted-foreground mt-2">
                Cierre estimado: {new Date(deal.fechaEstimadaCierre).toLocaleDateString('es-MX')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Asignado</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {deal.usuarioAsignado?.name || 'Sin asignar'}
            </div>
            {deal.fechaCreacion && (
              <p className="text-xs text-muted-foreground mt-2">
                Creado {formatDistanceToNow(new Date(deal.fechaCreacion), { addSuffix: true, locale: es })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acciones Rápidas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Dialog open={showNewNoteDialog} onOpenChange={setShowNewNoteDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <StickyNote className="h-4 w-4 mr-2" />
                  Nueva Nota
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva Nota</DialogTitle>
                  <DialogDescription>Agrega una nota a este deal</DialogDescription>
                </DialogHeader>
                <NewNoteForm
                  leadId={deal.leadId}
                  dealId={deal.id}
                  onSuccess={() => {
                    setShowNewNoteDialog(false)
                    fetchTimeline()
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListTodo className="h-4 w-4 mr-2" />
                  Nueva Tarea
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva Tarea</DialogTitle>
                  <DialogDescription>Crea una tarea relacionada a este deal</DialogDescription>
                </DialogHeader>
                <NewTaskForm
                  leadId={deal.leadId}
                  onSuccess={() => {
                    setShowNewTaskDialog(false)
                    fetchTimeline()
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={showNewCitaDialog} onOpenChange={setShowNewCitaDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Agendar Cita
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agendar Cita</DialogTitle>
                  <DialogDescription>Programa una cita con el contacto</DialogDescription>
                </DialogHeader>
                <NewCitaForm
                  leadId={deal.leadId}
                  onSuccess={() => {
                    setShowNewCitaDialog(false)
                    fetchTimeline()
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={showNewActivityDialog} onOpenChange={setShowNewActivityDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Actividad
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva Actividad</DialogTitle>
                  <DialogDescription>Registra una actividad para este deal</DialogDescription>
                </DialogHeader>
                <NewActivityForm
                  dealId={deal.id}
                  onSuccess={() => {
                    setShowNewActivityDialog(false)
                    fetchTimeline()
                  }}
                />
              </DialogContent>
            </Dialog>

            <Link href={`/dashboard/cotizaciones/nueva?dealId=${deal.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Nueva Cotización
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Main Content - Timeline y Detalles */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column - Timeline */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Timeline de la Oportunidad</CardTitle>
                <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="actividad">Actividades</SelectItem>
                    <SelectItem value="cita">Citas</SelectItem>
                    <SelectItem value="tarea">Tareas</SelectItem>
                    <SelectItem value="nota">Notas</SelectItem>
                    <SelectItem value="interaccion">Interacciones</SelectItem>
                    <SelectItem value="cotizacion">Cotizaciones</SelectItem>
                    <SelectItem value="contrato">Contratos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {timelineStats && (
                <div className="flex flex-wrap gap-3 mt-3">
                  <Badge variant="secondary">{timelineStats.totalActividades} actividades</Badge>
                  <Badge variant="secondary">{timelineStats.totalCitas} citas</Badge>
                  <Badge variant="secondary">{timelineStats.tareasCompletadas}/{timelineStats.totalTareas} tareas</Badge>
                  <Badge variant="secondary">{timelineStats.totalNotas} notas</Badge>
                  <Badge variant="secondary">{timelineStats.totalCotizaciones} cotizaciones</Badge>
                  <Badge variant="secondary">{timelineStats.totalContratos} contratos</Badge>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {filteredTimeline.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No hay elementos en el timeline</p>
                  <p className="text-sm">Usa las acciones rápidas para agregar actividades</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Línea vertical del timeline */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  
                  <div className="space-y-4">
                    {filteredTimeline.map((item) => (
                      <div key={`${item.tipo}-${item.id}`} className="relative pl-10">
                        {/* Icono del timeline */}
                        <div className={`absolute left-0 top-1 h-8 w-8 rounded-full flex items-center justify-center text-white ${getTimelineColor(item)}`}>
                          {getTimelineIcon(item)}
                        </div>
                        
                        <Card className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-sm">{item.titulo}</h4>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {item.tipo}
                                  </Badge>
                                  {item.estado && (
                                    <Badge 
                                      variant={item.estado === 'completada' ? 'default' : 'secondary'} 
                                      className="text-xs"
                                    >
                                      {item.estado}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(item.fecha), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                  {item.usuario?.name && ` • ${item.usuario.name}`}
                                </p>
                              </div>
                              {item.duracion && (
                                <span className="text-xs text-muted-foreground">
                                  {item.duracion} min
                                </span>
                              )}
                            </div>
                            
                            {item.descripcion && (
                              <p className="text-sm mt-2 text-muted-foreground line-clamp-3">
                                {item.descripcion}
                              </p>
                            )}

                            {/* Metadata específica por tipo */}
                            {item.tipo === 'cita' && item.metadata && (
                              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                                {item.metadata.ubicacion && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {item.metadata.ubicacion}
                                  </span>
                                )}
                                {item.metadata.linkReunion && (
                                  <a 
                                    href={item.metadata.linkReunion} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                    Link de reunión
                                  </a>
                                )}
                              </div>
                            )}

                            {(item.tipo === 'cotizacion' || item.tipo === 'contrato') && item.metadata && (
                              <div className="mt-2">
                                <span className="text-sm font-medium text-green-600">
                                  {formatCurrency(item.metadata.total || 0, item.metadata.moneda || 'MXN')}
                                </span>
                              </div>
                            )}

                            {item.resultado && (
                              <Badge variant="outline" className="mt-2 text-xs">
                                Resultado: {item.resultado}
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Info & Links */}
        <div className="space-y-6">
          {/* Lead/Contact Info */}
          {(deal.lead || deal.contact) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información del Contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <p className="font-medium">{deal.contact?.nombre || deal.lead?.nombre}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="text-sm">{deal.contact?.email || deal.lead?.email}</p>
                </div>
                {(deal.contact?.telefono || deal.lead?.telefono) && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Teléfono</Label>
                    <p className="text-sm">{deal.contact?.telefono || deal.lead?.telefono}</p>
                  </div>
                )}
                {(deal.lead?.empresa || deal.company) && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Empresa</Label>
                    <p className="text-sm">{deal.company?.nombre || deal.lead?.empresa}</p>
                  </div>
                )}
                {deal.leadId && (
                  <Link href={`/dashboard/leads/${deal.leadId}`}>
                    <Button variant="outline" size="sm" className="w-full mt-2">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Lead Completo
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deal Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalles del Deal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deal.descripcion && (
                <div>
                  <Label className="text-xs text-muted-foreground">Descripción</Label>
                  <p className="text-sm">{deal.descripcion}</p>
                </div>
              )}
              {deal.origen && (
                <div>
                  <Label className="text-xs text-muted-foreground">Origen</Label>
                  <p className="text-sm capitalize">{deal.origen}</p>
                </div>
              )}
              {deal.tags && (
                <div>
                  <Label className="text-xs text-muted-foreground">Tags</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {deal.tags.split(',').map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {deal.estado === 'perdido' && deal.razonPerdida && (
                <div>
                  <Label className="text-xs text-muted-foreground">Razón de Pérdida</Label>
                  <p className="text-sm">{deal.razonPerdida}</p>
                </div>
              )}
              {deal.notasInternas && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notas Internas</Label>
                  <p className="text-sm">{deal.notasInternas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Links Rápidos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acceso Rápido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/dashboard/cotizaciones?dealId=${deal.id}`}>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Cotizaciones ({deal._count?.cotizaciones || 0})
                </Button>
              </Link>
              <Link href={`/dashboard/contratos?dealId=${deal.id}`}>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <ScrollText className="h-4 w-4 mr-2" />
                  Ver Contratos ({deal._count?.contratos || 0})
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Formulario de nueva actividad
function NewActivityForm({
  dealId,
  onSuccess,
}: {
  dealId: string
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    tipo: 'nota',
    titulo: '',
    descripcion: '',
    resultado: '',
    duracion: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/deals/${dealId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          duracion: formData.duracion ? parseInt(formData.duracion) : null,
        }),
      })

      if (!response.ok) {
        throw new Error('Error al crear actividad')
      }

      toast.success('Actividad creada')
      onSuccess()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al crear actividad')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="tipo">Tipo *</Label>
        <Select
          value={formData.tipo}
          onValueChange={(value) => setFormData({ ...formData, tipo: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="llamada">Llamada</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="reunion">Reunión</SelectItem>
            <SelectItem value="nota">Nota</SelectItem>
            <SelectItem value="tarea">Tarea</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          placeholder="Ej: Llamada de seguimiento"
          required
        />
      </div>

      <div>
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          value={formData.descripcion}
          onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
          placeholder="Detalles de la actividad..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="resultado">Resultado</Label>
          <Select
            value={formData.resultado}
            onValueChange={(value) => setFormData({ ...formData, resultado: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exitoso">Exitoso</SelectItem>
              <SelectItem value="no_exitoso">No exitoso</SelectItem>
              <SelectItem value="sin_respuesta">Sin respuesta</SelectItem>
              <SelectItem value="reagendar">Reagendar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="duracion">Duración (min)</Label>
          <Input
            id="duracion"
            type="number"
            value={formData.duracion}
            onChange={(e) => setFormData({ ...formData, duracion: e.target.value })}
            placeholder="30"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creando...' : 'Crear Actividad'}
        </Button>
      </div>
    </form>
  )
}

// Formulario de nueva nota
function NewNoteForm({
  leadId,
  dealId,
  onSuccess,
}: {
  leadId: string | null
  dealId: string
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [contenido, setContenido] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contenido.trim()) {
      toast.error('La nota no puede estar vacía')
      return
    }
    setLoading(true)

    try {
      // Si hay leadId, crear nota en el lead, sino crear como actividad del deal
      if (leadId) {
        const response = await fetch(`/api/leads/${leadId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contenido }),
        })

        if (!response.ok) {
          throw new Error('Error al crear nota')
        }
      } else {
        // Crear como actividad del deal
        const response = await fetch(`/api/deals/${dealId}/activities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'nota',
            titulo: 'Nota',
            descripcion: contenido,
          }),
        })

        if (!response.ok) {
          throw new Error('Error al crear nota')
        }
      }

      toast.success('Nota creada')
      onSuccess()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al crear nota')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="contenido">Contenido *</Label>
        <Textarea
          id="contenido"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="Escribe tu nota aquí..."
          rows={5}
          required
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar Nota'}
        </Button>
      </div>
    </form>
  )
}

// Formulario de nueva tarea
function NewTaskForm({
  leadId,
  onSuccess,
}: {
  leadId: string | null
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'recordatorio',
    fechaVencimiento: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadId) {
      toast.error('No hay lead asociado a este deal')
      return
    }
    setLoading(true)

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          leadId,
        }),
      })

      if (!response.ok) {
        throw new Error('Error al crear tarea')
      }

      toast.success('Tarea creada')
      onSuccess()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al crear tarea')
    } finally {
      setLoading(false)
    }
  }

  if (!leadId) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No hay lead asociado a este deal. Las tareas requieren un lead.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          placeholder="Ej: Enviar propuesta"
          required
        />
      </div>

      <div>
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          value={formData.descripcion}
          onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
          placeholder="Detalles de la tarea..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="tipo">Tipo</Label>
          <Select
            value={formData.tipo}
            onValueChange={(value) => setFormData({ ...formData, tipo: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="llamada">Llamada</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="reunion">Reunión</SelectItem>
              <SelectItem value="recordatorio">Recordatorio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="fechaVencimiento">Fecha Límite *</Label>
          <Input
            id="fechaVencimiento"
            type="datetime-local"
            value={formData.fechaVencimiento}
            onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creando...' : 'Crear Tarea'}
        </Button>
      </div>
    </form>
  )
}

// Formulario de nueva cita
function NewCitaForm({
  leadId,
  onSuccess,
}: {
  leadId: string | null
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'reunion',
    fechaHora: '',
    duracion: '60',
    ubicacion: '',
    linkReunion: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadId) {
      toast.error('No hay lead asociado a este deal')
      return
    }
    setLoading(true)

    try {
      const response = await fetch('/api/citas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          leadId,
          duracion: parseInt(formData.duracion),
        }),
      })

      if (!response.ok) {
        throw new Error('Error al crear cita')
      }

      toast.success('Cita agendada')
      onSuccess()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al crear cita')
    } finally {
      setLoading(false)
    }
  }

  if (!leadId) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No hay lead asociado a este deal. Las citas requieren un lead.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="titulo">Título *</Label>
        <Input
          id="titulo"
          value={formData.titulo}
          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
          placeholder="Ej: Demostración de producto"
          required
        />
      </div>

      <div>
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          value={formData.descripcion}
          onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
          placeholder="Detalles de la cita..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="tipo">Tipo</Label>
          <Select
            value={formData.tipo}
            onValueChange={(value) => setFormData({ ...formData, tipo: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reunion">Reunión</SelectItem>
              <SelectItem value="llamada">Llamada</SelectItem>
              <SelectItem value="demo">Demo</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="duracion">Duración (min)</Label>
          <Select
            value={formData.duracion}
            onValueChange={(value) => setFormData({ ...formData, duracion: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutos</SelectItem>
              <SelectItem value="30">30 minutos</SelectItem>
              <SelectItem value="45">45 minutos</SelectItem>
              <SelectItem value="60">1 hora</SelectItem>
              <SelectItem value="90">1.5 horas</SelectItem>
              <SelectItem value="120">2 horas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="fechaHora">Fecha y Hora *</Label>
        <Input
          id="fechaHora"
          type="datetime-local"
          value={formData.fechaHora}
          onChange={(e) => setFormData({ ...formData, fechaHora: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="ubicacion">Ubicación</Label>
        <Input
          id="ubicacion"
          value={formData.ubicacion}
          onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
          placeholder="Ej: Oficina principal o Virtual"
        />
      </div>

      <div>
        <Label htmlFor="linkReunion">Link de Reunión (Zoom, Meet, etc.)</Label>
        <Input
          id="linkReunion"
          value={formData.linkReunion}
          onChange={(e) => setFormData({ ...formData, linkReunion: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Agendando...' : 'Agendar Cita'}
        </Button>
      </div>
    </form>
  )
}
