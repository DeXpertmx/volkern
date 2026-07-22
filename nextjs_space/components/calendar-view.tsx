'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer, View, Event as BigCalendarEvent } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Calendar as CalendarIcon, Clock, MapPin, Video, User, Building2, X, Edit, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'
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
import { CatalogoSelector, CatalogoItem } from '@/components/catalogo/CatalogoSelector'

const locales = {
  es: es,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

interface Cita {
  id: string
  leadId?: string | null
  contactId?: string | null
  servicioId?: string | null
  tipo: string
  titulo?: string | null
  descripcion?: string | null
  ubicacion?: string | null
  linkReunion?: string | null
  tipoLinkReunion?: string
  linkReunionPegado?: string | null
  fechaHora: string
  duracion: number
  estado: string
  connectedCalendarId?: string | null
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

interface CalendarEvent extends BigCalendarEvent {
  id: string
  cita: Cita
}

interface GoogleEvent {
  id: string
  title: string
  start: Date
  end: Date
  calendarName: string
  calendarColor: string
}

interface CalendarViewProps {
  citas: Cita[]
  leads: Array<{ id: string; nombre: string; email: string; empresa?: string }>
  contacts?: Array<{ id: string; nombre: string; email: string; tipo: string; company?: { nombre: string } | null }>
  onRefresh: () => void
  googleEvents?: GoogleEvent[]
  onDateRangeChange?: (date: Date) => void
}

const messages = {
  allDay: 'Todo el día',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'No hay citas en este rango',
  showMore: (total: number) => `+ Ver más (${total})`,
}

const tipoOptions = [
  { value: 'reunion', label: '🤝 Reunión', color: 'bg-blue-500' },
  { value: 'llamada', label: '📞 Llamada', color: 'bg-green-500' },
  { value: 'demo', label: '🎯 Demo', color: 'bg-purple-500' },
  { value: 'servicio', label: '💼 Servicio', color: 'bg-orange-500' },
  { value: 'otro', label: '📋 Otro', color: 'bg-gray-500' },
]

const estadoOptions = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-yellow-500' },
  { value: 'confirmada', label: 'Confirmada', color: 'bg-blue-500' },
  { value: 'completada', label: 'Completada', color: 'bg-green-500' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-red-500' },
]

export default function CalendarView({ citas, leads, contacts = [], onRefresh, googleEvents = [], onDateRangeChange }: CalendarViewProps) {
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState(new Date())
  const [isMobile, setIsMobile] = useState(false)
  const [showExtraFields, setShowExtraFields] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null)
  const [connectedCalendars, setConnectedCalendars] = useState<Array<{ id: string; nombre: string; color: string }>>([])

  // Fetch connected calendars on mount
  useEffect(() => {
    fetch('/api/calendars')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (data.connected && Array.isArray(data.calendars)) {
          setConnectedCalendars(data.calendars)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [selectedCita, setSelectedCita] = useState<Cita | null>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [formData, setFormData] = useState({
    leadId: '',
    tipo: 'reunion',
    titulo: '',
    descripcion: '',
    ubicacion: '',
    linkReunion: '',
    tipoLinkReunion: 'ninguno',
    linkReunionPegado: '',
    duracion: 60,
    fecha: '',
    hora: '',
    estado: 'pendiente',
    catalogoItemId: '',
    connectedCalendarId: '',
  })
  const [selectedCatalogoItem, setSelectedCatalogoItem] = useState<CatalogoItem | null>(null)
  const [showNewLeadForm, setShowNewLeadForm] = useState(false)
  const [creatingLead, setCreatingLead] = useState(false)
  const [newLeadData, setNewLeadData] = useState({ nombre: '', email: '', telefono: '', empresa: '' })

  // Convertir citas a eventos de calendario + añadir eventos de Google Calendar
  const events: (CalendarEvent | GoogleEvent)[] = useMemo(
    () => {
      const citaEvents = citas.map((cita) => {
        const start = new Date(cita.fechaHora)
        const end = new Date(start.getTime() + cita.duracion * 60000)
        const tipoConfig = tipoOptions.find((t) => t.value === cita.tipo)

        return {
          id: cita.id,
          title: cita.titulo || cita.servicio?.nombre || 'Sin título',
          start,
          end,
          resource: tipoConfig?.label,
          cita,
        }
      })

      // Merge with Google Calendar events (only non-overlapping IDs)
      const existingIds = new Set(citaEvents.map(e => e.id))
      const filteredGoogle = googleEvents.filter(e => !existingIds.has(e.id))

      return [...citaEvents, ...filteredGoogle]
    },
    [citas, googleEvents]
  )

  // Manejar selección de slot (click en calendario)
  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date }) => {
    setSelectedSlot(slotInfo)
    setFormData({
      leadId: '',
      tipo: 'reunion',
      titulo: '',
      descripcion: '',
      ubicacion: '',
      linkReunion: '',
      tipoLinkReunion: 'ninguno',
      linkReunionPegado: '',
      duracion: 60,
      fecha: format(slotInfo.start, 'yyyy-MM-dd'),
      hora: format(slotInfo.start, 'HH:mm'),
      estado: 'pendiente',
      catalogoItemId: '',
      connectedCalendarId: '',
    })
    setSelectedCatalogoItem(null)
    setShowCreateDialog(true)
  }, [])

  // Manejar selección de item del catálogo
  const handleCatalogoSelect = useCallback((item: CatalogoItem) => {
    setSelectedCatalogoItem(item)
    setFormData(prev => ({
      ...prev,
      catalogoItemId: item.id,
      titulo: item.nombre,
      descripcion: item.descripcion || '',
      duracion: item.duracionMinutos || 60,
      tipo: (item.tipo === 'servicio' || item.tipo === 'cita') ? 'servicio' : prev.tipo,
    }))
  }, [])

  // Manejar click en evento existente
  const handleSelectEvent = useCallback((event: CalendarEvent | GoogleEvent) => {
    // Google Calendar events — solo mostrar info en toast por ahora
    if ('calendarName' in event) {
      const gcalEv = event as GoogleEvent
      toast.info(`Evento: ${gcalEv.title}`, {
        description: `Calendario: ${gcalEv.calendarName}`,
        duration: 3000,
      })
      return
    }
    // Cita event
    setSelectedCita((event as CalendarEvent).cita)
    setShowDetailDialog(true)
  }, [])

  // Crear nueva cita
  const handleCreateCita = async () => {
    if (!formData.fecha || !formData.hora) {
      toast.error('Selecciona fecha y hora')
      return
    }

    // Validar que haya lead/contact o título
    if (!formData.leadId && !formData.titulo) {
      toast.error('Selecciona un lead/contacto o proporciona un título para el evento')
      return
    }

    setCreating(true)

    try {
      let actualLeadId = formData.leadId || null
      const actualContactId = null
      
      // Si se seleccionó un contacto, necesitamos crear/obtener un lead
      if (formData.leadId.startsWith('contact:')) {
        const contactId = formData.leadId.replace('contact:', '')
        const selectedContact = contacts.find(c => c.id === contactId)
        
        if (!selectedContact) {
          toast.error('Contacto no encontrado')
          setCreating(false)
          return
        }
        
        // Crear o actualizar un lead a partir del contacto
        const leadRes = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: selectedContact.nombre,
            email: selectedContact.email,
            empresa: selectedContact.company?.nombre || null,
            fuente: 'contacto_crm',
          }),
        })
        
        const leadData = await leadRes.json()
        
        if (!leadRes.ok) {
          throw new Error(leadData.error || 'Error al crear lead desde contacto')
        }
        
        // El API devuelve { success, lead, isNew, message }
        actualLeadId = leadData.lead?.id || leadData.id
      } else if (formData.leadId.startsWith('lead:')) {
        actualLeadId = formData.leadId.replace('lead:', '')
      }
      
      // Combinar fecha y hora
      const fechaHora = new Date(`${formData.fecha}T${formData.hora}:00`)

      const res = await fetch('/api/citas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: actualLeadId,
          tipo: formData.tipo,
          titulo: formData.titulo || undefined,
          descripcion: formData.descripcion || undefined,
          ubicacion: formData.ubicacion || undefined,
          linkReunion: formData.linkReunion || undefined,
          tipoLinkReunion: formData.tipoLinkReunion,
          linkReunionPegado: formData.tipoLinkReunion === 'pegar' ? formData.linkReunionPegado : undefined,
          fechaHora: fechaHora.toISOString(),
          duracion: formData.duracion,
          estado: formData.estado,
          catalogoItemId: formData.catalogoItemId || undefined,
          connectedCalendarId: formData.connectedCalendarId === 'no-sync' || !formData.connectedCalendarId ? undefined : formData.connectedCalendarId,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error al crear cita')
      }

      toast.success('Cita creada exitosamente')
      setShowCreateDialog(false)
      onRefresh()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al crear cita')
    } finally {
      setCreating(false)
    }
  }

  // Preparar formulario para editar
  const handleEditClick = () => {
    if (!selectedCita) return

    const citaDate = new Date(selectedCita.fechaHora)
    setFormData({
      leadId: selectedCita.leadId || '',
      tipo: selectedCita.tipo || 'reunion',
      titulo: selectedCita.titulo || '',
      descripcion: selectedCita.descripcion || '',
      ubicacion: selectedCita.ubicacion || '',
      linkReunion: selectedCita.linkReunion || '',
      tipoLinkReunion: selectedCita.tipoLinkReunion || 'ninguno',
      linkReunionPegado: selectedCita.linkReunionPegado || '',
      duracion: selectedCita.duracion,
      fecha: format(citaDate, 'yyyy-MM-dd'),
      hora: format(citaDate, 'HH:mm'),
      estado: selectedCita.estado,
      catalogoItemId: selectedCita.servicioId || '',
      connectedCalendarId: (selectedCita as any).connectedCalendarId || '',
    })
    setSelectedCatalogoItem(null)
    setShowDetailDialog(false)
    setShowEditDialog(true)
  }

  // Actualizar cita existente
  const handleUpdateCita = async () => {
    if (!selectedCita) return

    if (!formData.fecha || !formData.hora) {
      toast.error('Selecciona fecha y hora')
      return
    }

    setUpdating(true)

    try {
      let actualLeadId = formData.leadId || null
      const actualContactId = null
      
      // Si se seleccionó un contacto, necesitamos crear/obtener un lead
      if (formData.leadId.startsWith('contact:')) {
        const contactId = formData.leadId.replace('contact:', '')
        const selectedContact = contacts.find(c => c.id === contactId)
        
        if (!selectedContact) {
          toast.error('Contacto no encontrado')
          setUpdating(false)
          return
        }
        
        // Crear o actualizar un lead a partir del contacto
        const leadRes = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: selectedContact.nombre,
            email: selectedContact.email,
            empresa: selectedContact.company?.nombre || null,
            fuente: 'contacto_crm',
          }),
        })
        
        const leadData = await leadRes.json()
        
        if (!leadRes.ok) {
          throw new Error(leadData.error || 'Error al crear lead desde contacto')
        }
        
        actualLeadId = leadData.lead?.id || leadData.id
      } else if (formData.leadId.startsWith('lead:')) {
        actualLeadId = formData.leadId.replace('lead:', '')
      } else if (formData.leadId) {
        actualLeadId = formData.leadId
      }
      
      // Combinar fecha y hora
      const fechaHora = new Date(`${formData.fecha}T${formData.hora}:00`)

      const res = await fetch(`/api/citas/${selectedCita.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: actualLeadId,
          tipo: formData.tipo,
          titulo: formData.titulo || undefined,
          descripcion: formData.descripcion || undefined,
          ubicacion: formData.ubicacion || undefined,
          linkReunion: formData.linkReunion || undefined,
          tipoLinkReunion: formData.tipoLinkReunion,
          linkReunionPegado: formData.tipoLinkReunion === 'pegar' ? formData.linkReunionPegado : undefined,
          fechaHora: fechaHora.toISOString(),
          duracion: formData.duracion,
          estado: formData.estado,
          catalogoItemId: formData.catalogoItemId || undefined,
          connectedCalendarId: formData.connectedCalendarId === 'no-sync' || !formData.connectedCalendarId ? undefined : formData.connectedCalendarId,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error al actualizar cita')
      }

      toast.success('Cita actualizada exitosamente')
      setShowEditDialog(false)
      setSelectedCita(null)
      onRefresh()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al actualizar cita')
    } finally {
      setUpdating(false)
    }
  }

  // Eliminar cita
  const handleDeleteCita = async () => {
    if (!selectedCita) return

    setDeleting(true)

    try {
      const res = await fetch(`/api/citas/${selectedCita.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Error al eliminar cita')

      toast.success('Cita eliminada exitosamente')
      setShowDeleteDialog(false)
      setShowDetailDialog(false)
      setSelectedCita(null)
      onRefresh()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar cita')
    } finally {
      setDeleting(false)
    }
  }

  // Estilo personalizado para eventos
  const eventStyleGetter = useCallback((event: CalendarEvent | GoogleEvent) => {
    // Google Calendar event
    if ('calendarColor' in event) {
      return {
        style: {
          backgroundColor: (event as GoogleEvent).calendarColor,
          borderRadius: '5px',
          opacity: 0.85,
          color: '#fff',
          border: '0px',
          display: 'block',
        },
      }
    }

    // Cita event (Volkern)
    const cita = (event as CalendarEvent).cita
    const tipoConfig = tipoOptions.find((t) => t.value === cita.tipo)

    let backgroundColor = '#3174ad'
    if (tipoConfig?.color) {
      const colorKey = tipoConfig.color.replace('bg-', '').replace('-500', '')
      const colorMap: Record<string, string> = {
        blue: '#3b82f6',
        green: '#10b981',
        purple: '#8b5cf6',
        orange: '#f97316',
        gray: '#6b7280',
        yellow: '#eab308',
        red: '#ef4444',
      }
      backgroundColor = colorMap[colorKey] || '#3174ad'
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: cita.estado === 'cancelada' ? 0.5 : 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    }
  }, [])

  const CalendarComponent = BigCalendar as any

  return (
    <>
      <div className="h-[500px] md:h-[700px] bg-white rounded-lg p-2 md:p-4">
        <CalendarComponent
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={['month', 'week', 'day', 'agenda']}
          view={view}
          onView={setView}
          date={date}
          onNavigate={(newDate: Date) => {
            setDate(newDate)
            onDateRangeChange?.(newDate)
          }}
          messages={messages}
          culture="es"
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          style={{ height: '100%' }}
        />
      </div>

      {/* Dialog para crear cita */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) {
          setShowNewLeadForm(false)
          setShowExtraFields(false)
          setNewLeadData({ nombre: '', email: '', telefono: '', empresa: '' })
        }
      }}>
        <DialogContent className={isMobile ? "max-w-full h-full max-h-full rounded-none p-4" : "max-w-2xl max-h-[90vh] overflow-y-auto"}>
          <DialogHeader className={isMobile ? "pb-2" : ""}>
            <DialogTitle>Nueva Cita</DialogTitle>
            {!isMobile && (
              <DialogDescription>Completa los detalles de la cita</DialogDescription>
            )}
          </DialogHeader>

          <div className={isMobile ? "space-y-3 py-2 overflow-y-auto flex-1" : "space-y-4 py-4"}>
            {!isMobile && (
              <div className="space-y-2">
                <Label>Servicio del Catálogo (Opcional)</Label>
                <div className="flex items-center gap-2">
                  <CatalogoSelector
                    onSelect={handleCatalogoSelect}
                    buttonLabel="Seleccionar del Catálogo"
                    buttonVariant="outline"
                  />
                  {selectedCatalogoItem && (
                    <div className="flex-1 flex items-center gap-2 p-2 bg-muted rounded-md">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{selectedCatalogoItem.nombre}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {selectedCatalogoItem.precioBase.toLocaleString('es-ES')} {selectedCatalogoItem.moneda}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedCatalogoItem(null)
                        setFormData(prev => ({ ...prev, catalogoItemId: '' }))
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecciona un servicio para autocompletar título, duración y descripción
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="leadId" className={isMobile ? "text-xs" : ""}>Lead / Contacto *</Label>
              {!showNewLeadForm ? (
                <>
                  <Select value={formData.leadId} onValueChange={(value) => setFormData({ ...formData, leadId: value })}>
                    <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                      <SelectValue placeholder="Selecciona lead o contacto" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Leads</SelectLabel>
                          {leads.map((lead) => (
                            <SelectItem key={`lead-${lead.id}`} value={lead.id}>
                              {lead.nombre}
                              {lead.empresa && ` - ${lead.empresa}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {contacts.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Contactos</SelectLabel>
                          {contacts.filter(c => c.tipo === 'person').map((contact) => (
                            <SelectItem key={`contact-${contact.id}`} value={`contact:${contact.id}`}>
                              {contact.nombre}
                              {contact.company?.nombre && ` - ${contact.company.nombre}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {leads.length === 0 && contacts.length === 0 && (
                        <SelectItem value="no-options" disabled>
                          No hay leads ni contactos disponibles
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {!isMobile && (
                    <Button type="button" variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setShowNewLeadForm(true)}>
                      + Crear nuevo lead
                    </Button>
                  )}
                </>
              ) : (
                <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nombre *</Label>
                      <Input value={newLeadData.nombre} onChange={(e) => setNewLeadData({ ...newLeadData, nombre: e.target.value })} placeholder="Nombre" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={newLeadData.email} onChange={(e) => setNewLeadData({ ...newLeadData, email: e.target.value })} placeholder="email@ejemplo.com" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Teléfono</Label>
                      <Input value={newLeadData.telefono} onChange={(e) => setNewLeadData({ ...newLeadData, telefono: e.target.value })} placeholder="+52 555 123 4567" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Empresa</Label>
                      <Input value={newLeadData.empresa} onChange={(e) => setNewLeadData({ ...newLeadData, empresa: e.target.value })} placeholder="Nombre de empresa" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="button" size="sm" disabled={creatingLead || !newLeadData.nombre.trim()} onClick={async () => {
                      if (!newLeadData.nombre.trim()) return
                      setCreatingLead(true)
                      try {
                        const res = await fetch('/api/leads', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            nombre: newLeadData.nombre.trim(),
                            email: newLeadData.email.trim() || undefined,
                            telefono: newLeadData.telefono.trim() || undefined,
                            empresa: newLeadData.empresa.trim() || undefined,
                            fuente: 'creacion_rapida_calendario',
                          }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'Error al crear lead')
                        const leadId = data.lead?.id || data.id
                        setFormData(prev => ({ ...prev, leadId }))
                        setShowNewLeadForm(false)
                        setNewLeadData({ nombre: '', email: '', telefono: '', empresa: '' })
                        toast.success('Lead creado exitosamente')
                        onRefresh()
                      } catch (error: any) {
                        toast.error(error.message || 'Error al crear lead')
                      } finally {
                        setCreatingLead(false)
                      }
                    }}>
                      {creatingLead ? 'Creando...' : 'Guardar lead'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      setShowNewLeadForm(false)
                      setNewLeadData({ nombre: '', email: '', telefono: '', empresa: '' })
                    }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Fecha *</Label>
                <Input type="date" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} className={isMobile ? "h-9 text-sm" : ""} />
              </div>
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Hora *</Label>
                <Input type="time" value={formData.hora} onChange={(e) => setFormData({ ...formData, hora: e.target.value })} className={isMobile ? "h-9 text-sm" : ""} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Tipo</Label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipoOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {isMobile ? option.label.replace(/[^\w\s]/g, '') : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Duración *</Label>
                <Input type="number" min="15" step="15" value={formData.duracion} onChange={(e) => setFormData({ ...formData, duracion: parseInt(e.target.value) })} className={isMobile ? "h-9 text-sm" : ""} />
              </div>
            </div>

            <div className="space-y-1 md:space-y-2">
              <Label className={isMobile ? "text-xs" : ""}>Título</Label>
              <Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} placeholder="Ej: Reunión de seguimiento" className={isMobile ? "h-9 text-sm" : ""} />
            </div>

            {isMobile && (
              <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowExtraFields(!showExtraFields)}>
                {showExtraFields ? 'Ocultar campos adicionales' : 'Más opciones (ubicación, descripción, enlace)'}
              </Button>
            )}

            {(!isMobile || showExtraFields) && (
              <>
                <div className="space-y-1 md:space-y-2">
                  <Label className={isMobile ? "text-xs" : ""}>Descripción</Label>
                  <Textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} placeholder="Notas sobre la reunión..." rows={isMobile ? 2 : 3} className={isMobile ? "text-sm" : ""} />
                </div>

                <div className="space-y-1 md:space-y-2">
                  <Label className={isMobile ? "text-xs" : ""}>Ubicación</Label>
                  <Input value={formData.ubicacion} onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })} placeholder="Ej: Oficina principal" className={isMobile ? "h-9 text-sm" : ""} />
                </div>

                <div className="space-y-1 md:space-y-2">
                  <Label className={isMobile ? "text-xs" : ""}>Link de Reunión Virtual</Label>
                  <Select value={formData.tipoLinkReunion} onValueChange={(value) => setFormData({ ...formData, tipoLinkReunion: value, linkReunion: '', linkReunionPegado: '' })}>
                    <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                      <SelectValue placeholder="Selecciona una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguno">No incluir link</SelectItem>
                      <SelectItem value="generar">Generar Google Meet</SelectItem>
                      <SelectItem value="pegar">Pegar link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipoLinkReunion === 'pegar' && (
                  <div className="space-y-1 md:space-y-2">
                    <Label className={isMobile ? "text-xs" : ""}>URL de la Reunión</Label>
                    <Input value={formData.linkReunionPegado} onChange={(e) => setFormData({ ...formData, linkReunionPegado: e.target.value })} placeholder="https://meet.google.com/..." className={isMobile ? "h-9 text-sm" : ""} />
                  </div>
                )}

                {formData.tipoLinkReunion === 'generar' && (
                  <div className="p-2 md:p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs md:text-sm text-blue-700">
                      <Video className="inline h-3 w-3 md:h-4 md:w-4 mr-1" />
                      Se generará un enlace de Google Meet al guardar
                    </p>
                  </div>
                )}

                {connectedCalendars.length > 0 && (
                  <div className="space-y-1 md:space-y-2">
                    <Label className={isMobile ? "text-xs" : ""}>Sincronizar con Google Calendar</Label>
                    <Select value={formData.connectedCalendarId} onValueChange={(value) => setFormData({ ...formData, connectedCalendarId: value })}>
                      <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                        <SelectValue placeholder="No sincronizar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-sync">No sincronizar</SelectItem>
                        {connectedCalendars.map((cal) => (
                          <SelectItem key={cal.id} value={cal.id}>
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: cal.color }} />
                              {cal.nombre}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={`${isMobile ? "sticky bottom-0 bg-background pt-2 border-t mt-2" : ""} flex justify-end space-x-2`}>
            <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button size={isMobile ? "sm" : "default"} onClick={handleCreateCita} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Cita'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar cita */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open)
        if (!open) {
          setShowNewLeadForm(false)
          setShowExtraFields(false)
          setNewLeadData({ nombre: '', email: '', telefono: '', empresa: '' })
        }
      }}>
        <DialogContent className={isMobile ? "max-w-full h-full max-h-full rounded-none p-4" : "max-w-2xl max-h-[90vh] overflow-y-auto"}>
          <DialogHeader className={isMobile ? "pb-2" : ""}>
            <DialogTitle>Editar Cita</DialogTitle>
            {!isMobile && (
              <DialogDescription>Modifica los detalles de la cita</DialogDescription>
            )}
          </DialogHeader>

          <div className={isMobile ? "space-y-3 py-2 overflow-y-auto flex-1" : "space-y-4 py-4"}>
            <div className="space-y-1 md:space-y-2">
              <Label className={isMobile ? "text-xs" : ""}>Lead / Contacto *</Label>
              {!showNewLeadForm ? (
                <>
                  <Select value={formData.leadId} onValueChange={(value) => setFormData({ ...formData, leadId: value })}>
                    <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                      <SelectValue placeholder="Selecciona lead o contacto" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Leads</SelectLabel>
                          {leads.map((lead) => (
                            <SelectItem key={`edit-lead-${lead.id}`} value={lead.id}>
                              {lead.nombre}
                              {lead.empresa && ` - ${lead.empresa}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {contacts.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Contactos</SelectLabel>
                          {contacts.filter(c => c.tipo === 'person').map((contact) => (
                            <SelectItem key={`edit-contact-${contact.id}`} value={`contact:${contact.id}`}>
                              {contact.nombre}
                              {contact.company?.nombre && ` - ${contact.company.nombre}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {!isMobile && (
                    <Button type="button" variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setShowNewLeadForm(true)}>
                      + Crear nuevo lead
                    </Button>
                  )}
                </>
              ) : (
                <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nombre *</Label>
                      <Input value={newLeadData.nombre} onChange={(e) => setNewLeadData({ ...newLeadData, nombre: e.target.value })} placeholder="Nombre" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={newLeadData.email} onChange={(e) => setNewLeadData({ ...newLeadData, email: e.target.value })} placeholder="email@ejemplo.com" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Teléfono</Label>
                      <Input value={newLeadData.telefono} onChange={(e) => setNewLeadData({ ...newLeadData, telefono: e.target.value })} placeholder="+52 555 123 4567" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Empresa</Label>
                      <Input value={newLeadData.empresa} onChange={(e) => setNewLeadData({ ...newLeadData, empresa: e.target.value })} placeholder="Nombre de empresa" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="button" size="sm" disabled={creatingLead || !newLeadData.nombre.trim()} onClick={async () => {
                      if (!newLeadData.nombre.trim()) return
                      setCreatingLead(true)
                      try {
                        const res = await fetch('/api/leads', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            nombre: newLeadData.nombre.trim(),
                            email: newLeadData.email.trim() || undefined,
                            telefono: newLeadData.telefono.trim() || undefined,
                            empresa: newLeadData.empresa.trim() || undefined,
                            fuente: 'creacion_rapida_calendario',
                          }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'Error al crear lead')
                        const leadId = data.lead?.id || data.id
                        setFormData(prev => ({ ...prev, leadId }))
                        setShowNewLeadForm(false)
                        setNewLeadData({ nombre: '', email: '', telefono: '', empresa: '' })
                        toast.success('Lead creado exitosamente')
                        onRefresh()
                      } catch (error: any) {
                        toast.error(error.message || 'Error al crear lead')
                      } finally {
                        setCreatingLead(false)
                      }
                    }}>
                      {creatingLead ? 'Creando...' : 'Guardar lead'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      setShowNewLeadForm(false)
                      setNewLeadData({ nombre: '', email: '', telefono: '', empresa: '' })
                    }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Fecha *</Label>
                <Input type="date" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} className={isMobile ? "h-9 text-sm" : ""} />
              </div>
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Hora *</Label>
                <Input type="time" value={formData.hora} onChange={(e) => setFormData({ ...formData, hora: e.target.value })} className={isMobile ? "h-9 text-sm" : ""} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Tipo</Label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipoOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {isMobile ? option.label.replace(/[^\w\s]/g, '') : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:space-y-2">
                <Label className={isMobile ? "text-xs" : ""}>Duración *</Label>
                <Input type="number" min="15" step="15" value={formData.duracion} onChange={(e) => setFormData({ ...formData, duracion: parseInt(e.target.value) })} className={isMobile ? "h-9 text-sm" : ""} />
              </div>
            </div>

            <div className="space-y-1 md:space-y-2">
              <Label className={isMobile ? "text-xs" : ""}>Estado *</Label>
              <Select value={formData.estado} onValueChange={(value) => setFormData({ ...formData, estado: value })}>
                <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {estadoOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:space-y-2">
              <Label className={isMobile ? "text-xs" : ""}>Título</Label>
              <Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} placeholder="Ej: Reunión de seguimiento" className={isMobile ? "h-9 text-sm" : ""} />
            </div>

            {isMobile && (
              <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowExtraFields(!showExtraFields)}>
                {showExtraFields ? 'Ocultar campos adicionales' : 'Más opciones (ubicación, descripción, enlace)'}
              </Button>
            )}

            {(!isMobile || showExtraFields) && (
              <>
                <div className="space-y-1 md:space-y-2">
                  <Label className={isMobile ? "text-xs" : ""}>Descripción</Label>
                  <Textarea value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} placeholder="Notas sobre la reunión..." rows={isMobile ? 2 : 3} className={isMobile ? "text-sm" : ""} />
                </div>
                <div className="space-y-1 md:space-y-2">
                  <Label className={isMobile ? "text-xs" : ""}>Ubicación</Label>
                  <Input value={formData.ubicacion} onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })} placeholder="Ej: Oficina principal" className={isMobile ? "h-9 text-sm" : ""} />
                </div>
                <div className="space-y-1 md:space-y-2">
                  <Label className={isMobile ? "text-xs" : ""}>Link de Reunión Virtual</Label>
                  <Select value={formData.tipoLinkReunion} onValueChange={(value) => setFormData({ ...formData, tipoLinkReunion: value, linkReunion: '', linkReunionPegado: '' })}>
                    <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                      <SelectValue placeholder="Selecciona una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguno">No incluir link</SelectItem>
                      <SelectItem value="generar">Generar Google Meet</SelectItem>
                      <SelectItem value="pegar">Pegar link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.tipoLinkReunion === 'pegar' && (
                  <div className="space-y-1 md:space-y-2">
                    <Label className={isMobile ? "text-xs" : ""}>URL de la Reunión</Label>
                    <Input value={formData.linkReunionPegado} onChange={(e) => setFormData({ ...formData, linkReunionPegado: e.target.value })} placeholder="https://meet.google.com/..." className={isMobile ? "h-9 text-sm" : ""} />
                  </div>
                )}
                {formData.tipoLinkReunion === 'generar' && (
                  <div className="p-2 md:p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs md:text-sm text-blue-700">
                      <Video className="inline h-3 w-3 md:h-4 md:w-4 mr-1" />
                      Se generará un enlace de Google Meet al guardar
                    </p>
                  </div>
                )}
                {connectedCalendars.length > 0 && (
                  <div className="space-y-1 md:space-y-2">
                    <Label className={isMobile ? "text-xs" : ""}>Sincronizar con Google Calendar</Label>
                    <Select value={formData.connectedCalendarId} onValueChange={(value) => setFormData({ ...formData, connectedCalendarId: value })}>
                      <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                        <SelectValue placeholder="No sincronizar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-sync">No sincronizar</SelectItem>
                        {connectedCalendars.map((cal) => (
                          <SelectItem key={cal.id} value={cal.id}>
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: cal.color }} />
                              {cal.nombre}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={`${isMobile ? "sticky bottom-0 bg-background pt-2 border-t mt-2" : ""} flex justify-end space-x-2`}>
            <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => setShowEditDialog(false)} disabled={updating}>
              Cancelar
            </Button>
            <Button size={isMobile ? "sm" : "default"} onClick={handleUpdateCita} disabled={updating}>
              {updating ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para ver detalles de cita */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className={isMobile ? "max-w-full h-full max-h-full rounded-none p-4" : "max-w-2xl"}>
          {selectedCita && (
            <>
              <DialogHeader className={isMobile ? "pb-2" : ""}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <DialogTitle className={isMobile ? "text-base" : "text-xl"}>{selectedCita.titulo || 'Cita sin título'}</DialogTitle>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tipoOptions.find((t) => t.value === selectedCita.tipo) && (
                        <Badge variant="secondary" className={isMobile ? "text-[10px] h-5" : ""}>
                          {tipoOptions.find((t) => t.value === selectedCita.tipo)?.label}
                        </Badge>
                      )}
                      {estadoOptions.find((e) => e.value === selectedCita.estado) && (
                        <Badge className={`${estadoOptions.find((e) => e.value === selectedCita.estado)?.color} text-white ${isMobile ? "text-[10px] h-5" : ""}`}>
                          {estadoOptions.find((e) => e.value === selectedCita.estado)?.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    <Button variant="outline" size="icon" className={isMobile ? "h-8 w-8" : ""} onClick={handleEditClick}>
                      <Edit className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className={isMobile ? "h-8 w-8" : ""} onClick={() => {
                      setShowDetailDialog(false)
                      setShowDeleteDialog(true)
                    }}>
                      <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-red-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className={isMobile ? "h-8 w-8" : ""} onClick={() => setShowDetailDialog(false)}>
                      <X className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className={isMobile ? "space-y-3 overflow-y-auto flex-1" : "space-y-4 py-4"}>
                <Card className={`${isMobile ? "p-3 space-y-2" : "p-4 space-y-3"}`}>
                  <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                    <CalendarIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">
                      {format(new Date(selectedCita.fechaHora), isMobile ? "d MMM yyyy" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                    <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
                    <span>{format(new Date(selectedCita.fechaHora), 'HH:mm', { locale: es })} ({selectedCita.duracion} min)</span>
                  </div>
                  {selectedCita.lead && (
                    <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                      <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-medium">{selectedCita.lead.nombre}</p>
                        <p className="text-muted-foreground text-[10px] md:text-xs">{selectedCita.lead.email}</p>
                      </div>
                    </div>
                  )}
                  {selectedCita.lead?.empresa && (
                    <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                      <Building2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
                      <span>{selectedCita.lead.empresa}</span>
                    </div>
                  )}
                  {selectedCita.ubicacion && (
                    <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                      <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
                      <span>{selectedCita.ubicacion}</span>
                    </div>
                  )}
                  {selectedCita.linkReunion && (
                    <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                      <Video className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground shrink-0" />
                      <a href={selectedCita.linkReunion} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Unirse a la reunión
                      </a>
                    </div>
                  )}
                </Card>
                {selectedCita.descripcion && (
                  <div className="space-y-1 md:space-y-2">
                    <Label className={isMobile ? "text-xs" : ""}>Descripción</Label>
                    <p className="text-xs md:text-sm text-muted-foreground bg-muted p-2 md:p-3 rounded-md">{selectedCita.descripcion}</p>
                  </div>
                )}
                {selectedCita.servicio && (
                  <div className="space-y-1 md:space-y-2">
                    <Label className={isMobile ? "text-xs" : ""}>Servicio</Label>
                    <Card className={`${isMobile ? "p-2" : "p-3"}`}>
                      <p className="font-medium text-xs md:text-sm">{selectedCita.servicio.nombre}</p>
                      {selectedCita.servicio.descripcion && (
                        <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">{selectedCita.servicio.descripcion}</p>
                      )}
                    </Card>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cita?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La cita será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCita}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
