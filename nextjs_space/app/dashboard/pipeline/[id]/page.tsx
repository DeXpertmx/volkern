'use client'

import { useState, useEffect } from 'react'
import { ETIQUETA_PUERTA, PUNTUACION_MINIMA, esContactoConCliente } from '@/lib/sales/training-gate'
import { RoleplaySimulator } from '@/components/training/RoleplaySimulator'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import {
  Card,
  CardContent,
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
import { Progress } from '@/components/ui/progress'
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
  Coins,
  Trash2,
  Plus,
  Phone,
  Mail,
  MessageSquare,
  FileText,
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
  GraduationCap,
} from 'lucide-react'
import { toast } from 'sonner'
import { GemmaDealCoach } from '@/components/deals/GemmaDealCoach'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'

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

const ETIQUETAS_PRIORIDAD: Record<string, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

const ETIQUETAS_TIPO: Record<string, string> = {
  actividad: 'Actividad',
  cita: 'Cita',
  tarea: 'Tarea',
  nota: 'Nota',
  interaccion: 'Interacción',
  cotizacion: 'Cotización',
  contrato: 'Contrato',
  cambio_etapa: 'Cambio de etapa',
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  activo: 'En curso',
  pendiente: 'Pendiente',
  completada: 'Completada',
  cancelada: 'Cancelada',
  confirmada: 'Confirmada',
  no_asistio: 'No asistió',
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  ganado: 'Ganado',
  perdido: 'Perdido',
  firmado: 'Firmado',
  vencido: 'Vencido',
}

