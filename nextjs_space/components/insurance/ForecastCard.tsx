'use client';

import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Target,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Activity,
} from 'lucide-react';
import { formatCurrency } from '@/components/insurance/portfolio-format';

export interface ForecastPoint {
  mes: string;
  label: string;
  polizasCount: number;
  polizasNuevas: number;
  primaTotal: number;
  primaPromedio: number;
}

export interface ForecastAccuracy {
  /** Ventana considerada (típicamente 30 días). */
  dias: number;
  /** Número de logs ya backfilleados en esa ventana. */
  muestras: number;
  /** MAPE en el rango 0..1 (0.18 = 18 % error medio). */
  mape: number;
  /** (1 - mape) * 100, redondeado. Es el número que ve el broker. */
  accuracyPct: number;
  /** Mayor número de aciertos consecutivos (errorPct <= 25 %). */
  mejorRacha: number;
  /** True cuando MAPE > 30 % con >= 5 muestras. */
  experimental: boolean;
  /** 1.0 = banda estándar, 1.6 = banda amplia cuando experimental. */
  bandaMultiplicador: number;
}

export interface ForecastData {
  generado: string;
  ventana: ForecastPoint[];
  proyeccion: number;
  confianza: number;
  rangoMin: number;
  rangoMax: number;
  slope: number;
  intercept: number;
  r2: number;
  mensaje: string;
  accuracy?: ForecastAccuracy;
}

interface ForecastCardProps {
  data: ForecastData | null;
  loading?: boolean;
}

const EMPTY_ACCURACY: ForecastAccuracy = {
  dias: 30,
  muestras: 0,
  mape: 0,
  accuracyPct: 100,
  mejorRacha: 0,
  experimental: false,
  bandaMultiplicador: 1,
};

/**
 * Card de forecast con:
 *  · Valor proyectado grande en el centro
 *  · Pill de confianza con color semántico (verde / ámbar / rojo según R²)
 *  · Chip de accuracy histórica ("Acertó en X% últimos N días")
 *  · Badge "Experimental" cuando accuracy.experimental
 *  · Banda de incertidumbre (ensanchada cuando el modelo es experimental)
 *  · Tendencia (slope↑ ↓) con icono
 *  · Sparkline SVG con histórico + punto proyectado
 *  · Mensaje humano interpretativo
 */
