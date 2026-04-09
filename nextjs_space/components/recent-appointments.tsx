
'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, User } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface Appointment {
  id: string
  fechaHora: string
  estado: string
  lead: {
    nombre: string
    email: string
  }
  servicio: {
    nombre: string
    precio: number
    moneda: string
  }
}

interface RecentAppointmentsProps {
  appointments: Appointment[]
}

const estadoColors: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", color: string }> = {
  'pendiente': { variant: 'outline', color: 'text-orange-600' },
  'confirmada': { variant: 'default', color: 'text-blue-600' },
  'pagada': { variant: 'default', color: 'text-green-600' },
  'completada': { variant: 'secondary', color: 'text-gray-600' },
  'cancelada': { variant: 'destructive', color: 'text-red-600' },
}

export function RecentAppointments({ appointments }: RecentAppointmentsProps) {
  if (!appointments || appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          No hay citas programadas próximamente
        </p>
        <Link href="/dashboard/citas">
          <Button variant="outline" size="sm" className="mt-2">
            Programar cita
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {appointments.map((appointment) => (
        <div
          key={appointment.id}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <p className="font-medium text-sm">{appointment.lead?.nombre}</p>
                <Badge 
                  variant={estadoColors[appointment.estado]?.variant || 'outline'}
                  className="text-xs"
                >
                  {appointment.estado}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                {appointment.servicio?.nombre}
              </p>
              <div className="flex items-center text-xs text-muted-foreground space-x-3">
                <div className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  {format(new Date(appointment.fechaHora), 'dd MMM, HH:mm', { locale: es })}
                </div>
                <div className="flex items-center">
                  <span>${appointment.servicio?.precio} {appointment.servicio?.moneda}</span>
                </div>
              </div>
            </div>
          </div>
          <Link href={`/dashboard/citas/${appointment.id}`}>
            <Button variant="ghost" size="sm">
              Ver
            </Button>
          </Link>
        </div>
      ))}
    </div>
  )
}
