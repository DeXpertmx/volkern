'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatearImporte } from '@/lib/hospitality/moneda';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Operacion {
  nochesDisponibles: number;
  nochesOcupadas: number;
  ocupacion: number;
  unidades: number;
  reservas: number;
  reservasConVenta: number;
  llegadas: number;
  salidas: number;
  cancelaciones: number;
  noShows: number;
  estanciaMedia: number;
  adr: number | null;
  revpar: number | null;
  ingresos: number;
  diario: Array<{ fecha: string; ocupadas: number; ocupacion: number }>;
}

interface CanalVentas {
  canal: string;
  reservas: number;
  noches: number;
  ingresos: number;
  neto: number;
  ticketMedio: number;
  pctReservas: number;
  pctIngresos: number;
  directo: boolean;
}

interface Ventas {
  canales: CanalVentas[];
  directas: { reservas: number; ingresos: number; pctReservas: number; pctIngresos: number };
  antelacionMedia: number | null;
  masAnticipada: number | null;
  masTardia: number | null;
}

interface Totales {
  bruto: number;
  comisiones: number;
  comisionOta: number;
  comisionPasarela: number;
  otrosGastos: number;
  neto: number;
  margenPct: number;
  cobrado: number;
  pendiente: number;
  reembolsado: number;
  reservasConVenta: number;
  ticketMedio: number;
}

interface Grupo {
  clave: string;
  etiqueta: string;
  totales: Totales;
}

interface PropiedadReporte {
  propertyId: string;
  nombre: string;
  unidades: number;
  nochesDisponibles: number;
  nochesOcupadas: number;
  ocupacion: number;
  reservas: number;
  ingresos: number;
  neto: number;
  margenPct: number;
  adr: number | null;
}

interface Respuesta {
  rango: { desde: string; hasta: string };
  operacion: Operacion;
  ventas: Ventas;
  financiero: { totales: Totales; porCanal: Grupo[] };
  propiedades: PropiedadReporte[];
  operaciones: { limpieza: Record<string, number>; incidencias: Record<string, number> };
  moneda: string;
}

const SECCIONES = [
  { id: 'operacion', label: 'Operación' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'propiedades', label: 'Propiedades' },
] as const;

type Seccion = (typeof SECCIONES)[number]['id'];

function primerDiaDelMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Delegado en el módulo compartido: una sola forma de escribir dinero en el módulo. */
function importe(valor: number | null, moneda: string): string {
  return formatearImporte(valor, moneda, 2);
}

function pct(valor: number): string {
  return `${(valor * 100).toFixed(1).replace('.', ',')} %`;
}

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
}

