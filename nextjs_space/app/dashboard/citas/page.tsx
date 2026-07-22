'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarIcon, Clock, MapPin, Video, List, CalendarDays, Settings2, RefreshCw, CheckCircle2, AlertCircle, Link2 } from 'lucide-react'
import { CalendarListPanel } from '@/components/CalendarListPanel'

interface GoogleCalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  calendarName: string
  calendarColor: string
}
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { apiFetch } from '@/lib/api-client'

// Importar calendario dinámicamente para evitar SSR
const CalendarView = dynamic(() => import('@/components/calendar-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  ),
})

interface Cita {
  id: string
  leadId: string
  servicioId?: string | null
  tipo: string
  titulo?: string | null
  descripcion?: string | null
  ubicacion?: string | null
  linkReunion?: string | null
  fechaHora: string
  duracion: number
  estado: string
  lead?: {
    id: string
    nombre: string
    email: string
    empresa?: string | null
  }
  servicio?: {
    id: string
    nombre: string
    descripcion?: string | null
  } | null
}

interface Lead {
  id: string
  nombre: string
  email: string
  empresa?: string
}

interface Contact {
  id: string
  nombre: string
  email: string
  tipo: string
  company?: {
    nombre: string
  } | null
}

const tipoLabels: Record<string, string> = {
  reunion: '🤝 Reunión',
  llamada: '📞 Llamada',
  demo: '🎯 Demo',
  servicio: '💼 Servicio',
  otro: '📋 Otro',
}

const estadoColors: Record<string, string> = {
  pendiente: 'bg-yellow-500',
  confirmada: 'bg-blue-500',
  completada: 'bg-green-500',
  cancelada: 'bg-red-500',
}

const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

