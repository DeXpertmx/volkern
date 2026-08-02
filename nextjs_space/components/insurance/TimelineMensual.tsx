'use client';

import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { formatCurrency } from '@/components/insurance/portfolio-format';

export interface TimelinePoint {
  mes: string;       // 'YYYY-MM'
  label: string;     // 'May 24'
  polizasCount: number;
  polizasNuevas: number;
  primaTotal: number;
  primaPromedio: number;
}

export interface TimelineData {
  generado: string;
  months: number;
  serie: TimelinePoint[];
  tendencia: number;            // % variacion vs últimos 3 meses
  mejorMes: TimelinePoint;
  totalVentana: number;
}

interface TimelineMensualProps {
  data: TimelineData;
  loading?: boolean;
}

/**
 * Visualización de timeline mensual con:
 *  · SVG sparkline que conecta los puntos con `primaTotal`
 *  · Bars clickeables con la prima por mes (resaltado del mes seleccionado)
 *  · Pill de tendencia (verde ↑ / rojo ↓ / gris —)
 *  · Card de detalle del mes clickeado
 */
export function TimelineMensual({ data, loading }: TimelineMensualProps) {
  const { serie, tendencia, mejorMes, totalVentana } = data;
  const [selectedMes, setSelectedMes] = useState<string | null>(
    serie.length > 0 ? serie[serie.length - 1].mes : null
  );

  const max = useMemo(
    () => Math.max(1, ...serie.map(p => p.primaTotal)),
    [serie]
  );

  // Geometría para el SVG sparkline.
  const WIDTH = 600;
  const HEIGHT = 60;
  const STEP_X = serie.length > 1 ? WIDTH / (serie.length - 1) : WIDTH;
  const points = serie.map((p, i) => {
    const x = i * STEP_X;
    const y = HEIGHT - (p.primaTotal / max) * (HEIGHT - 8) - 4;
    return { x, y, mes: p.mes };
  });
  const polylineD = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaD = `${points[0]?.x ?? 0},${HEIGHT} ${polylineD} ${points[points.length - 1]?.x ?? 0},${HEIGHT}`;

  const tendenciaInfo = (() => {
    if (Math.abs(tendencia) < 1) {
      return { icon: Minus, color: 'text-slate-600', bg: 'bg-slate-100', label: 'estable' };
    }
    if (tendencia > 0) {
      return { icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'sube' };
    }
    return { icon: TrendingDown, color: 'text-red-700', bg: 'bg-red-100', label: 'baja' };
  })();

  const TendIcon = tendenciaInfo.icon;
  const selectedPoint = selectedMes ? serie.find(p => p.mes === selectedMes) ?? null : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Cargando timeline…
      </div>
    );
  }

  const avgMensual = serie.length > 0 ? totalVentana / serie.length : 0;

  return (
    <div className="space-y-4">
      {/* Header con KPIs resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Últimos</span>
            <span className="font-bold">{data.months}</span>
            <span className="text-muted-foreground">meses</span>
          </div>
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tendenciaInfo.bg} ${tendenciaInfo.color}`}
          >
            <TendIcon className="w-3 h-3" />
            <span>
              {tendencia > 0 ? '+' : ''}
              {tendencia.toFixed(1)}%
            </span>
            <span className="opacity-70">{tendenciaInfo.label}</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Total emitido:{' '}
          <span className="font-semibold text-foreground">{formatCurrency(totalVentana)}</span>
          {' '}
          · Promedio mensual:{' '}
          <span className="font-semibold text-foreground">{formatCurrency(avgMensual)}</span>
        </div>
      </div>

      {/* SVG sparkline */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT + 8}`}
          preserveAspectRatio="none"
          className="w-full h-16"
          aria-label="Línea de tiempo de prima"
        >
          <defs>
            <linearGradient id="timelineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#timelineFill)" />
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylineD}
          />
          {points.map((p, i) => {
            const isMejor = serie[i].mes === mejorMes.mes && mejorMes.primaTotal > 0;
            return (
              <circle
                key={p.mes}
                cx={p.x}
                cy={p.y}
                r={isMejor ? 4 : 2.5}
                fill={isMejor ? '#f59e0b' : '#10b981'}
                stroke="#fff"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>

      {/* Bars clickeables */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
        {serie.map(p => {
          const heightPct = max > 0 ? Math.max(2, (p.primaTotal / max) * 100) : 2;
          const isSelected = p.mes === selectedMes;
          const isMejor = p.mes === mejorMes.mes && mejorMes.primaTotal > 0;
          return (
            <button
              key={p.mes}
              type="button"
              onClick={() => setSelectedMes(p.mes)}
              title={`${p.label}: ${formatCurrency(p.primaTotal)} · ${p.polizasCount} pólizas`}
              className={`group flex flex-col items-center gap-1 px-1 py-2 rounded-md transition-colors ${
                isSelected ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-slate-50'
              }`}
            >
              <div className="relative h-16 w-full flex items-end justify-center">
                <div
                  className={`w-full rounded-t transition-all ${
                    isMejor
                      ? 'bg-amber-400 group-hover:bg-amber-500'
                      : isSelected
                        ? 'bg-emerald-500'
                        : 'bg-slate-300 group-hover:bg-emerald-300'
                  }`}
                  style={{ height: `${heightPct}%`, minHeight: '2px' }}
                />
              </div>
              <span
                className={`text-[10px] leading-none truncate w-full text-center ${
                  isSelected ? 'font-semibold text-emerald-700' : 'text-muted-foreground'
                }`}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detalle del mes seleccionado */}
      {selectedPoint && (
        <div className="rounded-lg border bg-slate-50/70 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h4 className="font-medium">
              {selectedPoint.label}
              {selectedPoint.mes === mejorMes.mes && mejorMes.primaTotal > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  Mejor mes
                </span>
              )}
            </h4>
            <span className="text-2xl font-bold tabular-nums">{formatCurrency(selectedPoint.primaTotal)}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Pólizas emitidas</p>
              <p className="font-semibold">{selectedPoint.polizasCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Prima promedio</p>
              <p className="font-semibold tabular-nums">{formatCurrency(selectedPoint.primaPromedio)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">% del total</p>
              <p className="font-semibold tabular-nums">
                {totalVentana > 0
                  ? `${((selectedPoint.primaTotal / totalVentana) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
