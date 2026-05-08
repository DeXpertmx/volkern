'use client'

import { useState, useCallback, useMemo } from 'react'
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

interface CalendarEvent extends BigCalendarEvent {
  id: string
  cita: Cita
}

interface CalendarViewProps {
  citas: Cita[]
  leads: Array<{ id: string; nombre: string; email: string; empresa?: string }>
  contacts?: Array<{ id: string; nombre: string; email: string; tipo: string; company?: { nombre: string } | null }>
  onRefresh: () => void
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

export default function CalendarView({ citas, leads, contacts = [], onRefresh }: CalendarViewProps) {
  const [view, setView] = useState<View>('month')
  const [date, setDate] = useState(new Date())
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null)
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
    duracion: 60,
    fecha: '',
    hora: '',
    estado: 'pendiente',
    catalogoItemId: '',
  })
  const [selectedCatalogoItem, setSelectedCatalogoItem] = useState<CatalogoItem | null>(null)

  // Convertir citas a eventos de calendario
  const events: CalendarEvent[] = useMemo(
    () =>
      citas.map((cita) => {
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
      }),
    [citas]
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
      duracion: 60,
      fecha: format(slotInfo.start, 'yyyy-MM-dd'),
      hora: format(slotInfo.start, 'HH:mm'),
      estado: 'pendiente',
      catalogoItemId: '',
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
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedCita(event.cita)
    setShowDetailDialog(true)
  }, [])

  // Crear nueva cita
  const handleCreateCita = async () => {
    if (!formData.leadId) {
      toast.error('Selecciona un lead o contacto')
      return
    }

    if (!formData.fecha || !formData.hora) {
      toast.error('Selecciona fecha y hora')
      return
    }

    setCreating(true)

    try {
      let actualLeadId = formData.leadId
      
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
          fechaHora: fechaHora.toISOString(),
          duracion: formData.duracion,
          estado: formData.estado,
          catalogoItemId: formData.catalogoItemId || undefined,
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
      leadId: selectedCita.leadId,
      tipo: selectedCita.tipo,
      titulo: selectedCita.titulo || '',
      descripcion: selectedCita.descripcion || '',
      ubicacion: selectedCita.ubicacion || '',
      linkReunion: selectedCita.linkReunion || '',
      duracion: selectedCita.duracion,
      fecha: format(citaDate, 'yyyy-MM-dd'),
      hora: format(citaDate, 'HH:mm'),
      estado: selectedCita.estado,
      catalogoItemId: selectedCita.servicioId || '',
    })
    setSelectedCatalogoItem(null)
    setShowDetailDialog(false)
    setShowEditDialog(true)
  }

  // Actualizar cita existente
  const handleUpdateCita = async () => {
    if (!selectedCita) return

    if (!formData.leadId) {
      toast.error('Selecciona un lead o contacto')
      return
    }

    if (!formData.fecha || !formData.hora) {
      toast.error('Selecciona fecha y hora')
      return
    }

    setUpdating(true)

    try {
      let actualLeadId = formData.leadId
      
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
          fechaHora: fechaHora.toISOString(),
          duracion: formData.duracion,
          estado: formData.estado,
          catalogoItemId: formData.catalogoItemId || undefined,
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
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const tipoConfig = tipoOptions.find((t) => t.value === event.cita.tipo)
    const estadoConfig = estadoOptions.find((e) => e.value === event.cita.estado)

    let backgroundColor = '#3174ad'
    if (tipoConfig?.color) {
      backgroundColor = tipoConfig.color.replace('bg-', '')
      backgroundColor = backgroundColor.replace('-500', '')
      const colorMap: Record<string, string> = {
        blue: '#3b82f6',
        green: '#10b981',
        purple: '#8b5cf6',
        orange: '#f97316',
        gray: '#6b7280',
        yellow: '#eab308',
        red: '#ef4444',
      }
      backgroundColor = colorMap[backgroundColor] || '#3174ad'
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: event.cita.estado === 'cancelada' ? 0.5 : 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    }
  }, [])

  const CalendarComponent = BigCalendar as any

  return (
    <>
      <div className="h-[700px] bg-white rounded-lg p-4">
        <CalendarComponent
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={['month', 'week', 'day', 'agenda']}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
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
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Cita</DialogTitle>
            <DialogDescription>
              Completa los detalles de la cita
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selector de Catálogo */}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCatalogoItem(null)
                        setFormData(prev => ({ ...prev, catalogoItemId: '' }))
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecciona un servicio para autocompletar título, duración y descripción
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="leadId">Lead / Contacto *</Label>
              <Select value={formData.leadId} onValueChange={(value) => setFormData({ ...formData, leadId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un lead o contacto" />
                </SelectTrigger>
                <SelectContent>
                  {leads.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>📋 Leads</SelectLabel>
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
                      <SelectLabel>👤 Contactos</SelectLabel>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hora">Hora *</Label>
                <Input
                  id="hora"
                  type="time"
                  value={formData.hora}
                  onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Cita *</Label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipoOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duracion">Duración (minutos) *</Label>
                <Input
                  id="duracion"
                  type="number"
                  min="15"
                  step="15"
                  value={formData.duracion}
                  onChange={(e) => setFormData({ ...formData, duracion: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ej: Reunión de seguimiento"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Notas sobre la reunión..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ubicacion">Ubicación (Opcional)</Label>
              <Input
                id="ubicacion"
                value={formData.ubicacion}
                onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                placeholder="Ej: Oficina principal, Sala de juntas"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkReunion">Link de Reunión Virtual (Opcional)</Label>
              <Input
                id="linkReunion"
                value={formData.linkReunion}
                onChange={(e) => setFormData({ ...formData, linkReunion: e.target.value })}
                placeholder="https://zoom.us/j/..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreateCita} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Cita'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar cita */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cita</DialogTitle>
            <DialogDescription>
              Modifica los detalles de la cita
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-leadId">Lead / Contacto *</Label>
              <Select value={formData.leadId} onValueChange={(value) => setFormData({ ...formData, leadId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un lead o contacto" />
                </SelectTrigger>
                <SelectContent>
                  {leads.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>📋 Leads</SelectLabel>
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
                      <SelectLabel>👤 Contactos</SelectLabel>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fecha">Fecha *</Label>
                <Input
                  id="edit-fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-hora">Hora *</Label>
                <Input
                  id="edit-hora"
                  type="time"
                  value={formData.hora}
                  onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tipo">Tipo de Cita *</Label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipoOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-duracion">Duración (minutos) *</Label>
                <Input
                  id="edit-duracion"
                  type="number"
                  min="15"
                  step="15"
                  value={formData.duracion}
                  onChange={(e) => setFormData({ ...formData, duracion: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-estado">Estado *</Label>
              <Select value={formData.estado} onValueChange={(value) => setFormData({ ...formData, estado: value })}>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label htmlFor="edit-titulo">Título</Label>
              <Input
                id="edit-titulo"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ej: Reunión de seguimiento"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-descripcion">Descripción</Label>
              <Textarea
                id="edit-descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Notas sobre la reunión..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-ubicacion">Ubicación (Opcional)</Label>
              <Input
                id="edit-ubicacion"
                value={formData.ubicacion}
                onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                placeholder="Ej: Oficina principal, Sala de juntas"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-linkReunion">Link de Reunión Virtual (Opcional)</Label>
              <Input
                id="edit-linkReunion"
                value={formData.linkReunion}
                onChange={(e) => setFormData({ ...formData, linkReunion: e.target.value })}
                placeholder="https://zoom.us/j/..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={updating}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateCita} disabled={updating}>
              {updating ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para ver detalles de cita */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          {selectedCita && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <DialogTitle className="text-xl">{selectedCita.titulo || 'Cita sin título'}</DialogTitle>
                    <div className="flex items-center space-x-2">
                      {tipoOptions.find((t) => t.value === selectedCita.tipo) && (
                        <Badge variant="secondary">
                          {tipoOptions.find((t) => t.value === selectedCita.tipo)?.label}
                        </Badge>
                      )}
                      {estadoOptions.find((e) => e.value === selectedCita.estado) && (
                        <Badge
                          className={`${
                            estadoOptions.find((e) => e.value === selectedCita.estado)?.color
                          } text-white`}
                        >
                          {estadoOptions.find((e) => e.value === selectedCita.estado)?.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="icon" onClick={handleEditClick}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setShowDetailDialog(false)
                        setShowDeleteDialog(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setShowDetailDialog(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center space-x-3 text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {format(new Date(selectedCita.fechaHora), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(selectedCita.fechaHora), 'HH:mm', { locale: es })} ({selectedCita.duracion} min)
                    </span>
                  </div>

                  {selectedCita.lead && (
                    <div className="flex items-center space-x-3 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{selectedCita.lead.nombre}</p>
                        <p className="text-muted-foreground text-xs">{selectedCita.lead.email}</p>
                      </div>
                    </div>
                  )}

                  {selectedCita.lead?.empresa && (
                    <div className="flex items-center space-x-3 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedCita.lead.empresa}</span>
                    </div>
                  )}

                  {selectedCita.ubicacion && (
                    <div className="flex items-center space-x-3 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedCita.ubicacion}</span>
                    </div>
                  )}

                  {selectedCita.linkReunion && (
                    <div className="flex items-center space-x-3 text-sm">
                      <Video className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={selectedCita.linkReunion}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Unirse a la reunión
                      </a>
                    </div>
                  )}
                </Card>

                {selectedCita.descripcion && (
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {selectedCita.descripcion}
                    </p>
                  </div>
                )}

                {selectedCita.servicio && (
                  <div className="space-y-2">
                    <Label>Servicio</Label>
                    <Card className="p-3">
                      <p className="font-medium text-sm">{selectedCita.servicio.nombre}</p>
                      {selectedCita.servicio.descripcion && (
                        <p className="text-xs text-muted-foreground mt-1">{selectedCita.servicio.descripcion}</p>
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
