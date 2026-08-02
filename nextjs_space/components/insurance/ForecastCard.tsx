'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Sparkles, Target, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/components/insurance/portfolio-format';

export interface ForecastPoint {
  mes: string;
  label: string;
  polizasCount: number;
  polizasNuevas: number;
  primaTotal: number;
  primaPromedio: number;
}

export interface ForecastData {
  generado: string;
  ventana: ForecastPoint[];        // últimos 6 meses
  proyeccion: number;              // prima estimada del próximo mes
  confianza: number;              // 0..1 (R² del ajuste lineal)
  rangoMin: number;
  rangoMax: number;
  slope: number;
  intercept: number;
  r2: number;
  mensaje: string;
}

interface ForecastCardProps {
  data: ForecastData | null;
  loading?: boolean;
}

/**
 * Card de forecast con:
 *  · Valor proyectado grande en el centro
 *  · Pill de confianza con color semántico (verde / ámbar / rojo según R²)
 *  · Tendencia (slope↑ ↓) con icono
 *  · Sparkline SVG con histórico + punto proyectado + banda de incertidumbre
 *  · Mensaje humano interpretativo
 */
export function ForecastCard({ data, loading }: ForecastCardProps) {
  const { ventana, proyeccion, confianza, rangoMin, rangoMax, slope, mensaje } = data ?? {
    ventana: [],
    proyeccion: 0,
    confianza: 0,
    rangoMin: 0,
    rangoMax: 0,
    slope: 0,
    mensaje: '',
  };

  // ─── Geometría SVG ──────────────────────────────────────────────────
  const WIDTH = 600;
  const HIST_HEIGHT = 60;
  const PROJ_HEIGHT = 24;

  // Total histórico + 1 slot para el proyectado + espacio para la banda.
  const totalSlots = ventana.length + 1;
  const STEP_X = totalSlots > 1 ? WIDTH / (totalSlots - 1) : WIDTH;

  const ysAll = [...ventana.map(v => v.primaTotal), proyeccion];
  const max = Math.max(1, ...ysAll, rangoMax);

  const points = ventana.map((p, i) => ({
    x: i * STEP_X,
    y: HIST_HEIGHT - (p.primaTotal / max) * (HIST_HEIGHT - 8) - 4,
    mes: p.mes,
  }));
  const projPoint = {
    x: ventana.length * STEP_X,
    y: HIST_HEIGHT - (proyeccion / max) * (HIST_HEIGHT - 8) - 4,
  };
  const rangoMinY = HIST_HEIGHT - (rangoMin / max) * (HIST_HEIGHT - 8) - 4;
  const rangoMaxY = HIST_HEIGHT - (rangoMax / max) * (HIST_HEIGHT - 8) - 4;
  const slopeY = HIST_HEIGHT - (Math.max(0, slope * ventana.length + ventana[ventana.length - 1]?.primaTotal ?? 0) / max) * (HIST_HEIGHT - 8) - 4;

  const polylineHist = points.map(p => `${p.x},${p.y}`).join(' ');

  // ─── Confianza → color semántico ───────────────────────────────────
  const trustLevel = useMemo(() => {
    if (confianza >= 0.7) return { color: 'text-emerald-700', bg: 'bg-emerald-100', ring: 'ring-emerald-300', label: 'Alta' };
    if (confianza >= 0.4) return { color: 'text-amber-700', bg: 'bg-amber-100', ring: 'ring-amber-300', label: 'Media' };
    return { color: 'text-red-700', bg: 'bg-red-100', ring: 'ring-red-300', label: 'Baja' };
  }, [confianza]);

  // ─── Pendiente → icono ─────────────────────────────────────────────
  const SlopeIcon = slope > 50 ? TrendingUp : slope < -50 ? TrendingDown : Minus;
  const slopeLabel =
    slope > 50 ? '+' : '';
  // ─── Mensaje adaptado a confianza ──────────────────────────────────
  const TrustIcon =
    confianza >= 0.7 ? CheckCircle2 :
    confianza >= 0.4 ? AlertCircle :
    AlertCircle;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Calculando proyección…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con valor proyectado */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Próximo mes proyectado
          </p>
          <p className="text-4xl font-bold mt-1 tabular-nums">{formatCurrency(proyeccion)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rango probable: {formatCurrency(rangoMin)} – {formatCurrency(rangoMax)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${trustLevel.bg} ${trustLevel.color} ring-1 ${trustLevel.ring}`}
          >
            <TrustIcon className="w-3.5 h-3.5" />
            <span>Confianza {trustLevel.label}</span>
            <span className="opacity-70 tabular-nums">({(confianza * 100).toFixed(0)}%)</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <SlopeIcon className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              Pendiente {slopeLabel}{Math.round(slope).toLocaleString('es-MX')} / mes
            </span>
          </div>
        </div>
      </div>

      {/* Sparkline histórico + proyección + banda */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HIST_HEIGHT + PROJ_HEIGHT + 8}`}
          preserveAspectRatio="none"
          className="w-full h-24"
          aria-label="Forecast del próximo mes"
        >
          <defs>
            <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Banda de incertidumbre alrededor del proyectado */}
          <rect
            x={projPoint.x - STEP_X * 0.4}
            y={rangoMaxY}
            width={STEP_X * 0.8}
            height={Math.max(2, rangoMinY - rangoMaxY)}
            fill="url(#forecastBand)"
          />

          {/* Línea histórica */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylineHist}
          />

          {/* Línea punteada que conecta el último histórico con el proyectado */}
          {points.length >= 1 && (
            <line
              x1={points[points.length - 1].x}
              y1={points[points.length - 1].y}
              x2={projPoint.x}
              y2={projPoint.y}
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}

          {/* Puntos históricos */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#10b981" stroke="#fff" strokeWidth="1.5" />
          ))}

          {/* Punto proyectado */}
          <circle cx={projPoint.x} cy={projPoint.y} r={5} fill="#6366f1" stroke="#fff" strokeWidth="2" />
          <text x={projPoint.x} y={projPoint.y - 9} textAnchor="middle" className="fill-indigo-600" fontSize="9" fontWeight="600">
            PRONÓSTICO
          </text>

          {/* Línea de regresión completa (tendencia subyacente) */}
          {ventana.length >= 2 && (
            <line
              x1={points[0].x}
              y1={HIST_HEIGHT - (ventana[0].primaTotal / max) * (HIST_HEIGHT - 8) - 4}
              x2={projPoint.x}
              y2={Math.min(HIST_HEIGHT - 4, slopeY)}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 4"
              opacity="0.5"
            />
          )}
        </svg>
      </div>

      {/* Labels de meses bajo el chart */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${ventana.length + 1}, minmax(0, 1fr))` }}>
        {ventana.map(p => (
          <div key={p.mes} className="text-[10px] text-center text-muted-foreground truncate">
            {p.label}
          </div>
        ))}
        <div className="text-[10px] text-center text-indigo-600 font-semibold truncate">
          Próx.
        </div>
      </div>

      {/* Mensaje interpretativo */}
      <div className={`text-xs px-3 py-2 rounded-md ${
        confianza >= 0.7
          ? 'bg-emerald-50 text-emerald-800'
          : confianza >= 0.4
            ? 'bg-amber-50 text-amber-800'
            : 'bg-slate-50 text-slate-700'
      }`}>
        <Target className="w-3 h-3 inline-block mr-1 -mt-0.5" />
        {mensaje}
      </div>
    </div>
  );
}