/** «1 cita», «3 citas»: los recuentos del historial se leen como frases. */
function plural(cantidad: number, singular: string, varios: string) {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`
}

export default function DealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession() || {}
  const [deal, setDeal] = useState<Deal | null>(null)
  const [puertaActiva, setPuertaActiva] = useState(false)
  const [simuladorAbierto, setSimuladorAbierto] = useState(false)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [timelineStats, setTimelineStats] = useState<TimelineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timelineFilter, setTimelineFilter] = useState<string>('all')
  // Nombre y color reales de la etapa: `deal.etapa` guarda el nombre en unos
  // deals y el id en otros (los creados por API), y la ficha mostraba el id.
  const [etapaDetalle, setEtapaDetalle] = useState<{
    nombre: string
    color: string
    probabilidad: number
  } | null>(null)
  
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
      setEtapaDetalle(data.etapaDetalle ?? null)
      setPuertaActiva(
        typeof data.deal.tags === 'string' &&
          data.deal.tags.split(',').map((t: string) => t.trim()).includes(ETIQUETA_PUERTA)
      )
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

  const monedaTenant = useMonedaTenant()

  // La divisa manda el deal, no una constante: la ficha de un inmueble en euros
  // salía con formato de pesos. `formatearImporte` es el único módulo que
  // conoce divisas en la plataforma.
  const formatCurrency = (value: number, currency?: string) =>
    formatearImporte(value, currency || deal?.moneda || monedaTenant || 'EUR', 0)

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

  const contactoNombre = deal.contact?.nombre || deal.lead?.nombre || 'Sin contacto'
  const contactoEmpresa = deal.company?.nombre || deal.lead?.empresa || null
  const contactoEmail = deal.contact?.email || deal.lead?.email || null
  const contactoTelefono = deal.contact?.telefono || deal.lead?.telefono || null
  const subtituloContacto = [contactoNombre, deal.contact?.cargo, contactoEmpresa]
    .filter(Boolean)
    .join(' · ')

  const etapaNombre = etapaDetalle?.nombre
    || (deal.etapa ? deal.etapa.charAt(0).toUpperCase() + deal.etapa.slice(1) : 'Sin etapa')
  const etapaColor = etapaDetalle?.color || '#94a3b8'

  const estadoEtiqueta = ETIQUETAS_ESTADO[deal.estado] ?? deal.estado
  const claseEstado =
    deal.estado === 'ganado'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : deal.estado === 'perdido'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : ''

  const cierrePrevisto = deal.fechaEstimadaCierre ? new Date(deal.fechaEstimadaCierre) : null
  const cierreVencido = Boolean(
    cierrePrevisto && cierrePrevisto.getTime() < Date.now() && deal.estado === 'activo'
  )

  // Una tarjeta de detalles vacía solo ocupa sitio: si no hay nada que contar,
  // no se pinta.
  const hayDetalles = Boolean(
    deal.descripcion
      || deal.origen
      || deal.tags
      || deal.notasInternas
      || (deal.estado === 'perdido' && deal.razonPerdida)
  )

  // Solo se cuentan los tipos que existen: seis insignias con ceros escondían
  // la información útil entre ruido.
  const resumenTimeline = timelineStats
    ? [
        timelineStats.totalActividades > 0
          ? plural(timelineStats.totalActividades, 'actividad', 'actividades')
          : null,
        timelineStats.totalCitas > 0
          ? plural(timelineStats.totalCitas, 'cita', 'citas')
          : null,
        timelineStats.totalTareas > 0
          ? `${timelineStats.tareasCompletadas}/${timelineStats.totalTareas} tareas`
          : null,
        timelineStats.totalNotas > 0
          ? plural(timelineStats.totalNotas, 'nota', 'notas')
          : null,
        timelineStats.totalInteracciones > 0
          ? plural(timelineStats.totalInteracciones, 'interacción', 'interacciones')
          : null,
        timelineStats.totalCotizaciones > 0
          ? plural(timelineStats.totalCotizaciones, 'cotización', 'cotizaciones')
          : null,
        timelineStats.totalContratos > 0
          ? plural(timelineStats.totalContratos, 'contrato', 'contratos')
          : null,
      ].filter((texto): texto is string => Boolean(texto))
    : []

  return (
    <div className="flex-1 space-y-5 p-4 pt-6 md:p-8">
      {/* Cabecera: el título no empuja las acciones fuera de la pantalla */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          <Link href="/dashboard/pipeline">
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Volver al pipeline">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">
                {deal.titulo}
              </h1>
              <Badge variant="outline" className={claseEstado}>
                {estadoEtiqueta}
              </Badge>
            </div>
            <p className="mt-1 break-words text-sm text-muted-foreground">{subtituloContacto}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-11 sm:shrink-0 sm:pl-0">
          {deal.estado === 'activo' && (
            <>
              <Button onClick={handleMarkAsWon} size="sm" className="flex-1 sm:flex-none">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Ganado
              </Button>
              <Button
                onClick={handleMarkAsLost}
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Perdido
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más acciones">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteDeal} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar deal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Simulador de Roleplay (puerta de práctica) */}
      {simuladorAbierto && deal.leadId && (
        <RoleplaySimulator
          leadId={deal.leadId}
          leadName={deal.lead?.nombre ?? deal.titulo}
          onClose={() => setSimuladorAbierto(false)}
        />
      )}

      {/* PUERTA DE PRÁCTICA (bucle riesgo → roleplay): oportunidad en riesgo
          crítico que exige ensayar con el cliente real antes de contactar. */}
      {puertaActiva && deal.leadId && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/40 sm:flex-row sm:items-center">
          <GraduationCap className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Práctica requerida antes de contactar
            </p>
            <p className="text-sm text-amber-800/80 dark:text-amber-300/80">
              Esta oportunidad está en riesgo crítico: las llamadas, citas e
              interacciones están bloqueadas hasta que una sesión de práctica
              con {deal.lead?.nombre ?? 'este cliente'} alcance {PUNTUACION_MINIMA} puntos.
            </p>
          </div>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setSimuladorAbierto(true)}>
            <GraduationCap className="h-4 w-4 mr-2" />
            Practicar ahora
          </Button>
        </div>
      )}

      {/* Resumen: las cuatro cifras que se miran antes de decidir */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:p-5 lg:grid-cols-4">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Coins className="h-3.5 w-3.5" />
              Valor
            </p>
            <p className="truncate text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(deal.valor, deal.moneda)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Ponderado {formatCurrency((deal.valor * deal.probabilidad) / 100, deal.moneda)}
            </p>
          </div>

          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Etapa
            </p>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: etapaColor }}
              />
              <span className="truncate">{etapaNombre}</span>
            </p>
            <Progress value={Math.min(100, Math.max(0, deal.probabilidad))} className="h-1.5" />
            <p className="text-xs tabular-nums text-muted-foreground">
              {deal.probabilidad}% de probabilidad
            </p>
          </div>

          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Prioridad
            </p>
            <Badge variant={getPriorityColor(deal.prioridad)}>
              {ETIQUETAS_PRIORIDAD[deal.prioridad] ?? deal.prioridad}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {cierrePrevisto ? (
                <>
                  Cierre previsto{' '}
                  <span className={cierreVencido ? 'font-medium text-destructive' : 'text-foreground'}>
                    {format(cierrePrevisto, 'd MMM yyyy', { locale: es })}
                  </span>
                  {cierreVencido && ' · vencido'}
                </>
              ) : (
                'Sin fecha de cierre'
              )}
            </p>
          </div>

          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Responsable
            </p>
            <p className="truncate text-sm font-medium">
              {deal.usuarioAsignado?.name || 'Sin asignar'}
            </p>
            <p className="text-xs text-muted-foreground">
              Creado {formatDistanceToNow(new Date(deal.fechaCreacion), { addSuffix: true, locale: es })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Acciones rápidas: rejilla de dos columnas en móvil, fila en escritorio */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acciones rápidas</CardTitle>
          <p className="text-xs text-muted-foreground">
            Registra el seguimiento sin salir de la ficha
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Dialog open={showNewActivityDialog} onOpenChange={setShowNewActivityDialog}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="order-first col-span-2 w-full justify-start sm:order-none sm:col-span-1 sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar actividad
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva Actividad</DialogTitle>
                  <DialogDescription>Registra una actividad para este deal</DialogDescription>
                </DialogHeader>
                <NewActivityForm
                  dealId={deal.id}
                  puertaActiva={puertaActiva}
                  onPracticar={() => {
                    setShowNewActivityDialog(false)
                    if (deal.leadId) setSimuladorAbierto(true)
                  }}
                  onSuccess={() => {
                    setShowNewActivityDialog(false)
                    fetchTimeline()
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={showNewCitaDialog} onOpenChange={setShowNewCitaDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start sm:w-auto">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Agendar cita
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

            <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start sm:w-auto">
                  <ListTodo className="h-4 w-4 mr-2" />
                  Nueva tarea
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

            <Dialog open={showNewNoteDialog} onOpenChange={setShowNewNoteDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start sm:w-auto">
                  <StickyNote className="h-4 w-4 mr-2" />
                  Nueva nota
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

            <Link href={`/dashboard/cotizaciones/nueva?dealId=${deal.id}`}>
              <Button variant="outline" size="sm" className="w-full justify-start sm:w-auto">
                <FileText className="h-4 w-4 mr-2" />
                Nueva cotización
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Contenido: en móvil primero el cliente, después el historial */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg">Actividad de la oportunidad</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Todo lo que ha pasado en este deal, lo más reciente primero
                  </p>
                </div>
                <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                  <SelectTrigger className="w-full sm:w-[170px]" aria-label="Filtrar actividad">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo</SelectItem>
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
              {resumenTimeline.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {resumenTimeline.join(' · ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {filteredTimeline.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Clock className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm font-medium">Todavía no hay actividad</p>
                  <p className="mt-1 text-sm">
                    Registra la primera llamada, nota o cita con las acciones rápidas.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Línea vertical del timeline */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                  <div className="space-y-3">
                    {filteredTimeline.map((item) => (
                      <div key={`${item.tipo}-${item.id}`} className="relative pl-10">
                        <div
                          className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-white ${getTimelineColor(item)}`}
                        >
                          {getTimelineIcon(item)}
                        </div>

                        <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h4 className="break-words text-sm font-medium">{item.titulo}</h4>
                                <Badge variant="outline" className="text-[10px] font-normal">
                                  {ETIQUETAS_TIPO[item.tipo] ?? item.tipo}
                                </Badge>
                                {item.estado && (
                                  <Badge
                                    variant={item.estado === 'completada' ? 'default' : 'secondary'}
                                    className="text-[10px] font-normal"
                                  >
                                    {ETIQUETAS_ESTADO[item.estado] ?? item.estado.replace(/_/g, ' ')}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                <span>
                                  {format(new Date(item.fecha), 'd MMM yyyy, HH:mm', { locale: es })}
                                </span>
                                <span className="text-muted-foreground/40">·</span>
                                <span>
                                  {formatDistanceToNow(new Date(item.fecha), {
                                    addSuffix: true,
                                    locale: es,
                                  })}
                                </span>
                                {item.usuario?.name && (
                                  <>
                                    <span className="text-muted-foreground/40">·</span>
                                    <span>{item.usuario.name}</span>
                                  </>
                                )}
                              </p>
                            </div>
                            {item.duracion ? (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {item.duracion} min
                              </span>
                            ) : null}
                          </div>

                          {item.descripcion && (
                            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                              {item.descripcion}
                            </p>
                          )}

                          {/* Metadata específica por tipo */}
                          {item.tipo === 'cita' && item.metadata && (
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
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
                            <p className="mt-2 text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(item.metadata.total || 0, item.metadata.moneda)}
                            </p>
                          )}

                          {item.resultado && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              Resultado: {item.resultado.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          {/* Lead/Contact Info */}
          {(deal.lead || deal.contact) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-start gap-2 pb-1">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{contactoNombre}</p>
                    {(deal.contact?.cargo || contactoEmpresa) && (
                      <p className="break-words text-xs text-muted-foreground">
                        {[deal.contact?.cargo, contactoEmpresa].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {contactoEmail && (
                  <a
                    href={`mailto:${contactoEmail}`}
                    className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted hover:text-primary"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{contactoEmail}</span>
                  </a>
                )}

                {contactoTelefono && (
                  <a
                    href={`tel:${contactoTelefono.replace(/[^\d+]/g, '')}`}
                    className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm tabular-nums hover:bg-muted hover:text-primary"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{contactoTelefono}</span>
                  </a>
                )}

                {contactoEmpresa && (
                  <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                    <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{contactoEmpresa}</span>
                  </div>
                )}

                {deal.leadId && (
                  <Link href={`/dashboard/leads/${deal.leadId}`} className="block pt-2">
                    <Button variant="outline" size="sm" className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver lead completo
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deal Details */}
          {hayDetalles && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Detalles del deal</CardTitle>
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
                    <Label className="text-xs text-muted-foreground">Etiquetas</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
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
                    <Label className="text-xs text-muted-foreground">Razón de pérdida</Label>
                    <p className="text-sm">{deal.razonPerdida}</p>
                  </div>
                )}
                {deal.notasInternas && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notas internas</Label>
                    <p className="text-sm">{deal.notasInternas}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Links rápidos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Documentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/dashboard/cotizaciones?dealId=${deal.id}`}>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2" />
                  Cotizaciones
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {deal._count?.cotizaciones || 0}
                  </span>
                </Button>
              </Link>
              <Link href={`/dashboard/contratos?dealId=${deal.id}`}>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <ScrollText className="h-4 w-4 mr-2" />
                  Contratos
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {deal._count?.contratos || 0}
                  </span>
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* En escritorio el coach abre la columna; en móvil va al final */}
          <div className="order-last lg:order-first">
            <GemmaDealCoach dealId={deal.id} />
          </div>
        </aside>
      </div>
    </div>
  )
}

// Formulario de nueva actividad
function NewActivityForm({
  dealId,
  onSuccess,
  puertaActiva,
  onPracticar,
}: {
  dealId: string
  onSuccess: () => void
  puertaActiva?: boolean
  onPracticar?: () => void
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
        // PUERTA DE PRÁCTICA: 423 — el contacto con el cliente está bloqueado.
        // En vez de un error genérico, se avisa con el motivo del servidor y
        // se ofrece la práctica en el mismo diálogo.
        if (response.status === 423) {
          const cuerpo = await response.json().catch(() => null)
          toast.warning(
            cuerpo?.error ?? 'Práctica requerida antes de contactar al cliente'
          )
          onPracticar?.()
          return
        }
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

      {/* PUERTA DE PRÁCTICA: aviso proactivo — si el tipo elegido es contacto
          y la puerta está activa, el envío devolverá 423. Se ofrece la
          práctica aquí, antes del rechazo. */}
      {puertaActiva && esContactoConCliente(formData.tipo) && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 p-3">
          <GraduationCap className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Este contacto está bloqueado: la oportunidad está en riesgo
              crítico y exige practicar con el cliente antes de contactarlo.
            </p>
            {onPracticar && (
              <Button type="button" size="sm" className="mt-2" onClick={onPracticar}>
                <GraduationCap className="h-4 w-4 mr-2" />
                Practicar ahora
              </Button>
            )}
          </div>
        </div>
      )}

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
      const response = await apiFetch('/api/tasks', {
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
      const response = await apiFetch('/api/citas', {
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
