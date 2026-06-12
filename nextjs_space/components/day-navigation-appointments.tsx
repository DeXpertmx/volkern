'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface Appointment {
  id: string
  fechaHora: string
  estado: string
  lead: { nombre: string; email: string }
  servicio: { nombre: string; precio: number; moneda: string }
}

const estadoColors: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  pendiente: { variant: 'outline', color: 'text-orange-600' },
  confirmada: { variant: 'default', color: 'text-blue-600' },
  pagada: { variant: 'default', color: 'text-green-600' },
  completada: { variant: 'secondary', color: 'text-gray-600' },
  cancelada: { variant: 'destructive', color: 'text-red-600' },
}

export function DayNavigationAppointments() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAppointments = useCallback(async (date: Date) => {
    setLoading(true)
    try {
      const fechaStr = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/citas?fecha=${fechaStr}&estado=confirmada,pagada&sort=asc`)
      if (res.ok) {
        const data = await res.json()
        setAppointments(data)
      }
    } catch (error) {
      console.error('Error fetching appointments:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAppointments(selectedDate)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const goToPrevDay = () => {
    const prev = subDays(selectedDate, 1)
    setSelectedDate(prev)
    fetchAppointments(prev)
  }

  const goToNextDay = () => {
    const next = addDays(selectedDate, 1)
    setSelectedDate(next)
    fetchAppointments(next)
  }

  const goToToday = () => {
    const today = new Date()
    setSelectedDate(today)
    fetchAppointments(today)
  }

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={goToPrevDay} disabled={loading}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <span
            onClick={goToToday}
            className="text-sm font-semibold cursor-pointer hover:text-primary transition-colors"
          >
            {isToday ? 'Hoy' : format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </span>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-6 px-2">
              Hoy
            </Button>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={goToNextDay} disabled={loading}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No hay citas para este día</p>
          <Link href="/dashboard/citas">
            <Button variant="outline" size="sm" className="mt-2">
              Programar cita
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 bg-primary/10 rounded-full shrink-0">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm truncate">{appointment.lead?.nombre || 'Sin nombre'}</p>
                    <Badge
                      variant={estadoColors[appointment.estado]?.variant || 'outline'}
                      className="text-xs shrink-0"
                    >
                      {appointment.estado}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-1">
                    {appointment.servicio?.nombre || 'Sin servicio'}
                  </p>
                  <div className="flex items-center text-xs text-muted-foreground gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(appointment.fechaHora), 'HH:mm', { locale: es })}
                    </span>
                    {appointment.servicio?.precio != null && (
                      <span>
                        ${appointment.servicio.precio} {appointment.servicio.moneda}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Link href={`/dashboard/citas/${appointment.id}`} className="shrink-0 ml-2">
                <Button variant="ghost" size="sm">
                  Ver
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
