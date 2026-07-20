'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Loader2, Plus, Clock, Sun, Moon, Power, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface Schedule {
  id: string
  name: string
  days: string[]
  startTime: string
  endTime: string
  action: 'ACTIVATE' | 'PAUSE'
  isActive: boolean
  campaignId: string
  createdAt: string
}

interface AdScheduleCalendarProps {
  campaignId: string
}

const DAYS = [
  { value: 'LUN', label: 'Lun' },
  { value: 'MAR', label: 'Mar' },
  { value: 'MIE', label: 'Mié' },
  { value: 'JUE', label: 'Jue' },
  { value: 'VIE', label: 'Vie' },
  { value: 'SAB', label: 'Sáb' },
  { value: 'DOM', label: 'Dom' },
]

const ACTIONS = [
  { value: 'ACTIVATE', label: 'Activar', icon: Sun },
  { value: 'PAUSE', label: 'Pausar', icon: Moon },
]

const ACTION_BADGE: Record<string, { label: string; className: string; icon: typeof Sun }> = {
  ACTIVATE: { label: 'Activar', className: 'bg-green-50 text-green-700 border-green-200', icon: Sun },
  PAUSE: { label: 'Pausar', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Moon },
}

export function AdScheduleCalendar({ campaignId }: AdScheduleCalendarProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [action, setAction] = useState<'ACTIVATE' | 'PAUSE'>('ACTIVATE')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSchedules()
  }, [campaignId])

  useEffect(() => {
    if (!createOpen && !editingSchedule) {
      resetForm()
    }
  }, [createOpen, editingSchedule])

  async function fetchSchedules() {
    try {
      setLoading(true)
      const res = await fetch(`/api/ads/schedules?campaignId=${campaignId}`)
      if (!res.ok) throw new Error('Error al cargar horarios')
      const data = await res.json()
      setSchedules(Array.isArray(data) ? data : data.schedules || [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setName('')
    setSelectedDays([])
    setStartTime('09:00')
    setEndTime('18:00')
    setAction('ACTIVATE')
    setIsActive(true)
    setSaving(false)
  }

  function openCreate() {
    resetForm()
    setCreateOpen(true)
  }

  function openEdit(schedule: Schedule) {
    setName(schedule.name)
    setSelectedDays(schedule.days)
    setStartTime(schedule.startTime)
    setEndTime(schedule.endTime)
    setAction(schedule.action)
    setIsActive(schedule.isActive)
    setEditingSchedule(schedule)
  }

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    if (selectedDays.length === 0) {
      toast.error('Selecciona al menos un día')
      return
    }

    if (!startTime || !endTime) {
      toast.error('Define la hora de inicio y fin')
      return
    }

    const isEdit = !!editingSchedule
    const payload = {
      name: name.trim(),
      days: selectedDays,
      startTime,
      endTime,
      action,
      isActive,
      campaignId,
    }

    try {
      setSaving(true)
      const url = isEdit
        ? `/api/ads/schedules/${editingSchedule!.id}`
        : '/api/ads/schedules'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al guardar el horario')
      }
      toast.success(isEdit ? 'Horario actualizado' : 'Horario creado')
      setCreateOpen(false)
      setEditingSchedule(null)
      fetchSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(scheduleId: string, currentEnabled: boolean) {
    try {
      const res = await fetch(`/api/ads/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentEnabled }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      toast.success(currentEnabled ? 'Horario desactivado' : 'Horario activado')
      fetchSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  async function handleDelete(scheduleId: string) {
    if (!confirm('¿Eliminar este horario definitivamente?')) return
    try {
      const res = await fetch(`/api/ads/schedules/${scheduleId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Horario eliminado')
      fetchSchedules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  function formatDays(days: string[]): string {
    return days
      .map((d) => DAYS.find((day) => day.value === d)?.label || d)
      .join(', ')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {schedules.length} horario{schedules.length !== 1 ? 's' : ''} configurado{schedules.length !== 1 ? 's' : ''}
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo Horario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSchedule ? 'Editar Horario' : 'Nuevo Horario'}</DialogTitle>
              <DialogDescription>
                Define cuándo activar o pausar la campaña automáticamente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-name">Nombre</Label>
                <Input
                  id="schedule-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Horario laboral"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Días de la semana</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <label
                      key={day.value}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                        selectedDays.includes(day.value)
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/30'
                      }`}
                    >
                      <Checkbox
                        checked={selectedDays.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                        className="sr-only"
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Hora inicio</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">Hora fin</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Acción</Label>
                <Select
                  value={action}
                  onValueChange={(v: 'ACTIVATE' | 'PAUSE') => setAction(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        <div className="flex items-center gap-2">
                          <a.icon className="h-3.5 w-3.5" />
                          <span>{a.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  id="schedule-active"
                />
                <Label htmlFor="schedule-active">Horario activo</Label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false)
                    setEditingSchedule(null)
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  {editingSchedule ? 'Guardar cambios' : 'Crear horario'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay horarios configurados. Crea un horario para activar o pausar la campaña automáticamente.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {schedules.map((schedule) => {
            const actionInfo = ACTION_BADGE[schedule.action] || {
              label: schedule.action,
              className: '',
              icon: Clock,
            }
            const ActionIcon = actionInfo.icon
            return (
              <Card key={schedule.id} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{schedule.name}</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${actionInfo.className}`}
                        >
                          <ActionIcon className="h-3 w-3 mr-1" />
                          {actionInfo.label}
                        </Badge>
                        {!schedule.isActive && (
                          <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200 shrink-0">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Días:</span>
                          {formatDays(schedule.days)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {schedule.startTime} – {schedule.endTime}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Creado {format(new Date(schedule.createdAt), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={schedule.isActive}
                        onCheckedChange={() => handleToggle(schedule.id, schedule.isActive)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(schedule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(schedule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
