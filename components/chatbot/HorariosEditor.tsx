'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeRange {
  inicio: string;
  fin: string;
}

interface HorariosConfig {
  [key: string]: TimeRange[];
}

interface HorariosEditorProps {
  value: HorariosConfig | null;
  onChange: (horarios: HorariosConfig) => void;
  legacyHorarioInicio?: number;
  legacyHorarioFin?: number;
  legacyDiasActivos?: string;
}

const DIAS_SEMANA = [
  { value: '0', label: 'Domingo', short: 'Dom' },
  { value: '1', label: 'Lunes', short: 'Lun' },
  { value: '2', label: 'Martes', short: 'Mar' },
  { value: '3', label: 'Miércoles', short: 'Mié' },
  { value: '4', label: 'Jueves', short: 'Jue' },
  { value: '5', label: 'Viernes', short: 'Vie' },
  { value: '6', label: 'Sábado', short: 'Sáb' },
];

// Generar opciones de tiempo cada 15 minutos
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      options.push(`${hour}:${minute}`);
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

export function HorariosEditor({
  value,
  onChange,
  legacyHorarioInicio = 9,
  legacyHorarioFin = 18,
  legacyDiasActivos = '1,2,3,4,5',
}: HorariosEditorProps) {
  const [selectedDay, setSelectedDay] = useState('1');

  // Inicializar horarios desde legacy si no existen personalizados
  const getInitialHorarios = (): HorariosConfig => {
    if (value && Object.keys(value).length > 0) {
      return value;
    }
    
    // Convertir legacy a nuevo formato
    const diasArray = legacyDiasActivos.split(',').filter(Boolean);
    const horarios: HorariosConfig = {};
    
    DIAS_SEMANA.forEach((dia) => {
      if (diasArray.includes(dia.value)) {
        horarios[dia.value] = [{
          inicio: `${legacyHorarioInicio.toString().padStart(2, '0')}:00`,
          fin: `${legacyHorarioFin.toString().padStart(2, '0')}:00`,
        }];
      } else {
        horarios[dia.value] = [];
      }
    });
    
    return horarios;
  };

  const [horarios, setHorarios] = useState<HorariosConfig>(getInitialHorarios);

  useEffect(() => {
    if (value && Object.keys(value).length > 0) {
      setHorarios(value);
    }
  }, [value]);

  const updateHorarios = (newHorarios: HorariosConfig) => {
    setHorarios(newHorarios);
    onChange(newHorarios);
  };

  const addTimeRange = (day: string) => {
    const dayRanges = horarios[day] || [];
    const lastRange = dayRanges[dayRanges.length - 1];
    
    // Sugerir siguiente rango basado en el último
    let newStart = '09:00';
    let newEnd = '18:00';
    
    if (lastRange) {
      // Empezar una hora después del fin del último rango
      const [lastHour] = lastRange.fin.split(':').map(Number);
      newStart = `${Math.min(lastHour + 1, 23).toString().padStart(2, '0')}:00`;
      newEnd = `${Math.min(lastHour + 4, 23).toString().padStart(2, '0')}:00`;
    }
    
    const newHorarios = {
      ...horarios,
      [day]: [...dayRanges, { inicio: newStart, fin: newEnd }],
    };
    updateHorarios(newHorarios);
  };

  const removeTimeRange = (day: string, index: number) => {
    const dayRanges = [...(horarios[day] || [])];
    dayRanges.splice(index, 1);
    const newHorarios = { ...horarios, [day]: dayRanges };
    updateHorarios(newHorarios);
  };

  const updateTimeRange = (day: string, index: number, field: 'inicio' | 'fin', value: string) => {
    const dayRanges = [...(horarios[day] || [])];
    dayRanges[index] = { ...dayRanges[index], [field]: value };
    const newHorarios = { ...horarios, [day]: dayRanges };
    updateHorarios(newHorarios);
  };

  const copyToAllDays = (sourceDay: string) => {
    const sourceRanges = horarios[sourceDay] || [];
    const newHorarios: HorariosConfig = {};
    
    DIAS_SEMANA.forEach((dia) => {
      newHorarios[dia.value] = [...sourceRanges.map(r => ({ ...r }))];
    });
    
    updateHorarios(newHorarios);
  };

  const copyToWeekdays = (sourceDay: string) => {
    const sourceRanges = horarios[sourceDay] || [];
    const newHorarios = { ...horarios };
    
    ['1', '2', '3', '4', '5'].forEach((day) => {
      newHorarios[day] = [...sourceRanges.map(r => ({ ...r }))];
    });
    
    updateHorarios(newHorarios);
  };

  const selectedDayRanges = horarios[selectedDay] || [];
  const selectedDayInfo = DIAS_SEMANA.find(d => d.value === selectedDay);

  // Calcular resumen de horarios
  const getHorariosSummary = () => {
    return DIAS_SEMANA.map((dia) => {
      const ranges = horarios[dia.value] || [];
      return {
        ...dia,
        ranges,
        isActive: ranges.length > 0,
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Selector de días */}
      <div className="space-y-2">
        <Label>Selecciona un día para configurar</Label>
        <div className="flex flex-wrap gap-2">
          {DIAS_SEMANA.map((dia) => {
            const ranges = horarios[dia.value] || [];
            const isActive = ranges.length > 0;
            const isSelected = selectedDay === dia.value;
            
            return (
              <Button
                key={dia.value}
                type="button"
                variant={isSelected ? 'default' : isActive ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setSelectedDay(dia.value)}
                className={cn(
                  "relative",
                  isActive && !isSelected && "border-primary/50"
                )}
              >
                {dia.short}
                {isActive && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Editor de horarios del día seleccionado */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">{selectedDayInfo?.label}</h3>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToWeekdays(selectedDay)}
                className="text-xs"
              >
                Copiar a L-V
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToAllDays(selectedDay)}
                className="text-xs"
              >
                Copiar a todos
              </Button>
            </div>
          </div>

          {selectedDayRanges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Sin horarios configurados para este día</p>
              <p className="text-sm">El chatbot no responderá</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayRanges.map((range, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Inicio</Label>
                      <Select
                        value={range.inicio}
                        onValueChange={(val) => updateTimeRange(selectedDay, index, 'inicio', val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fin</Label>
                      <Select
                        value={range.fin}
                        onValueChange={(val) => updateTimeRange(selectedDay, index, 'fin', val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTimeRange(selectedDay, index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addTimeRange(selectedDay)}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar rango de horario
          </Button>
        </CardContent>
      </Card>

      {/* Resumen visual */}
      <div className="space-y-2">
        <Label>Resumen de horarios</Label>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Día</th>
                <th className="px-3 py-2 text-left font-medium">Horarios</th>
              </tr>
            </thead>
            <tbody>
              {getHorariosSummary().map((dia) => (
                <tr 
                  key={dia.value} 
                  className={cn(
                    "border-t cursor-pointer hover:bg-muted/50",
                    selectedDay === dia.value && "bg-muted/30"
                  )}
                  onClick={() => setSelectedDay(dia.value)}
                >
                  <td className="px-3 py-2 font-medium">{dia.label}</td>
                  <td className="px-3 py-2">
                    {dia.ranges.length === 0 ? (
                      <span className="text-muted-foreground">Cerrado</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {dia.ranges.map((range, idx) => (
                          <span 
                            key={idx} 
                            className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary text-xs"
                          >
                            {range.inicio} - {range.fin}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
