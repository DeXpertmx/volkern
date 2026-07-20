
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Calendar, Clock, CreditCard, User, Mail, Phone, CheckCircle, AlertTriangle } from 'lucide-react'
import { format, addDays, setHours, setMinutes, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

interface Servicio {
  id: string
  nombre: string
  descripcion: string | null
  duracionMinutos: number
  precio: number
  moneda: string
  modalidad?: string
}

const tipoOptions = [
  { value: 'reunion', label: 'Reunion', color: 'bg-blue-500' },
  { value: 'llamada', label: 'Llamada', color: 'bg-green-500' },
  { value: 'demo', label: 'Demo', color: 'bg-purple-500' },
  { value: 'servicio', label: 'Servicio', color: 'bg-orange-500' },
  { value: 'otro', label: 'Otro', color: 'bg-gray-500' },
]

interface Lead {
  id: string
  nombre: string
  email: string
  telefono?: string | null
}

export default function EmbedBookingPage() {
  const searchParams = useSearchParams()
  const tenantId = searchParams.get('tenantId')
  
  const [step, setStep] = useState<'services' | 'datetime' | 'contact' | 'payment' | 'success'>('services')
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [selectedServicio, setSelectedServicio] = useState<Servicio | null>(null)
  const [selectedTipo, setSelectedTipo] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [contactData, setContactData] = useState({
    nombre: '',
    email: '',
    telefono: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingServices, setIsLoadingServices] = useState(true)
  const [tenantError, setTenantError] = useState(false)
  const { toast } = useToast()

  // Cargar servicios
  useEffect(() => {
    const fetchServicios = async () => {
      if (!tenantId) {
        console.error('No tenantId provided in URL params')
        setTenantError(true)
        setIsLoadingServices(false)
        return
      }

      try {
        const response = await fetch(`/api/public/servicios?tenantId=${tenantId}`)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data = await response.json()
        
        if (data.error) {
          throw new Error(data.error)
        }
        
        setServicios(data || [])
      } catch (error) {
        console.error('Error fetching services:', error)
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los servicios.',
          variant: 'destructive',
        })
      } finally {
        setIsLoadingServices(false)
      }
    }

    fetchServicios()
  }, [tenantId, toast])

  // Cargar disponibilidad cuando se selecciona una fecha
  const fetchAvailability = async (date: string) => {
    if (!tenantId || !selectedServicio) return

    setIsLoadingSlots(true)
    setSelectedTime('') // Limpiar hora seleccionada
    setAvailableSlots([])
    setOccupiedSlots([])

    try {
      const duracion = selectedServicio.duracionMinutos || 60
      const response = await fetch(
        `/api/public/citas/disponibilidad?tenantId=${tenantId}&fecha=${date}&duracion=${duracion}`
      )

      if (!response.ok) {
        throw new Error('Error al cargar disponibilidad')
      }

      const data = await response.json()
      
      // Verificar si el día está cerrado
      if (data.cerrado) {
        setAvailableSlots([])
        setOccupiedSlots([])
        toast({
          title: 'Día no disponible',
          description: data.mensaje || 'Este día no está disponible para citas.',
          variant: 'destructive',
        })
        return
      }
      
      setAvailableSlots(data.disponibles || [])
      setOccupiedSlots(data.ocupados || [])
    } catch (error) {
      console.error('Error fetching availability:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar la disponibilidad.',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingSlots(false)
    }
  }

  // Manejar selección de fecha
  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    fetchAvailability(date)
  }

  // Generar fechas disponibles (próximos 30 días, excluyendo fines de semana)
  const generateAvailableDates = () => {
    const dates = []
    const today = startOfDay(new Date())
    
    for (let i = 1; i <= 30; i++) {
      const date = addDays(today, i)
      const dayOfWeek = date.getDay()
      
      // Excluir sábados (6) y domingos (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(format(date, 'yyyy-MM-dd'))
      }
    }
    
    return dates
  }

  const handleServiceSelect = (servicio: Servicio) => {
    setSelectedServicio(servicio)
    setStep('datetime')
  }

  const handleDateTimeConfirm = () => {
    if (!selectedDate || !selectedTime) {
      toast({
        title: 'Error',
        description: 'Selecciona fecha y hora.',
        variant: 'destructive',
      })
      return
    }
    setStep('contact')
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!tenantId) {
      toast({
        title: 'Error',
        description: 'Configuración inválida. Contacta al administrador.',
        variant: 'destructive',
      })
      return
    }
    
    if (!contactData.nombre || !contactData.email) {
      toast({
        title: 'Error',
        description: 'Completa los campos requeridos.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      // 1. Crear o verificar lead (usando endpoint público)
      const leadResponse = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contactData,
          tenantId: tenantId
        }),
      })

      const leadResult = await leadResponse.json()
      if (!leadResult.success) {
        throw new Error(leadResult.error)
      }

      const lead = leadResult.lead

      // 2. Crear cita (usando endpoint público)
      const [hours, minutes] = selectedTime.split(':').map(Number)
      const fechaHora = setMinutes(setHours(new Date(selectedDate), hours), minutes)

      const citaResponse = await fetch('/api/public/citas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId,
          leadId: lead.id,
          servicioId: selectedServicio?.id,
          catalogoItemId: selectedServicio?.id,
          tipo: selectedTipo || (selectedServicio?.modalidad === 'virtual' ? 'llamada' : 
                selectedServicio?.modalidad === 'presencial' ? 'reunion' : 'servicio'),
          fechaHora: fechaHora.toISOString(),
        }),
      })

      const citaResult = await citaResponse.json()
      
      if (!citaResult.success) {
        if (citaResult.error === 'Conflicto de horario') {
          throw new Error('Este horario ya no está disponible. Por favor, selecciona otro.')
        }
        throw new Error(citaResult.error || 'Error al crear la cita')
      }

      // 3. Mostrar éxito y opcionalmente redirigir a pago
      setStep('success')
      toast({
        title: '¡Cita agendada!',
        description: 'Tu cita ha sido registrada exitosamente.',
      })

      // Si necesitas integrar pago, descomenta esto:
      // const checkoutResponse = await fetch('/api/checkout', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ citaId: citaResult.cita.id, tenantId }),
      // })
      // const checkoutResult = await checkoutResponse.json()
      // if (checkoutResult.success && checkoutResult.url) {
      //   window.location.href = checkoutResult.url
      // }

    } catch (error: any) {
      console.error('Error in booking process:', error)
      toast({
        title: 'Error',
        description: error?.message || 'Hubo un problema al procesar tu reserva.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Error de configuración
  if (tenantError || (!isLoadingServices && !tenantId)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="text-center p-8">
            <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Configuración Incorrecta</h2>
            <p className="text-gray-600 mb-4">
              Este formulario no está correctamente configurado. Por favor, contacta al administrador del sitio.
            </p>
            <p className="text-xs text-muted-foreground">
              Código de error: TENANT_ID_MISSING
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoadingServices) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando servicios...</p>
        </div>
      </div>
    )
  }

  // Pantalla de éxito
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="text-center p-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Cita Agendada!</h2>
            <p className="text-gray-600 mb-2">
              Tu cita ha sido registrada exitosamente.
            </p>
            <div className="bg-muted/50 p-4 rounded-lg my-4 text-left">
              <p className="text-sm font-medium">{selectedServicio?.nombre}</p>
              <p className="text-sm text-muted-foreground">
                {selectedDate && format(new Date(selectedDate), 'dd MMMM yyyy', { locale: es })} a las {selectedTime}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Recibirás un correo de confirmación con los detalles de tu cita.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mb-4">
            <Calendar className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Agendar Cita</CardTitle>
          <CardDescription>
            Selecciona un servicio y agenda tu cita de forma rápida y segura
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'services' && (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="font-semibold text-lg mb-3">Motivo de la Cita</h3>
                <div className="flex flex-wrap gap-2">
                  {tipoOptions.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTipo(t.value)}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium border transition-all
                        ${selectedTipo === t.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-input text-muted-foreground hover:text-foreground'}
                      `}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-4">Selecciona un servicio o producto</h3>
              {servicios.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay servicios disponibles en este momento.
                </p>
              ) : (
                <div className="grid gap-4">
                  {servicios.map((servicio) => (
                    <div
                      key={servicio.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleServiceSelect(servicio)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">{servicio.nombre}</h4>
                        <Badge variant="outline">
                          ${servicio.precio} {servicio.moneda}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {servicio.descripcion}
                      </p>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Clock className="h-4 w-4 mr-1" />
                        {servicio.duracionMinutos} minutos
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'datetime' && selectedServicio && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Fecha y Hora</h3>
                <Button variant="outline" size="sm" onClick={() => setStep('services')}>
                  Cambiar servicio
                </Button>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{selectedServicio.nombre}</h4>
                    <p className="text-sm text-muted-foreground">{selectedServicio.duracionMinutos} min</p>
                  </div>
                  <Badge>${selectedServicio.precio} {selectedServicio.moneda}</Badge>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-base font-medium mb-3 block">Fecha</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {generateAvailableDates().map((date) => (
                      <Button
                        key={date}
                        variant={selectedDate === date ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleDateSelect(date)}
                        className="text-xs"
                      >
                        {format(new Date(date), 'dd MMM', { locale: es })}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium mb-3 block">Hora</Label>
                  {!selectedDate ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Selecciona una fecha primero
                    </p>
                  ) : isLoadingSlots ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <span className="ml-2 text-sm text-muted-foreground">Cargando horarios...</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-2">
                        No hay horarios disponibles para esta fecha
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Por favor, selecciona otra fecha
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                      {availableSlots.map((time) => (
                        <Button
                          key={time}
                          variant={selectedTime === time ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedTime(time)}
                          className="text-xs"
                        >
                          {time}
                        </Button>
                      ))}
                    </div>
                  )}
                  {selectedDate && availableSlots.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      {availableSlots.length} horarios disponibles
                    </p>
                  )}
                </div>
              </div>

              <Button 
                onClick={handleDateTimeConfirm} 
                className="w-full"
                disabled={!selectedDate || !selectedTime}
              >
                Continuar
              </Button>
            </div>
          )}

          {step === 'contact' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Tus datos</h3>
                <Button variant="outline" size="sm" onClick={() => setStep('datetime')}>
                  Cambiar fecha
                </Button>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedServicio?.nombre}</span>
                  <Badge>${selectedServicio?.precio} {selectedServicio?.moneda}</Badge>
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-1" />
                  {selectedDate && format(new Date(selectedDate), 'dd MMMM yyyy', { locale: es })} a las {selectedTime}
                </div>
              </div>

              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre completo *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nombre"
                      type="text"
                      placeholder="Tu nombre completo"
                      value={contactData.nombre}
                      onChange={(e) => setContactData(prev => ({ ...prev, nombre: e.target.value }))}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={contactData.email}
                      onChange={(e) => setContactData(prev => ({ ...prev, email: e.target.value }))}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="telefono"
                      type="tel"
                      placeholder="+52 555 123 4567"
                      value={contactData.telefono}
                      onChange={(e) => setContactData(prev => ({ ...prev, telefono: e.target.value }))}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Procesando...
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Proceder al pago
                    </div>
                  )}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                Serás redirigido a una página segura para completar el pago.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