export default function CitasPage() {
  const [citas, setCitas] = useState<Cita[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('calendario')
  const [filtroEstado, setFiltroEstado] = useState('all')
  const [filtroTipo, setFiltroTipo] = useState('all')
  const [isMobile, setIsMobile] = useState(false)
  const [showGCalSection, setShowGCalSection] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalSyncing, setGcalSyncing] = useState(false)
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])
  const [connectedCalendars, setConnectedCalendars] = useState<any[]>([])
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  // Compute visible calendars
  const visibleCalendarIds = useMemo(
    () => connectedCalendars.filter(c => c.visible).map(c => c.id),
    [connectedCalendars]
  )

  // Fetch Google Calendar events when date range or visible calendars change
  const fetchGoogleEvents = useCallback(async (date: Date, calendarIds: string[]) => {
    if (calendarIds.length === 0) {
      setGoogleEvents([])
      return
    }

    try {
      // Calculate range: current view ± 2 months for context
      const startOfMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1)
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 2, 0, 23, 59, 59)

      const res = await fetch('/api/calendars/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarIds,
          timeMin: startOfMonth.toISOString(),
          timeMax: endOfMonth.toISOString(),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setGoogleEvents(data.events || [])
      }
    } catch (e) {
      console.error('Error fetching Google events:', e)
    }
  }, [])

  // Re-fetch when visible calendars or current date changes
  useEffect(() => {
    fetchGoogleEvents(currentDate, visibleCalendarIds)
  }, [currentDate, visibleCalendarIds, fetchGoogleEvents])

  // Handle calendar list changes from CalendarListPanel
  const handleCalendarsChange = useCallback((calendars: any[]) => {
    setConnectedCalendars(calendars)
  }, [])

  // Handle date range changes from CalendarView navigation
  const handleDateRangeChange = useCallback((date: Date) => {
    setCurrentDate(date)
  }, [])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    fetchData()
    checkGCalConnection()

    // Check for OAuth callback params
    const searchParams = new URLSearchParams(window.location.search)
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'google_calendar_connected') {
      toast.success('Google Calendar conectado exitosamente')
      setGcalConnected(true)
      window.history.replaceState({}, '', '/dashboard/citas')
    }
    if (error === 'google_calendar_denied') {
      toast.error('Permisos de Google Calendar denegados')
      window.history.replaceState({}, '', '/dashboard/citas')
    }
    if (error === 'google_calendar_error') {
      toast.error('Error conectando Google Calendar')
      window.history.replaceState({}, '', '/dashboard/citas')
    }
  }, [])

  const checkGCalConnection = async () => {
    try {
      const gcalRes = await apiFetch('/api/integraciones/google-calendar/status')
      if (gcalRes.ok) {
        const data = await gcalRes.json()
        setGcalConnected(data.connected)
      }
    } catch (e) {
      // No conectado
    }
  }

  // Data fetching is handled by the first useEffect

  const fetchData = async () => {
    try {
      setLoading(true)
      const [citasRes, leadsRes, contactsRes] = await Promise.all([
        apiFetch('/api/citas'),
        apiFetch('/api/leads'),
        apiFetch('/api/contacts'),
      ])

      let errorMessage = 'Error al cargar datos'
      if (!citasRes.ok) {
        const errDetails = await citasRes.text()
        console.error('Detalles del backend para citas:', errDetails)
        errorMessage = `Error cargando citas: ${citasRes.status}`
        throw new Error(errorMessage)
      }
      if (!leadsRes.ok) throw new Error('Error al cargar leads')

      const [citasData, leadsData, contactsData] = await Promise.all([
        citasRes.json(),
        leadsRes.json(),
        contactsRes.ok ? contactsRes.json() : [],
      ])

      console.log(`CitasPage - Fetched ${citasData.length} citas, ${leadsData.length} leads`);
      setCitas(citasData)
      setLeads(leadsData)
      setContacts(Array.isArray(contactsData) ? contactsData : [])
    } catch (error) {
      console.error('CitasPage - Error fetching data:', error)
      toast.error('Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }

  // Filtrar citas para la vista de lista
  const citasFiltradas = citas.filter((cita) => {
    if (filtroEstado !== 'all' && cita.estado !== filtroEstado) return false
    if (filtroTipo !== 'all' && cita.tipo !== filtroTipo) return false
    return true
  })

  // Estadísticas
  const stats = {
    total: citas.length,
    pendientes: citas.filter((c) => c.estado === 'pendiente').length,
    confirmadas: citas.filter((c) => c.estado === 'confirmada').length,
    completadas: citas.filter((c) => c.estado === 'completada').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando citas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold flex items-center">
            <CalendarIcon className="h-5 w-5 md:h-8 md:w-8 mr-2 md:mr-3 text-primary" />
            Citas
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
            Administra reuniones, llamadas y citas de servicio
          </p>
        </div>
        {isMobile && gcalConnected && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={async () => {
              setGcalSyncing(true)
              try {
                const res = await apiFetch('/api/integraciones/google-calendar/sync', { method: 'POST' })
                if (res.ok) toast.success('Sincronizado')
              } catch { toast.error('Error') }
              finally { setGcalSyncing(false) }
            }}
            disabled={gcalSyncing}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${gcalSyncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        )}
      </div>

      {/* Google Calendar Integration Panel */}
      {!isMobile && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" stroke="#4285F4" strokeWidth="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Google Calendar
                    {gcalConnected && (
                      <Badge variant="default" className="bg-green-600 h-5 px-1.5 text-[10px] uppercase tracking-wider font-bold">
                        Activo
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {gcalConnected
                      ? 'Sincronización en tiempo real activa'
                      : 'Conecta tu calendario para sincronizar tus citas automáticamente'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {gcalConnected ? (
                  <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg p-1 pr-2">
                    <div className="hidden md:flex h-8 w-8 rounded-md bg-green-500 items-center justify-center text-white">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <span className="hidden lg:inline text-sm font-bold text-green-600 mr-2">Google Calendar Conectado</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-bold hover:bg-green-500/20"
                      onClick={async () => {
                        setGcalSyncing(true)
                        try {
                          const res = await apiFetch('/api/integraciones/google-calendar/sync', { method: 'POST' })
                          if (res.ok) {
                            toast.success('Sincronización completada')
                          }
                        } catch (e) {
                          toast.error('Error sincronizando')
                        } finally {
                          setGcalSyncing(false)
                        }
                      }}
                      disabled={gcalSyncing}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${gcalSyncing ? 'animate-spin' : ''}`} />
                      <span className="hidden md:inline">Sincronizar</span>
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 font-bold"
                    onClick={() => {
                      window.location.href = `/api/integraciones/google-calendar/auth`
                    }}
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    <span className="hidden md:inline">Conectar Google Calendar</span>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="text-lg md:text-2xl font-bold">{stats.total}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="text-lg md:text-2xl font-bold text-yellow-600">{stats.pendientes}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="text-lg md:text-2xl font-bold text-blue-600">{stats.confirmadas}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Confirmadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="text-lg md:text-2xl font-bold text-green-600">{stats.completadas}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Completadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Calendario / Lista */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="calendario" className="flex items-center space-x-2">
            <CalendarDays className="h-4 w-4" />
            <span>Calendario</span>
          </TabsTrigger>
          <TabsTrigger value="lista" className="flex items-center space-x-2">
            <List className="h-4 w-4" />
            <span>Lista</span>
          </TabsTrigger>
        </TabsList>

        {/* Vista de Calendario */}
        <TabsContent value="calendario" className="mt-4 md:mt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {gcalConnected && !isMobile && (
              <div className="w-64 flex-shrink-0 space-y-3">
                <CalendarListPanel onCalendarsChange={handleCalendarsChange} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CalendarView
                citas={citas}
                leads={leads}
                contacts={contacts}
                onRefresh={fetchData}
                googleEvents={googleEvents}
                onDateRangeChange={handleDateRangeChange}
              />
            </div>
          </div>
        </TabsContent>

        {/* Vista de Lista */}
        <TabsContent value="lista" className="mt-4 md:mt-6 space-y-3 md:space-y-4">
          {/* Filtros */}
          <div className="flex gap-2">
            <select
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-xs md:text-sm"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="confirmada">Confirmada</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <select
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-xs md:text-sm"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="all">Todos los tipos</option>
              <option value="reunion">Reunión</option>
              <option value="llamada">Llamada</option>
              <option value="demo">Demo</option>
              <option value="servicio">Servicio</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          {/* Lista de Citas */}
          {citasFiltradas.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No hay citas</h3>
                <p className="text-muted-foreground mb-4">
                  {filtroEstado !== 'all' || filtroTipo !== 'all'
                    ? 'No hay citas con los filtros seleccionados'
                    : 'Crea tu primera cita desde el calendario'}
                </p>
                <Button onClick={() => setActiveTab('calendario')}>Ir al Calendario</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2 md:gap-4">
              {citasFiltradas.map((cita) => (
                <CitaCard key={cita.id} cita={cita} isMobile={isMobile} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CitaCard({ cita, isMobile }: { cita: Cita; isMobile: boolean }) {
  const [expanded, setExpanded] = useState(false)

  if (isMobile) {
    return (
      <div
        className="bg-card border rounded-lg p-3 active:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {format(new Date(cita.fechaHora), 'd MMM', { locale: es })}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {format(new Date(cita.fechaHora), 'HH:mm')} · {cita.duracion}min
              </span>
            </div>
            <p className="text-sm font-medium truncate mt-0.5">
              {cita.titulo || cita.servicio?.nombre || 'Sin título'}
            </p>
            {cita.lead && (
              <p className="text-xs text-muted-foreground truncate">
                {cita.lead.nombre}{cita.lead.empresa ? ` · ${cita.lead.empresa}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
              {tipoLabels[cita.tipo]?.replace(/[^\w\s]/g, '') || cita.tipo}
            </Badge>
            <span className={`w-2 h-2 rounded-full ${estadoColors[cita.estado]}`} />
          </div>
        </div>
        {expanded && (
          <div className="mt-2 pt-2 border-t space-y-1.5">
            {cita.lead && (
              <p className="text-xs text-muted-foreground">
                {cita.lead.nombre} · {cita.lead.email}
              </p>
            )}
            {cita.ubicacion && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {cita.ubicacion}
              </div>
            )}
            {cita.linkReunion && (
              <a
                href={cita.linkReunion}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Video className="h-3 w-3" />
                Unirse a la reunión
              </a>
            )}
            {cita.descripcion && (
              <p className="text-xs text-muted-foreground bg-muted p-1.5 rounded">{cita.descripcion}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg">
              {cita.titulo || cita.servicio?.nombre || 'Sin título'}
            </CardTitle>
            <CardDescription>
              {cita.lead?.nombre}
              {cita.lead?.empresa && ` - ${cita.lead.empresa}`}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <Badge variant="secondary">{tipoLabels[cita.tipo]}</Badge>
            <Badge className={`${estadoColors[cita.estado]} text-white`}>
              {estadoLabels[cita.estado]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center space-x-3 text-sm">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(new Date(cita.fechaHora), "d 'de' MMMM 'de' yyyy", { locale: es })}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {format(new Date(cita.fechaHora), 'HH:mm', { locale: es })} ({cita.duracion} min)
            </span>
          </div>
          {cita.ubicacion && (
            <div className="flex items-center space-x-3 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{cita.ubicacion}</span>
            </div>
          )}
          {cita.linkReunion && (
            <div className="flex items-center space-x-3 text-sm">
              <Video className="h-4 w-4 text-muted-foreground" />
              <a href={cita.linkReunion} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Unirse a la reunión
              </a>
            </div>
          )}
          {cita.descripcion && (
            <p className="text-sm text-muted-foreground mt-2 bg-muted p-2 rounded">{cita.descripcion}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