export function ForecastCard({ data, loading }: ForecastCardProps) {
  const {
    ventana = [],
    proyeccion = 0,
    confianza = 0,
    rangoMin = 0,
    rangoMax = 0,
    slope = 0,
    mensaje = '',
    accuracy = EMPTY_ACCURACY,
  } = data ?? ({} as Partial<ForecastData>);

  // ─── Geometría SVG ────────────────────────────────────────────────
  const WIDTH = 600;
  const HIST_HEIGHT = 60;
  const PROJ_HEIGHT = 24;

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
  const slopeY = HIST_HEIGHT - (Math.max(0, slope * ventana.length + (ventana[ventana.length - 1]?.primaTotal ?? 0)) / max) * (HIST_HEIGHT - 8) - 4;

  const polylineHist = points.map(p => `${p.x},${p.y}`).join(' ');

  // ─── Confianza → color semántico (R²) ──────────────────────────────
  const trustLevel = useMemo(() => {
    if (confianza >= 0.7) return { color: 'text-emerald-700', bg: 'bg-emerald-100', ring: 'ring-emerald-300', label: 'Alta' };
    if (confianza >= 0.4) return { color: 'text-amber-700', bg: 'bg-amber-100', ring: 'ring-amber-300', label: 'Media' };
    return { color: 'text-red-700', bg: 'bg-red-100', ring: 'ring-red-300', label: 'Baja' };
  }, [confianza]);

  // ─── Accuracy histórica → color semántico ─────────────────────────
  const accuracyLevel = useMemo(() => {
    if (accuracy.muestras === 0) {
      return { color: 'text-slate-600', bg: 'bg-slate-100', ring: 'ring-slate-200', label: 'Sin historial' };
    }
    if (accuracy.accuracyPct >= 80) {
      return { color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', label: 'Fiable' };
    }
    if (accuracy.accuracyPct >= 70) {
      return { color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', label: 'Aceptable' };
    }
    return { color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200', label: 'Baja' };
  }, [accuracy]);

  // ─── Pendiente → icono ────────────────────────────────────────────
  const SlopeIcon = slope > 50 ? TrendingUp : slope < -50 ? TrendingDown : Minus;
  const slopeLabel = slope > 50 ? '+' : '';
  const TrustIcon = confianza >= 0.7 ? CheckCircle2 : AlertCircle;

  // Color de la banda: ámbar en modo experimental, indigo en modo estándar.
  const bandGradientId = accuracy.experimental ? 'forecastBandExp' : 'forecastBand';
  const bandStopColor = accuracy.experimental ? '#f59e0b' : '#6366f1';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Calculando proyección…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con valor proyectado + chips */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Próximo mes proyectado
            </p>
            {accuracy.experimental && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-200 text-amber-900 ring-1 ring-amber-300"
                title={`MAPE ${(accuracy.mape * 100).toFixed(0)}% supera el umbral 30% y activa la banda amplia`}
              >
                <FlaskConical className="w-3 h-3" />
                Experimental
              </span>
            )}
          </div>
          <p className="text-4xl font-bold mt-1 tabular-nums">{formatCurrency(proyeccion)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rango probable: {formatCurrency(rangoMin)} – {formatCurrency(rangoMax)}
            {accuracy.experimental && accuracy.bandaMultiplicador > 1 && (
              <span className="ml-1 text-amber-700">
                · banda ×{accuracy.bandaMultiplicador.toFixed(1)} (incertidumbre alta)
              </span>
            )}
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

      {/* Chip de accuracy histórica — el "Nuestra predicción acertó en X%" */}
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md ${accuracyLevel.bg} ring-1 ${accuracyLevel.ring}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Activity className={`w-4 h-4 ${accuracyLevel.color} flex-shrink-0`} />
          <p className={`text-sm font-medium ${accuracyLevel.color} truncate`}>
            {accuracy.muestras > 0 ? (
              <>
                Nuestra predicción acertó en <strong className="tabular-nums">{accuracy.accuracyPct}%</strong> los últimos <strong>{accuracy.dias}</strong> días
                {accuracy.mejorRacha > 1 && (
                  <span className="text-xs opacity-75 ml-1">
                    · mejor racha: {accuracy.mejorRacha} aciertos seguidos
                  </span>
                )}
              </>
            ) : (
              <>
                Sin historial suficiente para validar accuracy
                <span className="text-xs opacity-75 ml-1">
                  (se necesitan al menos 1 log backfilleado)
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-white/60 ring-1 ring-slate-200">
            {accuracy.muestras} muestras
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/60 ring-1 ring-slate-200">
            MAPE {(accuracy.mape * 100).toFixed(0)}%
          </span>
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
            <linearGradient id={bandGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={bandStopColor} stopOpacity={accuracy.experimental ? 0.32 : 0.18} />
              <stop offset="100%" stopColor={bandStopColor} stopOpacity={accuracy.experimental ? 0.06 : 0.04} />
            </linearGradient>
          </defs>

          {/* Banda de incertidumbre alrededor del proyectado (más ancha si experimental) */}
          <rect
            x={projPoint.x - STEP_X * (accuracy.experimental ? 0.55 : 0.4)}
            y={rangoMaxY}
            width={STEP_X * (accuracy.experimental ? 1.1 : 0.8)}
            height={Math.max(2, rangoMinY - rangoMaxY)}
            fill={`url(#${bandGradientId})`}
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
              stroke={bandStopColor}
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}

          {/* Puntos históricos */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#10b981" stroke="#fff" strokeWidth="1.5" />
          ))}

          {/* Punto proyectado */}
          <circle cx={projPoint.x} cy={projPoint.y} r={5} fill={bandStopColor} stroke="#fff" strokeWidth="2" />
          <text
            x={projPoint.x}
            y={projPoint.y - 9}
            textAnchor="middle"
            className={accuracy.experimental ? 'fill-amber-700' : 'fill-indigo-600'}
            fontSize="9"
            fontWeight="600"
          >
            {accuracy.experimental ? 'EXPERIMENTAL' : 'PRONÓSTICO'}
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
        <div className={`text-[10px] text-center font-semibold truncate ${accuracy.experimental ? 'text-amber-700' : 'text-indigo-600'}`}>
          Próx.
        </div>
      </div>

      {/* Mensaje interpretativo */}
      <div className={`text-xs px-3 py-2 rounded-md ${
        accuracy.experimental
          ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
          : confianza >= 0.7
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