export default function HospitalityReportesPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<Seccion>('operacion');
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [propertyId, setPropertyId] = useState('todas');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (propertyId !== 'todas') params.set('propertyId', propertyId);
      const res = await fetch(`/api/hospitality/reportes?${params.toString()}`);
      if (!res.ok) throw new Error('No se pudieron cargar los reportes');
      setDatos(await res.json());
    } catch (e) {
      console.error(e);
      setError('Error al cargar los reportes del período.');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, propertyId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const moneda = datos?.moneda || 'EUR';

  const exportar = () => {
    const params = new URLSearchParams({
      desde,
      hasta,
      formato: 'csv',
      seccion: seccion === 'ventas' ? 'canales' : 'propiedades',
    });
    if (propertyId !== 'todas') params.set('propertyId', propertyId);
    window.open(`/api/hospitality/reportes?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Operación, ventas, finanzas y resultado por propiedad, con exportación a CSV.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Actualizar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!datos}>
            <Download className="h-4 w-4" />
            <span className="ml-2">Exportar</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="desde" className="text-xs">Desde</Label>
              <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hasta" className="text-xs">Hasta</Label>
              <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Propiedad</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {(datos?.propiedades || []).map((p) => (
                    <SelectItem key={p.propertyId} value={p.propertyId}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {SECCIONES.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={seccion === s.id ? 'default' : 'outline'}
            onClick={() => setSeccion(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={cargar}>Reintentar</Button>
          </div>
        </div>
      )}

      {cargando && !datos && (
        <div className="flex items-center justify-center min-h-[240px]">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      )}

      {datos && (
        <>
          {seccion === 'operacion' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Kpi titulo="Ocupación" valor={pct(datos.operacion.ocupacion)} />
                <Kpi titulo="ADR" valor={importe(datos.operacion.adr, moneda)} />
                <Kpi titulo="RevPAR" valor={importe(datos.operacion.revpar, moneda)} />
                <Kpi titulo="Estancia media" valor={`${datos.operacion.estanciaMedia} noches`} />
                <Kpi titulo="Cancelaciones" valor={String(datos.operacion.cancelaciones)} />
                <Kpi titulo="No-shows" valor={String(datos.operacion.noShows)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Ocupación diaria</CardTitle>
                    <CardDescription>
                      {datos.operacion.nochesOcupadas} de {datos.operacion.nochesDisponibles} noches
                      disponibles · {datos.operacion.unidades} unidades
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {datos.operacion.diario.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin días en el rango.</p>
                    ) : (
                      <div className="flex items-end gap-1 h-32">
                        {datos.operacion.diario.map((dia) => (
                          <div
                            key={dia.fecha}
                            className="flex-1 bg-purple-500/70 rounded-sm min-h-[2px] hover:bg-purple-600"
                            style={{ height: `${Math.max(2, dia.ocupacion * 100)}%` }}
                            title={`${dia.fecha}: ${dia.ocupadas} ocupadas (${pct(dia.ocupacion)})`}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Operaciones</CardTitle>
                    <CardDescription>Limpiezas e incidencias del período</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Limpieza</p>
                      {Object.keys(datos.operaciones.limpieza).length === 0 ? (
                        <p className="text-muted-foreground">Sin tareas registradas.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(datos.operaciones.limpieza).map(([estado, n]) => (
                            <Badge key={estado} variant="secondary">{estado}: {n}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Mantenimiento</p>
                      {Object.keys(datos.operaciones.incidencias).length === 0 ? (
                        <p className="text-muted-foreground">Sin incidencias registradas.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(datos.operaciones.incidencias).map(([estado, n]) => (
                            <Badge key={estado} variant="secondary">{estado}: {n}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="border-t pt-3 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Llegadas</span>
                        <span className="font-medium">{datos.operacion.llegadas}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Salidas</span>
                        <span className="font-medium">{datos.operacion.salidas}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reservas</span>
                        <span className="font-medium">{datos.operacion.reservas}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {seccion === 'ventas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi titulo="Reservas con venta" valor={String(datos.operacion.reservasConVenta)} />
                <Kpi titulo="Reserva directa" valor={`${datos.ventas.directas.pctReservas} %`} />
                <Kpi
                  titulo="Antelación media"
                  valor={datos.ventas.antelacionMedia === null ? '—' : `${datos.ventas.antelacionMedia} días`}
                />
                <Kpi titulo="Ticket medio" valor={importe(datos.financiero.totales.ticketMedio, moneda)} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reservas e ingresos por canal</CardTitle>
                  <CardDescription>
                    {datos.ventas.directas.reservas} reservas directas por{' '}
                    {importe(datos.ventas.directas.ingresos, moneda)} ({datos.ventas.directas.pctIngresos} %
                    del ingreso)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {datos.ventas.canales.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="p-2 font-medium">Canal</th>
                          <th className="p-2 font-medium text-right">Reservas</th>
                          <th className="p-2 font-medium text-right">Noches</th>
                          <th className="p-2 font-medium text-right">Ingresos</th>
                          <th className="p-2 font-medium text-right">Neto</th>
                          <th className="p-2 font-medium text-right">% reservas</th>
                          <th className="p-2 font-medium text-right">% ingresos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.ventas.canales.map((canal) => (
                          <tr key={canal.canal} className="border-b last:border-0">
                            <td className="p-2">
                              <span className="flex items-center gap-2">
                                {canal.canal}
                                {canal.directo && (
                                  <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px]">
                                    directa
                                  </Badge>
                                )}
                              </span>
                            </td>
                            <td className="p-2 text-right">{canal.reservas}</td>
                            <td className="p-2 text-right">{canal.noches}</td>
                            <td className="p-2 text-right">{importe(canal.ingresos, moneda)}</td>
                            <td className="p-2 text-right font-medium">{importe(canal.neto, moneda)}</td>
                            <td className="p-2 text-right">{canal.pctReservas} %</td>
                            <td className="p-2 text-right">{canal.pctIngresos} %</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {seccion === 'finanzas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Kpi titulo="Ingreso bruto" valor={importe(datos.financiero.totales.bruto, moneda)} />
                <Kpi titulo="Comisiones" valor={importe(datos.financiero.totales.comisiones, moneda)} />
                <Kpi titulo="Ingreso neto" valor={importe(datos.financiero.totales.neto, moneda)} />
                <Kpi titulo="Margen" valor={`${datos.financiero.totales.margenPct} %`} />
                <Kpi titulo="Cobrado" valor={importe(datos.financiero.totales.cobrado, moneda)} />
                <Kpi titulo="Pendiente" valor={importe(datos.financiero.totales.pendiente, moneda)} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Finanzas por canal</CardTitle>
                  <CardDescription>
                    El detalle por reserva está en la sección Finanzas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {datos.financiero.porCanal.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="p-2 font-medium">Canal</th>
                          <th className="p-2 font-medium text-right">Bruto</th>
                          <th className="p-2 font-medium text-right">Comisiones</th>
                          <th className="p-2 font-medium text-right">Neto</th>
                          <th className="p-2 font-medium text-right">Margen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.financiero.porCanal.map((grupo) => (
                          <tr key={grupo.clave} className="border-b last:border-0">
                            <td className="p-2">{grupo.etiqueta}</td>
                            <td className="p-2 text-right">{importe(grupo.totales.bruto, moneda)}</td>
                            <td className="p-2 text-right text-rose-600">
                              -{importe(grupo.totales.comisiones, moneda)}
                            </td>
                            <td className="p-2 text-right font-medium">{importe(grupo.totales.neto, moneda)}</td>
                            <td className="p-2 text-right">{grupo.totales.margenPct} %</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/hospitality/finanzas">
                      Ver rentabilidad por reserva <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {seccion === 'propiedades' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultado por propiedad</CardTitle>
                <CardDescription>
                  Ordenado por ingreso neto: la pregunta es cuál está dejando más dinero
                </CardDescription>
              </CardHeader>
              <CardContent>
                {datos.propiedades.length === 0 ? (
                  <div className="text-center py-10">
                    <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground mt-3">
                      No hay propiedades con datos en este período.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="p-2 font-medium">Propiedad</th>
                          <th className="p-2 font-medium text-right">Unidades</th>
                          <th className="p-2 font-medium text-right">Ocupación</th>
                          <th className="p-2 font-medium text-right">Reservas</th>
                          <th className="p-2 font-medium text-right">Ingresos</th>
                          <th className="p-2 font-medium text-right">Neto</th>
                          <th className="p-2 font-medium text-right">Margen</th>
                          <th className="p-2 font-medium text-right">ADR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.propiedades.map((propiedad) => (
                          <tr key={propiedad.propertyId} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="p-2 font-medium">{propiedad.nombre}</td>
                            <td className="p-2 text-right">{propiedad.unidades}</td>
                            <td className="p-2 text-right">
                              {pct(propiedad.ocupacion)}
                              <span className="text-xs text-muted-foreground ml-1">
                                ({propiedad.nochesOcupadas}/{propiedad.nochesDisponibles})
                              </span>
                            </td>
                            <td className="p-2 text-right">{propiedad.reservas}</td>
                            <td className="p-2 text-right">{importe(propiedad.ingresos, moneda)}</td>
                            <td className="p-2 text-right font-medium">{importe(propiedad.neto, moneda)}</td>
                            <td className="p-2 text-right">{propiedad.margenPct} %</td>
                            <td className="p-2 text-right">{importe(propiedad.adr, moneda)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Período {fecha(datos.rango.desde)} – {fecha(datos.rango.hasta)} · los indicadores se
            calculan sobre el mismo motor de disponibilidad que el planning.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-lg font-bold mt-1">{valor}</p>
      </CardContent>
    </Card>
  );
}
