'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader2, Link2 } from 'lucide-react'
import { format, addDays, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface Appointment {
  id: string
  fechaHora: string
  estado: string
  lead: { nombre: string; email: string } | null
  servicio: { nombre: string; precio: number; moneda: string } | null
}

const estadoColors: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  pendiente: { variant: 'outline', color: 'text-orange-600' },
  confirmada: { variant: 'default', color: 'text-blue-600' },
  pagada: { variant: 'default', color: 'text-green-600' },
  completada: { variant: 'secondary', color: 'text-gray-600' },
  cancelada: { variant: 'destructive', color: 'text-red-600' },
}

export function DayNavigationAppointments() {
  const [startIdx, setStartIdx] = useState(0)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const hoy = new Date()
      const en7Dias = addDays(hoy, 7)
      const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
      const res = await fetch(
        `/api/citas?fechaInicio=${fmt(hoy)}&fechaFin=${fmt(en7Dias)}&estado=confirmada,pagada,pendiente&sort=asc`
      )
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
    fetchAppointments()
  }, [fetchAppointments])

  // Generar los próximos 7 días
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i))
  const visibleDays = days.slice(startIdx, startIdx + 3)

  // Agrupar citas por día
  const groupedByDay = visibleDays.map((day) => {
    const dayStart = startOfDay(day).getTime()
    const dayEnd = endOfDay(day).getTime()
    return {
      date: day,
      items: appointments.filter((a) => {
        const citaTime = new Date(a.fechaHora).getTime()
        return citaTime >= dayStart && citaTime <= dayEnd
      }),
    }
  })

  const hasAnyAppointments = groupedByDay.some((g) => g.items.length > 0)
  const canGoPrev = startIdx > 0
  const canGoNext = startIdx + 3 < days.length

  return (
    <div>
      {/* Navegación de días */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={() => setStartIdx(startIdx - 1)} disabled={!canGoPrev || loading}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex gap-1 flex-1 justify-center">
          {visibleDays.map((day, i) => {
            const isToday = isSameDay(day, new Date())
            const group = groupedByDay[i]
            return (
              <div
                key={i}
                className={`flex-1 text-center px-2 py-1 rounded-lg ${isToday ? 'bg-primary/10 ring-1 ring-primary/20' : ''}`}
              >
                <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {format(day, 'EEE', { locale: es })}
                </div>
                <div className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </div>
                {group && group.items.length > 0 && (
                  <div className="text-[10px] font-medium text-primary">{group.items.length} cita{group.items.length > 1 ? 's' : ''}</div>
                )}
              </div>
            )
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setStartIdx(startIdx + 1)} disabled={!canGoNext || loading}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasAnyAppointments ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No hay citas próximas</p>
          <Link href="/dashboard/citas">
            <Button variant="outline" size="sm" className="mt-2">
              Programar cita
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByDay.map((group) =>
            group.items.length > 0 ? (
              <div key={group.date.toISOString()}>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {isSameDay(group.date, new Date()) ? 'Hoy' : format(group.date, 'EEEE d MMMM', { locale: es })}
                  <Badge variant="outline" className="text-[10px] ml-1">{group.items.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-1.5 bg-primary/10 rounded-full shrink-0">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="font-medium text-sm truncate">{appointment.lead?.nombre || 'Sin nombre'}</p>
                            <Badge
                              variant={estadoColors[appointment.estado]?.variant || 'outline'}
                              className="text-[10px] h-4 shrink-0"
                            >
                              {appointment.estado}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {appointment.servicio?.nombre || 'Sin servicio'}
                          </p>
                          <div className="flex items-center text-xs text-muted-foreground gap-2 mt-0.5">
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
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}
