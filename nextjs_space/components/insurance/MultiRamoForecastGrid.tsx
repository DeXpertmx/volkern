'use client';

import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  ChevronRight,
  X,
  Calendar,
  Building2,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/components/insurance/portfolio-format';
import { RAMO_LABELS, RAMO_COLORS_HEX, type TimelinePoint } from '@/lib/insurance/forecast-engine';

export interface ByRamoData {
  ramo: string;
  label: string;
  ventana: TimelinePoint[];
  slope: number;
  r2: number;
  proyeccion: number;
  confianza: number;
  pendienteLabel: string;
  caidaAbsoluta: number;
  pctCaida: number;
  polizasProximaVencerCount: number;
  polizasProximaVencerTop: Array<{
    polizaId: string;
    numeroPoliza: string;
    cliente: string | null;
    aseguradora: string | null;
    producto: string | null;
    primaAnual: number;
    fechaVencimiento: string;
    diasParaVencer: number;
  }>;
  mensaje: string;
}

interface MultiRamoForecastGridProps {
  data: ByRamoData[] | null;
  loading?: boolean;
  /**
   * Divisa de reporte del tenant, la misma a la que el endpoint convierte las
   * cifras. Va como prop propia porque el endpoint la devuelve al lado de la
   * lista de ramos, no dentro de cada ramo.
   */
  moneda?: string;
}

// ─── Sparkline SVG inline ────────────────────────────────────────────────
function MiniSparkline({ ventana, color, width = 200, height = 40 }: {
  ventana: TimelinePoint[];
  color: string;
  width?: number;
  height?: number;
}) {
  const ys = ventana.map(v => v.primaTotal);
  const max = Math.max(1, ...ys);
  const STEP_X = ventana.length > 1 ? width / (ventana.length - 1) : width;
  const points = ventana.map((p, i) => ({
    x: i * STEP_X,
    y: height - (p.primaTotal / max) * (height - 6) - 3,
  }));
  const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={polyline}
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} stroke="#fff" strokeWidth="1" />
      ))}
    </svg>
  );
}

