'use client';

/**
 * MI CARTERA — rentabilidad operativa de hospitality.
 *
 * La lectura del propietario en tres niveles, con la nomenclatura exacta del
 * informe (la fija el módulo puro y hay guardia de tests):
 *
 *   Ingresos brutos → Ingresos netos → Rentabilidad operativa real
 *
 * - Tabla MI CARTERA: `Propiedad | Ingresos | Gastos | Neto | Margen`, una fila
 *   por propiedad, ordenada por rentabilidad operativa real (responde «¿cuál me
 *   está dejando más dinero?»).
 * - Desglose «¿Dónde se está yendo el dinero?»: coste por categoría de la
 *   cartera (comisiones de canales, limpieza, mantenimiento, consumibles,
 *   gestión, suministros).
 *
 * La página solo pinta: TODO el cálculo vive en el módulo puro
 * (`lib/hospitality/rentabilidad.ts`) vía GET /api/hospitality/rentabilidad.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  Download,
  Info,
  Loader2,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatearImporte } from '@/lib/moneda';
import {
  construirCsv,
  descargarCsv,
  nombreArchivoReporte,
} from '@/lib/hospitality/csv';

interface CosteCategoria {
  categoria: string;
  etiqueta: string;
  importe: number;
  pctIngresos: number;
  partidas: Array<{ concepto: string; importe: number }>;
}

interface FilaPropiedad {
  propertyId: string;
  nombre: string;
  moneda: string;
  reservas: number;
  ingresos: number;
  ingresosNetos: number;
  gastos: number;
  rentabilidadOperativaReal: number;
  margenPct: number;
  costesOperativos: number;
  categorias: CosteCategoria[];
  otrasMonedas: string[];
}

interface DesgloseCoste {
  categoria: string;
  etiqueta: string;
  importe: number;
  pctGastos: number;
  propiedades: number;
}

interface Cartera {
  moneda: string;
  multimoneda: { mixto: boolean; nota: string | null };
  propiedades: FilaPropiedad[];
  total: {
    propiedades: number;
    reservas: number;
    ingresos: number;
    ingresosNetos: number;
    gastos: number;
    rentabilidadOperativaReal: number;
    margenPct: number;
    costesOperativos: number;
    costeMedioReserva: number | null;
  };
  desgloseCostes: DesgloseCoste[];
  notaTerminologica: string;
}

function fmtDinero(valor: number | null, moneda: string): string {
  return formatearImporte(valor, moneda, 2);
}

function fmtMargen(valor: number): string {
  return `${valor.toFixed(0)}%`;
}

/** Color del margen: verde sano, ámbar justo, rojo por debajo de coste operativo. */
function colorMargen(valor: number): string {
  if (valor < 0) return 'text-red-600';
  if (valor < 40) return 'text-amber-600';
  return 'text-emerald-600';
}

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MiCarteraPage() {
  const [loading, setLoading] = useState(true);
  const [cartera, setCartera] = useState<Cartera | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [detalle, setDetalle] = useState<FilaPropiedad | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const res = await fetch(`/api/hospitality/rentabilidad?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar la cartera');
      setCartera(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar la cartera');
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    load();
  }, [load]);

  const exportarCsv = () => {
    if (!cartera) return;
    const csv = construirCsv(
      cartera.propiedades.map((f) => ({
        propiedad: f.nombre,
        moneda: f.moneda,
        reservas: f.reservas,
        ingresos_brutos: f.ingresos,
        ingresos_netos: f.ingresosNetos,
        gastos: f.gastos,
        rentabilidad_operativa_real: f.rentabilidadOperativaReal,
        margen_pct: f.margenPct,
      })),
      { bom: true }
    );
    descargarCsv(nombreArchivoReporte('cartera'), csv);
  };

  const moneda = cartera?.moneda || '';

  return (
    <div className="space-y-4">
      {/* Encabezado del informe */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">MI CARTERA</h1>
              <p className="text-sm text-muted-foreground">
                Reservas + Operación + Rentabilidad: cuánto genera realmente cada propiedad,
                después de comisiones, limpieza, mantenimiento y costes operativos.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-40"
                aria-label="Desde"
              />
              <Input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-40"
                aria-label="Hasta"
              />
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Actualizar
              </Button>
              <Button size="sm" variant="outline" onClick={exportarCsv} disabled={!cartera}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>
          {cartera?.notaTerminologica && (
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{cartera.notaTerminologica}</span>
            </div>
          )}
          {cartera?.multimoneda.nota && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {cartera.multimoneda.nota}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && !cartera && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando cartera…
        </div>
      )}

      {cartera && (
        <>
          {/* Totales de la cartera: los tres niveles */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Ingresos brutos</p>
                <p className="text-2xl font-bold">{fmtDinero(cartera.total.ingresos, moneda)}</p>
                <p className="text-xs text-muted-foreground">
                  {cartera.total.reservas} reservas · {cartera.total.propiedades} propiedades
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Ingresos netos</p>
                <p className="text-2xl font-bold">{fmtDinero(cartera.total.ingresosNetos, moneda)}</p>
                <p className="text-xs text-muted-foreground">Tras comisiones y deducciones</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Rentabilidad operativa real</p>
                <p className={`text-2xl font-bold ${colorMargen(cartera.total.margenPct)}`}>
                  {fmtDinero(cartera.total.rentabilidadOperativaReal, moneda)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tras todos los costes de operar la propiedad
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Margen de la cartera</p>
                <p className={`text-2xl font-bold ${colorMargen(cartera.total.margenPct)}`}>
                  {fmtMargen(cartera.total.margenPct)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Coste medio por reserva:{' '}
                  {cartera.total.costeMedioReserva === null
                    ? '—'
                    : fmtDinero(cartera.total.costeMedioReserva, moneda)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* MI CARTERA */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b p-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">MI CARTERA</span>
                <Badge variant="outline" className="ml-auto">
                  Ordenada por rentabilidad operativa real
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 font-medium">Propiedad</th>
                      <th className="p-3 font-medium text-right">Ingresos</th>
                      <th className="p-3 font-medium text-right">Gastos</th>
                      <th className="p-3 font-medium text-right">Neto</th>
                      <th className="p-3 font-medium text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartera.propiedades.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          Sin propiedades todavía. Crea tu primera propiedad para ver su rentabilidad.
                        </td>
                      </tr>
                    )}
                    {cartera.propiedades.map((f) => (
                      <tr
                        key={f.propertyId}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        onClick={() => setDetalle(detalle?.propertyId === f.propertyId ? null : f)}
                      >
                        <td className="p-3">
                          <span className="font-medium">{f.nombre}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{f.reservas} reservas</span>
                          {f.otrasMonedas.length > 0 && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {f.otrasMonedas.join(', ')} aparte
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium">{fmtDinero(f.ingresos, f.moneda)}</td>
                        <td className="p-3 text-right text-red-600">-{fmtDinero(f.gastos, f.moneda)}</td>
                        <td className="p-3 text-right font-semibold">
                          {fmtDinero(f.rentabilidadOperativaReal, f.moneda)}
                        </td>
                        <td className={`p-3 text-right font-bold ${colorMargen(f.margenPct)}`}>
                          {fmtMargen(f.margenPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {cartera.propiedades.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="p-3">Total cartera</td>
                        <td className="p-3 text-right">{fmtDinero(cartera.total.ingresos, moneda)}</td>
                        <td className="p-3 text-right text-red-600">
                          -{fmtDinero(cartera.total.gastos, moneda)}
                        </td>
                        <td className="p-3 text-right">
                          {fmtDinero(cartera.total.rentabilidadOperativaReal, moneda)}
                        </td>
                        <td className={`p-3 text-right ${colorMargen(cartera.total.margenPct)}`}>
                          {fmtMargen(cartera.total.margenPct)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ¿Dónde se está yendo el dinero? */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b p-3">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">¿Dónde se está yendo el dinero?</span>
              </div>
              <div className="p-3 space-y-2">
                {cartera.desgloseCostes.every((c) => c.importe <= 0) && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Sin costes registrados en el período. Los gastos del ERP imputados a reservas
                    aparecerán aquí por categoría.
                  </p>
                )}
                {cartera.desgloseCostes
                  .filter((c) => c.importe > 0)
                  .map((c) => {
                    const max = cartera.desgloseCostes[0]?.importe || 1;
                    return (
                      <div key={c.categoria} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{c.etiqueta}</span>
                          <span className="text-right">
                            {fmtDinero(c.importe, moneda)}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {c.pctGastos.toFixed(0)}% del gasto · {c.propiedades}{' '}
                              {c.propiedades === 1 ? 'propiedad' : 'propiedades'}
                            </span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-red-400/70"
                            style={{ width: `${Math.max(2, (c.importe / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Detalle por propiedad: el «por qué» de su fila */}
          {detalle && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{detalle.nombre}</span>
                  <Badge variant="outline" className="ml-auto">
                    Margen {fmtMargen(detalle.margenPct)}
                  </Badge>
                </div>
                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Ingresos brutos</p>
                    <p className="font-semibold">{fmtDinero(detalle.ingresos, detalle.moneda)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ingresos netos</p>
                    <p className="font-semibold">{fmtDinero(detalle.ingresosNetos, detalle.moneda)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Costes operativos</p>
                    <p className="font-semibold text-red-600">
                      -{fmtDinero(detalle.costesOperativos, detalle.moneda)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rentabilidad operativa real</p>
                    <p className={`font-bold ${colorMargen(detalle.margenPct)}`}>
                      {fmtDinero(detalle.rentabilidadOperativaReal, detalle.moneda)}
                    </p>
                  </div>
                </div>
                {detalle.categorias.length > 0 && (
                  <div className="space-y-1 text-sm">
                    {detalle.categorias.map((c) => (
                      <div key={c.categoria} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{c.etiqueta}</span>
                        <span className="font-medium">
                          {fmtDinero(c.importe, detalle.moneda)}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.pctIngresos.toFixed(0)}% de sus ingresos
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
