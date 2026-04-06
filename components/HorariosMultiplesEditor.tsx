'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Clock } from 'lucide-react'

interface RangoHorario {
  inicio: string
  fin: string
}

interface DiaHorario {
  activo: boolean
  rangos: RangoHorario[]
}

export interface HorariosConfig {
  lunes: DiaHorario
  martes: DiaHorario
  miercoles: DiaHorario
  jueves: DiaHorario
  viernes: DiaHorario
  sabado: DiaHorario
  domingo: DiaHorario
}

const defaultHorarios: HorariosConfig = {
  lunes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  martes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  miercoles: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  jueves: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  viernes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  sabado: { activo: false, rangos: [] },
  domingo: { activo: false, rangos: [] },
}

const diasSemana = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
] as const

interface Props {
  value?: HorariosConfig | null
  onChange: (horarios: HorariosConfig) => void
}

export default function HorariosMultiplesEditor({ value, onChange }: Props) {
  const [horarios, setHorarios] = useState<HorariosConfig>(value || defaultHorarios)

  useEffect(() => {
    if (value) {
      // Merge con defaults para asegurar que todos los días existan
      const merged = { ...defaultHorarios }
      for (const dia of diasSemana) {
        if (value[dia.key]) {
          merged[dia.key] = value[dia.key]
        }
      }
      setHorarios(merged)
    }
  }, [value])

  const updateHorarios = (newHorarios: HorariosConfig) => {
    setHorarios(newHorarios)
    onChange(newHorarios)
  }

  const toggleDia = (dia: keyof HorariosConfig) => {
    const newHorarios = { ...horarios }
    newHorarios[dia] = {
      ...newHorarios[dia],
      activo: !newHorarios[dia].activo,
      rangos: !newHorarios[dia].activo ? [{ inicio: '09:00', fin: '17:00' }] : newHorarios[dia].rangos
    }
    updateHorarios(newHorarios)
  }

  const addRango = (dia: keyof HorariosConfig) => {
    const newHorarios = { ...horarios }
    const ultimoRango = newHorarios[dia].rangos[newHorarios[dia].rangos.length - 1]
    // Sugerir siguiente rango después del último
    const nuevoInicio = ultimoRango ? ultimoRango.fin : '09:00'
    newHorarios[dia].rangos.push({ inicio: nuevoInicio, fin: '18:00' })
    updateHorarios(newHorarios)
  }

  const removeRango = (dia: keyof HorariosConfig, index: number) => {
    const newHorarios = { ...horarios }
    newHorarios[dia].rangos.splice(index, 1)
    // Si no quedan rangos, desactivar el día
    if (newHorarios[dia].rangos.length === 0) {
      newHorarios[dia].activo = false
    }
    updateHorarios(newHorarios)
  }

  const updateRango = (dia: keyof HorariosConfig, index: number, field: 'inicio' | 'fin', value: string) => {
    const newHorarios = { ...horarios }
    newHorarios[dia].rangos[index][field] = value
    updateHorarios(newHorarios)
  }

  return (
    <div className="space-y-4">
      {diasSemana.map(({ key, label }) => (
        <div key={key} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={horarios[key].activo}
                onCheckedChange={() => toggleDia(key)}
              />
              <Label className="font-medium text-base">{label}</Label>
            </div>
            {horarios[key].activo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addRango(key)}
                className="text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar horario
              </Button>
            )}
          </div>

          {horarios[key].activo ? (
            <div className="space-y-2 ml-10">
              {horarios[key].rangos.map((rango, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={rango.inicio}
                    onChange={(e) => updateRango(key, index, 'inicio', e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input
                    type="time"
                    value={rango.fin}
                    onChange={(e) => updateRango(key, index, 'fin', e.target.value)}
                    className="w-28"
                  />
                  {horarios[key].rangos.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRango(key, index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground ml-10">Cerrado</p>
          )}
        </div>
      ))}
    </div>
  )
}
