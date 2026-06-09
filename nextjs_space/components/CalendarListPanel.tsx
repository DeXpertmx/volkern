'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Calendar as CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'

interface ConnectedCalendar {
  id: string
  calendarId: string
  nombre: string
  color: string
  visible: boolean
  ultimaSync: string | null
}

interface CalendarListPanelProps {
  onCalendarsChange?: (calendars: ConnectedCalendar[]) => void
}

export function CalendarListPanel({ onCalendarsChange }: CalendarListPanelProps) {
  const [calendars, setCalendars] = useState<ConnectedCalendar[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  const fetchCalendars = useCallback(async () => {
    try {
      const res = await fetch('/api/calendars')
      if (res.ok) {
        const data = await res.json()
        setCalendars(data.calendars || [])
        setConnected(data.connected)
        onCalendarsChange?.(data.calendars || [])
      }
    } catch (e) {
      console.error('Error fetching calendars:', e)
    } finally {
      setLoading(false)
    }
  }, [onCalendarsChange])

  useEffect(() => {
    fetchCalendars()
  }, [fetchCalendars])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/calendars/refresh', { method: 'POST' })
      if (res.ok) {
        toast.success('Lista de calendarios actualizada')
        await fetchCalendars()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al refrescar calendarios')
      }
    } catch (e) {
      toast.error('Error de conexión al refrescar')
    } finally {
      setRefreshing(false)
    }
  }

  const handleToggle = async (calId: string, currentVisible: boolean) => {
    setTogglingIds(prev => new Set(prev).add(calId))
    try {
      const res = await fetch('/api/calendars/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: calId, visible: !currentVisible }),
      })
      if (res.ok) {
        const updated = calendars.map(c =>
          c.id === calId ? { ...c, visible: !currentVisible } : c
        )
        setCalendars(updated)
        onCalendarsChange?.(updated)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al cambiar visibilidad')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(calId)
        return next
      })
    }
  }

  if (loading) {
    return (
      <Card className="p-3 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </Card>
    )
  }

  if (!connected) {
    return null // No mostrar si no hay Google Calendar conectado
  }

  if (calendars.length === 0) {
    return (
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            Google Calendars
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Cargar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Presiona "Cargar" para ver tus calendarios de Google
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          Google Calendars
          <span className="text-xs font-normal text-muted-foreground ml-1">
            ({calendars.length})
          </span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Sincronizar
        </Button>
      </div>

      <div className="space-y-1">
        {calendars.map((cal) => (
          <div
            key={cal.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors group"
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: cal.visible ? cal.color : undefined }}
            />
            <span
              className={`text-sm flex-1 truncate ${
                cal.visible ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {cal.nombre}
            </span>
            <Switch
              checked={cal.visible}
              onCheckedChange={() => handleToggle(cal.id, cal.visible)}
              disabled={togglingIds.has(cal.id)}
              className="scale-75"
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