export function MultiRamoForecastGrid({ data, loading, moneda = '' }: MultiRamoForecastGridProps) {
  const [dialogRamo, setDialogRamo] = useState<ByRamoData | null>(null);

  /**
   * Orden por caída absoluta ascendente (más negativo = peor primero). Ramos
   * con caidaAbsoluta >= 0 (alcista/plano) van al final. Es lo que el broker
   * quiere ver primero: qué ramos perderán más el próximo mes.
   */
  const ordered = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => a.caidaAbsoluta - b.caidaAbsoluta);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Calculando forecast por ramo…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Aún no hay datos por ramo.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {ordered.map(ramo => {
          const color = RAMO_COLORS_HEX[ramo.ramo] ?? '#94a3b8';
          const isFalling = ramo.caidaAbsoluta < 0;
          const isRising = ramo.caidaAbsoluta > 0;
          const pendienteIcon =
            ramo.pendienteLabel.includes('Bajista') ? TrendingDown :
            ramo.pendienteLabel.includes('Alcista') ? TrendingUp :
            Minus;
          const PendienteIcon = pendienteIcon;
          const borderColor = isFalling
            ? 'border-red-200 hover:border-red-400'
            : isRising
              ? 'border-emerald-200 hover:border-emerald-400'
              : 'border-slate-200 hover:border-slate-400';

          return (
            <div
              key={ramo.ramo}
              data-testid={`ramo-card-${ramo.ramo}`}
              className={`rounded-lg bg-white border ${borderColor} p-3 transition-colors hover:shadow-sm`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {ramo.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {ramo.pendienteLabel} · R² {(ramo.r2 * 100).toFixed(0)}%
                  </p>
                </div>
                <PendienteIcon
                  className={`w-4 h-4 flex-shrink-0 ${
                    isFalling ? 'text-red-600' : isRising ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                />
              </div>

              <MiniSparkline ventana={ramo.ventana} color={color} />

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">Próximo mes</p>
                  <p className={`font-bold tabular-nums ${isFalling ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatCurrency(ramo.proyeccion, moneda)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">Caída absoluta</p>
                  <p className={`font-bold tabular-nums ${isFalling ? 'text-red-700' : isRising ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {isFalling ? '−' : isRising ? '+' : ''}
                    {formatCurrency(Math.abs(ramo.caidaAbsoluta), moneda)}
                  </p>
                </div>
              </div>

              <Button
                variant={isFalling ? 'default' : 'outline'}
                size="sm"
                className="w-full mt-3 text-xs"
                onClick={() => setDialogRamo(ramo)}
                data-testid={`recuperar-${ramo.ramo}`}
              >
                Recuperar ramo {ramo.label}
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Dialog: top pólizas PROXIMA_A_VENCER del ramo seleccionado */}
      {dialogRamo && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDialogRamo(null)}
          data-testid="recuperar-ramo-dialog"
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: RAMO_COLORS_HEX[dialogRamo.ramo] ?? '#94a3b8' }}
                />
                <div>
                  <h2 className="text-lg font-bold">
                    Recuperar ramo {dialogRamo.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {dialogRamo.polizasProximaVencerCount} {dialogRamo.polizasProximaVencerCount === 1 ? 'póliza próxima a vencer' : 'pólizas próximas a vencer'} · Caída proyectada{' '}
                    {formatCurrency(Math.abs(dialogRamo.caidaAbsoluta), moneda)}
                  </p>
                </div>
              </div>
              <button
                className="p-2 hover:bg-slate-100 rounded-md"
                onClick={() => setDialogRamo(null)}
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-auto flex-1 px-5 py-3">
              {dialogRamo.polizasProximaVencerTop.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500 opacity-60" />
                  <p className="text-sm text-muted-foreground">
                    No hay pólizas próximas a vencer para este ramo en los próximos
                    {' '}{data[0]?.polizasProximaVencerCount !== undefined ? '60' : '60'} días.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left font-medium py-2 px-2">Nº Póliza</th>
                      <th className="text-left font-medium py-2 px-2">Cliente</th>
                      <th className="text-left font-medium py-2 px-2 hidden md:table-cell">Aseguradora</th>
                      <th className="text-left font-medium py-2 px-2 hidden lg:table-cell">Producto</th>
                      <th className="text-right font-medium py-2 px-2">Prima anual</th>
                      <th className="text-center font-medium py-2 px-2">Días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dialogRamo.polizasProximaVencerTop.map(p => (
                      <tr key={p.polizaId} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono text-xs">{p.numeroPoliza}</td>
                        <td className="py-2 px-2 truncate max-w-[160px]">{p.cliente ?? '—'}</td>
                        <td className="py-2 px-2 truncate max-w-[140px] hidden md:table-cell">
                          <Building2 className="w-3 h-3 inline mr-1 opacity-50" />
                          {p.aseguradora ?? '—'}
                        </td>
                        <td className="py-2 px-2 truncate max-w-[160px] hidden lg:table-cell">
                          <Package className="w-3 h-3 inline mr-1 opacity-50" />
                          {p.producto ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold tabular-nums">
                          {formatCurrency(p.primaAnual, moneda)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Badge
                            variant="outline"
                            className={
                              p.diasParaVencer <= 15
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : p.diasParaVencer <= 30
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-blue-100 text-blue-800 border-blue-200'
                            }
                          >
                            <Calendar className="w-2.5 h-2.5 mr-0.5" />
                            {p.diasParaVencer}d
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 p-4 border-t bg-slate-50">
              <p className="text-xs text-muted-foreground">
                Mostrando las {Math.min(dialogRamo.polizasProximaVencerTop.length, 10)} pólizas de mayor prima próximas a vencer
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/dashboard/seguros/polizas?ramo=${dialogRamo.ramo}`}>
                    Ver todas en Pólizas
                  </a>
                </Button>
                <Button variant="default" size="sm" asChild>
                  <a href="/dashboard/seguros/renovaciones">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Ir a Renovaciones
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
