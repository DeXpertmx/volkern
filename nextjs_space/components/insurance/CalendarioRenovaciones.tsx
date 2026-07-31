'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PolizaRenovacion {
  id: string;
  numeroPoliza: string;
  fechaVencimiento: string;
  estado: string;
  primaAnual: number | null;
  moneda: string;
  cliente: { id: string; nombre: string };
  aseguradora: { id: string; nombre: string };
  productoSeguro: { id: string; nombre: string; ramo: string };
}

interface CalendarioRenovacionesProps {
  polizas: PolizaRenovacion[];
  onPolizaClick?: (id: string) => void;
  onMonthChange?: (year: number, month: number) => void;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const RAMO_COLORS: Record<string, string> = {
  AUTO: '#3B82F6',
  HOGAR: '#22C55E',
  VIDA: '#A855F7',
  SALUD: '#EF4444',
  GASTOS_MEDICOS: '#F97316',
  EMPRESARIAL: '#6366F1',
  RESPONSABILIDAD_CIVIL: '#EC4899',
  INCENDIO: '#F59E0B',
  TRANSPORTE: '#06B6D4',
  AHORRO: '#84CC16',
  JUBILACION: '#8B5CF6',
  OTROS: '#6B7280',
};

export function CalendarioRenovaciones({
  polizas,
  onPolizaClick,
  onMonthChange,
}: CalendarioRenovacionesProps) {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Agrupar pólizas por día
  const polizasPorDia = useMemo(() => {
    const map: Record<string, PolizaRenovacion[]> = {};
    for (const p of polizas) {
      const d = new Date(p.fechaVencimiento);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [polizas]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
    setSelectedDay(null);
    onMonthChange?.(currentMonth === 0 ? currentYear - 1 : currentYear, currentMonth === 0 ? 11 : currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
    setSelectedDay(null);
    onMonthChange?.(currentMonth === 11 ? currentYear + 1 : currentYear, currentMonth === 11 ? 0 : currentMonth + 1);
  };

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  // Calcular días del mes
  const diasEnMes = new Date(currentYear, currentMonth + 1, 0).getDate();
  const primerDiaSemana = new Date(currentYear, currentMonth, 1).getDay();
  const inicioOffset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1; // Lunes=0

  // Días del mes anterior para rellenar
  const diasMesAnterior = new Date(currentYear, currentMonth, 0).getDate();
  const diasPrevios = Array.from({ length: inicioOffset }, (_, i) => ({
    day: diasMesAnterior - inicioOffset + i + 1,
    isCurrentMonth: false,
  }));

  // Días del mes actual
  const diasActuales = Array.from({ length: diasEnMes }, (_, i) => ({
    day: i + 1,
    isCurrentMonth: true,
  }));

  const todosLosDias = [...diasPrevios, ...diasActuales];

  // Polizas para el día seleccionado
  const polizasDelDia = selectedDay
    ? polizasPorDia[`${currentYear}-${currentMonth}-${selectedDay}`] || []
    : [];

  return (
    <TooltipProvider delayDuration={300}>
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h3 className="text-lg font-semibold">
              {MESES[currentMonth]} {currentYear}
            </h3>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {todosLosDias.map(({ day, isCurrentMonth }, idx) => {
              const key = `${isCurrentMonth ? currentYear : (currentMonth === 0 ? currentYear - 1 : currentYear)}-${isCurrentMonth ? currentMonth : (currentMonth === 0 ? 11 : currentMonth - 1)}-${day}`;
              const esHoy = key === todayKey && isCurrentMonth;
              const esSeleccionado = day === selectedDay && isCurrentMonth;
              const polizasDia = polizasPorDia[key] || [];
              const tienePolizas = polizasDia.length > 0;

              // Color de urgencia
              let urgenciaClase = '';
              if (isCurrentMonth && tienePolizas) {
                const diasRestantes = Math.ceil(
                  (new Date(currentYear, currentMonth, day).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                if (diasRestantes <= 15) urgenciaClase = 'bg-red-100 border-red-400 text-red-800';
                else if (diasRestantes <= 30) urgenciaClase = 'bg-amber-100 border-amber-400 text-amber-800';
                else if (diasRestantes <= 60) urgenciaClase = 'bg-blue-100 border-blue-300 text-blue-800';
                else urgenciaClase = 'bg-emerald-50 border-emerald-300 text-emerald-800';
              }

              return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => isCurrentMonth && setSelectedDay(day)}
                        className={`
                          relative h-10 rounded-md text-sm transition-colors border
                          ${!isCurrentMonth ? 'text-muted-foreground/30 cursor-default' : 'cursor-pointer hover:bg-muted'}
                          ${esHoy ? 'border-primary ring-1 ring-primary font-bold' : 'border-transparent'}
                          ${esSeleccionado ? 'bg-primary/10 border-primary/50 font-semibold' : ''}
                          ${isCurrentMonth && tienePolizas && !esSeleccionado ? urgenciaClase : ''}
                        `}
                      >
                        <span>{day}</span>
                        {isCurrentMonth && tienePolizas && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {polizasDia.slice(0, 3).map((p, i) => (
                              <span
                                key={i}
                                className="w-1 h-1 rounded-full"
                                style={{ backgroundColor: RAMO_COLORS[p.productoSeguro.ramo] || '#6B7280' }}
                              />
                            ))}
                            {polizasDia.length > 3 && (
                              <span className="text-[8px] leading-none text-muted-foreground">
                                +{polizasDia.length - 3}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    {isCurrentMonth && tienePolizas && (
                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                        <p className="font-semibold mb-1">{polizasDia.length} póliza(s)</p>
                        {polizasDia.slice(0, 3).map((p, i) => (
                          <p key={i} className="truncate">{p.numeroPoliza} — {p.cliente.nombre}</p>
                        ))}
                        {polizasDia.length > 3 && (
                          <p className="text-muted-foreground">+{polizasDia.length - 3} más</p>
                        )}
                      </TooltipContent>
                    )}
                  </Tooltip>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-red-400 bg-red-100" /> {'<'} 15 días
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-amber-400 bg-amber-100" /> {'<'} 30 días
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-blue-300 bg-blue-100" /> {'<'} 60 días
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-emerald-300 bg-emerald-50" /> {'>'} 60 días
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sidebar: Day Detail */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            {selectedDay
              ? `${selectedDay} de ${MESES[currentMonth]} ${currentYear}`
              : 'Selecciona un día'}
          </h3>

          {!selectedDay ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Haz clic en un día del calendario para ver las pólizas que vencen</p>
            </div>
          ) : polizasDelDia.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p>No hay pólizas que venzan este día</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {polizasDelDia.map(p => {
                const diasRestantes = Math.ceil(
                  (new Date(p.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const urgente = diasRestantes <= 15;
                const ramoColor = RAMO_COLORS[p.productoSeguro.ramo] || '#6B7280';

                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors border-l-4"
                    style={{ borderLeftColor: ramoColor }}
                    onClick={() => onPolizaClick?.(p.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{p.numeroPoliza}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.cliente.nombre}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {p.productoSeguro.ramo.replace('_', ' ')}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {p.aseguradora.nombre}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {p.primaAnual && (
                          <p className="text-xs font-medium">
                            {p.primaAnual.toLocaleString('es-ES')} {p.moneda || 'EUR'}
                          </p>
                        )}
                        <div className={`flex items-center gap-1 mt-1 ${urgente ? 'text-red-600' : diasRestantes <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {urgente ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span className="text-[10px] font-medium">
                            {diasRestantes <= 0
                              ? '¡Vence hoy!'
                              : `${diasRestantes} días`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}
