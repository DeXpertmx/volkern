'use client';

import React from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle2,
  Cloud,
  Database,
  FlaskConical,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { formatCurrency } from '@/components/insurance/portfolio-format';

export interface ConsideredEventFE {
  key: string;
  nombre: string;
  ramo: string | null;
  fechaInicio: string;
  fechaFin: string;
  multiplier: number;
  confianza: number;  // 0..1
  fuente: 'learned' | 'static' | 'google_calendar';
}

export interface SmartForecastFE {
  generado: string;
  /**
   * Divisa de reporte del tenant, heredada del forecast base: sus importes ya
   * están convertidos a ella, así que la tarjeta no puede escribir otra.
   */
  tenantMoneda?: string;
  ventana: Array<{ mes: string; label: string; primaTotal: number; polizasCount: number }>;
  slope: number;
  r2: number;
  confianza: number;
  proyectadoBase: number;
  proyectadoAjustado: number;
  ajusteTotal: number;
  eventosConsiderados: ConsideredEventFE[];
  mejoraMapeEstimada: number;
  accuracy: {
    mape: number;
    accuracyPct: number;
    muestras: number;
    dias: number;
  };
  mensaje: string;
}

interface SmartForecastCardProps {
  data: SmartForecastFE | null;
  loading?: boolean;
}

const FUENTE_LABEL: Record<ConsideredEventFE['fuente'], string> = {
  learned: 'Aprendido',
  static: 'Catálogo',
  google_calendar: 'Google Calendar',
};
const FUENTE_COLOR: Record<ConsideredEventFE['fuente'], string> = {
  learned: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  static: 'bg-slate-100 text-slate-700 ring-slate-300',
  google_calendar: 'bg-blue-100 text-blue-800 ring-blue-300',
};
const FUENTE_ICON: Record<ConsideredEventFE['fuente'], React.ComponentType<{ className?: string }>> = {
  learned: Database,
  static: FlaskConical,
  google_calendar: Cloud,
};

/**
 * Card que compara forecast base vs ajustado con multiplicadores estacionales
 * aprendidos. Muestra el delta, lista de eventos y badge de mejora MAPE
 * esperada > 20%.
 */
export function SmartForecastCard({ data, loading }: SmartForecastCardProps) {
  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Calculando forecast inteligente…
      </div>
    );
  }

  const moneda = data.tenantMoneda ?? '';
  const delta = data.proyectadoAjustado - data.proyectadoBase;
  const deltaPct = data.proyectadoBase > 0
    ? ((delta / data.proyectadoBase) * 100)
    : 0;
  const DeltaIcon = delta >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-4">
      {/* Header: comparison base vs ajustado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide font-medium text-slate-600 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Forecast base
          </p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-slate-700">
            {formatCurrency(data.proyectadoBase, moneda)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">regresión lineal 6m</p>
        </div>

        <div className="rounded-lg bg-gradient-to-br from-indigo-50 to-violet-50 ring-2 ring-indigo-300 p-3">
          <p className="text-xs uppercase tracking-wide font-medium text-indigo-700 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            Forecast ajustado
          </p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-indigo-700">
            {formatCurrency(data.proyectadoAjustado, moneda)}
          </p>
          <p className="text-[10px] text-indigo-600 mt-1">
            mejora MAPE esperada: {data.mejoraMapeEstimada}%
          </p>
        </div>

        <div className={`rounded-lg ring-1 p-3 ${
          delta >= 0
            ? 'bg-emerald-50 ring-emerald-200'
            : 'bg-amber-50 ring-amber-200'
        }`}>
          <p className={`text-xs uppercase tracking-wide font-medium flex items-center gap-1.5 ${
            delta >= 0 ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            <DeltaIcon className="w-3 h-3" />
            Ajuste
          </p>
          <p className={`text-2xl font-bold mt-1 tabular-nums flex items-center gap-1 ${
            delta >= 0 ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {delta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {formatCurrency(Math.abs(delta), moneda)}
          </p>
          <p className={`text-[10px] mt-1 ${delta >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {delta >= 0 ? '+' : '-'}{Math.abs(deltaPct).toFixed(1)}% vs base (×{data.ajusteTotal.toFixed(2)})
          </p>
        </div>
      </div>

      {/* Pill MAPE esperado > 20% */}
      {data.mejoraMapeEstimada >= 20 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gradient-to-r from-emerald-50 to-teal-50 ring-1 ring-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
          <p className="text-sm text-emerald-900">
            <strong>+{data.mejoraMapeEstimada}%</strong> de mejora esperada sobre el MAPE
            base ({data.accuracy.muestras > 0 ? `${(data.accuracy.mape * 100).toFixed(0)}% ahora` : 'sin histórico'}).
            Multiplicadores estacionales con buena confianza.
          </p>
        </div>
      )}

      {/* Eventos considerados */}
      <div>
        <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-2">
          Eventos detectados
        </p>
        {data.eventosConsiderados.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ningún evento estacional en el próximo mes. El forecast equivale al base.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.eventosConsiderados.map(ev => {
              const Icon = FUENTE_ICON[ev.fuente];
              return (
                <li
                  key={`${ev.key}-${ev.fechaInicio}`}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-white ring-1 ring-slate-200"
                >
                  <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.nombre}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(ev.fechaInicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      {' → '}
                      {new Date(ev.fechaFin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      {ev.ramo && (
                        <span className="ml-1 px-1 rounded bg-slate-100 text-slate-700 font-semibold">
                          {ev.ramo}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums px-2 py-0.5 rounded bg-slate-100">
                    ×{ev.multiplier.toFixed(2)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ring-1 ${FUENTE_COLOR[ev.fuente]}`}
                  >
                    <Icon className="w-3 h-3" />
                    {FUENTE_LABEL[ev.fuente]}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
                    {(ev.confianza * 100).toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs px-3 py-2 rounded-md bg-slate-50 text-slate-700">
        {data.mensaje}
      </p>
    </div>
  );
}
