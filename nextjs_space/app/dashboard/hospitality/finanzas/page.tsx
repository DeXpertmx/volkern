'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  BadgeEuro,
  Banknote,
  Download,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { formatearImporte } from '@/lib/moneda';

// ─── Tipos de la API ────────────────────────────────────────────────────────

interface Totales {
  reservas: number;
  reservasConVenta: number;
  noches: number;
  bruto: number;
  desglose: { alojamiento: number; limpieza: number; extra: number; otro: number };
  comisionOta: number;
  comisionPasarela: number;
  comisiones: number;
  otrosGastos: number;
  neto: number;
  margenPct: number;
  cobrado: number;
  pendiente: number;
  reembolsado: number;
  ticketMedio: number;
}

interface Grupo {
  clave: string;
  etiqueta: string;
  totales: Totales;
}

interface FilaReserva {
  id: string;
  channel: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  noches: number;
  propertyNombre: string | null;
  unidadNombre: string | null;
  huesped: string | null;
  moneda: string;
  esVenta: boolean;
  bruto: number;
  desglose: { alojamiento: number; limpieza: number; extra: number; otro: number };
  comisionOta: number;
  comisionPasarela: number;
  otrosGastos: number;
  neto: number;
  margenPct: number;
  cobrado: number;
  pendiente: number;
  reembolsado: number;
  estadoCobro: string;
}

interface LineaReserva {
  id: string;
  tipo: string;
  concepto: string;
  cantidad: number;
  importeUnitario: number;
  importeTotal: number;
  moneda: string;
}

interface Pago {
  id: string;
  importe: number;
  moneda: string;
  metodo: string;
  estado: string;
  fechaPago: string | null;
  notas: string | null;
}

interface RespuestaFinanzas {
  rango: { desde: string; hasta: string };
  totales: Totales;
  porCanal: Grupo[];
  porPropiedad: Grupo[];
  estadosCobro: Record<string, number>;
  reservas: FilaReserva[];
  propiedades: Array<{ id: string; nombre: string }>;
  moneda: string;
}

const ESTADO_COBRO_BADGE: Record<string, string> = {
  pagado: 'bg-emerald-100 text-emerald-700',
  parcial: 'bg-amber-100 text-amber-700',
  pendiente: 'bg-rose-100 text-rose-700',
  sobrepagado: 'bg-blue-100 text-blue-700',
  reembolsado: 'bg-slate-200 text-slate-700',
};

const TIPOS_LINEA = [
  { value: 'alojamiento', label: 'Alojamiento' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'extra', label: 'Extra' },
  { value: 'otro', label: 'Otro' },
];

const METODOS_PAGO = [
  { value: 'manual', label: 'Manual' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'otro', label: 'Otro' },
];

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function primerDiaDelMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Delegado en el módulo compartido: una sola forma de escribir dinero en el módulo. */
function importe(valor: number, moneda: string): string {
  return formatearImporte(valor, moneda, 2);
}

function fecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function HospitalityFinanzasPage() {
  const [datos, setDatos] = useState<RespuestaFinanzas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [propertyId, setPropertyId] = useState('todas');
  const [canal, setCanal] = useState('');

  const [ficha, setFicha] = useState<FilaReserva | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (propertyId !== 'todas') params.set('propertyId', propertyId);
      if (canal.trim()) params.set('canal', canal.trim());
      const res = await fetch(`/api/hospitality/finanzas?${params.toString()}`);
      if (!res.ok) throw new Error('No se pudieron cargar las finanzas');
      setDatos(await res.json());
    } catch (e) {
      console.error(e);
      setError('Error al cargar las finanzas del período.');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, propertyId, canal]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Sin divisa no se inventa ninguna: si la API no la informa, los importes salen
  // sin símbolo en lugar de con uno que nadie eligió.
  const moneda = datos?.moneda || '';
  const resumen = datos?.totales;

  const totalReservas = useMemo(
    () => (datos?.reservas || []).filter((r) => r.esVenta).length,
    [datos]
  );

  const exportar = () => {
    const params = new URLSearchParams({ desde, hasta, formato: 'csv' });
    if (propertyId !== 'todas') params.set('propertyId', propertyId);
    if (canal.trim()) params.set('canal', canal.trim());
    window.open(`/api/hospitality/finanzas?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cobros, comisiones y rentabilidad por reserva. Los gastos, impuestos y la facturación
            viven en el ERP, no se duplican aquí.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Actualizar</span>
          </Button>
          <AccionHospitality capacidad="finanzas.exportar">
          <Button variant="outline" size="sm" onClick={exportar} disabled={!datos}>
            <Download className="h-4 w-4" />
            <span className="ml-2">Exportar CSV</span>
          </Button>
          </AccionHospitality>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {(datos?.propiedades || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="canal" className="text-xs">Canal</Label>
              <Input
                id="canal"
                placeholder="Airbnb, Booking..."
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={cargar}>
              Reintentar
            </Button>
          </div>
        </div>
      )}

      {cargando && !datos && (
        <div className="flex items-center justify-center min-h-[240px]">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      )}

      {datos && resumen && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Ingreso bruto</p>
                  <BadgeEuro className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-1">{importe(resumen.bruto, moneda)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {resumen.reservasConVenta} reservas · {resumen.noches} noches
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Comisiones</p>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-1">-{importe(resumen.comisiones, moneda)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  OTA {importe(resumen.comisionOta, moneda)} · pasarela{' '}
                  {importe(resumen.comisionPasarela, moneda)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Ingreso neto</p>
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold mt-1">{importe(resumen.neto, moneda)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Margen {resumen.margenPct} % · otros gastos {importe(resumen.otrosGastos, moneda)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Cobrado</p>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-1">{importe(resumen.cobrado, moneda)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pendiente {importe(resumen.pendiente, moneda)}
                  {resumen.reembolsado > 0 && ` · reembolsado ${importe(resumen.reembolsado, moneda)}`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Estado de cobro y desglose por tipo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estado de cobro</CardTitle>
                <CardDescription>Cuántas reservas hay en cada situación</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(datos.estadosCobro).map(([estado, cantidad]) => (
                  <div key={estado} className="flex items-center justify-between text-sm">
                    <Badge className={`${ESTADO_COBRO_BADGE[estado] || 'bg-slate-100 text-slate-700'} border-0`}>
                      {estado}
                    </Badge>
                    <span className="font-medium">{cantidad}</span>
                  </div>
                ))}
                {totalReservas === 0 && (
                  <p className="text-sm text-muted-foreground">Sin reservas en el período.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Composición del ingreso</CardTitle>
                <CardDescription>De qué se compone lo vendido</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(['alojamiento', 'limpieza', 'extra', 'otro'] as const).map((clave) => (
                  <div key={clave} className="flex items-center justify-between">
                    <span className="capitalize text-muted-foreground">{clave}</span>
                    <span className="font-medium">{importe(resumen.desglose[clave], moneda)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-medium">Ingreso bruto</span>
                  <span className="font-bold">{importe(resumen.bruto, moneda)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Ticket medio</span>
                  <span>{importe(resumen.ticketMedio, moneda)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Por canal y por propiedad */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por canal</CardTitle>
                <CardDescription>Ingresos y neto de cada canal</CardDescription>
              </CardHeader>
              <CardContent>
                {datos.porCanal.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-2 font-medium">Canal</th>
                        <th className="pb-2 font-medium text-right">Reservas</th>
                        <th className="pb-2 font-medium text-right">Bruto</th>
                        <th className="pb-2 font-medium text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.porCanal.map((grupo) => (
                        <tr key={grupo.clave} className="border-b last:border-0">
                          <td className="py-2">{grupo.etiqueta}</td>
                          <td className="py-2 text-right">{grupo.totales.reservasConVenta}</td>
                          <td className="py-2 text-right">{importe(grupo.totales.bruto, moneda)}</td>
                          <td className="py-2 text-right font-medium">{importe(grupo.totales.neto, moneda)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por propiedad</CardTitle>
                <CardDescription>Cuál deja más dinero, no solo cuál vende más</CardDescription>
              </CardHeader>
              <CardContent>
                {datos.porPropiedad.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-2 font-medium">Propiedad</th>
                        <th className="pb-2 font-medium text-right">Bruto</th>
                        <th className="pb-2 font-medium text-right">Neto</th>
                        <th className="pb-2 font-medium text-right">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.porPropiedad.map((grupo) => (
                        <tr key={grupo.clave} className="border-b last:border-0">
                          <td className="py-2">{grupo.etiqueta}</td>
                          <td className="py-2 text-right">{importe(grupo.totales.bruto, moneda)}</td>
                          <td className="py-2 text-right font-medium">{importe(grupo.totales.neto, moneda)}</td>
                          <td className="py-2 text-right">{grupo.totales.margenPct} %</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Reservas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rentabilidad por reserva</CardTitle>
              <CardDescription>
                {datos.reservas.length} reservas entre el {fecha(datos.rango.desde)} y el{' '}
                {fecha(datos.rango.hasta)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {datos.reservas.length === 0 ? (
                <div className="text-center py-10">
                  <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground mt-3">
                    No hay reservas en este período. Prueba a ampliar el rango de fechas.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="p-2 font-medium">Huésped</th>
                        <th className="p-2 font-medium">Canal</th>
                        <th className="p-2 font-medium">Estancia</th>
                        <th className="p-2 font-medium text-right">Bruto</th>
                        <th className="p-2 font-medium text-right">Comisiones</th>
                        <th className="p-2 font-medium text-right">Neto</th>
                        <th className="p-2 font-medium text-right">Cobrado</th>
                        <th className="p-2 font-medium">Cobro</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {datos.reservas.map((reserva) => (
                        <tr key={reserva.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-2">
                            <p className="font-medium">{reserva.huesped || 'Huésped'}</p>
                            <p className="text-xs text-muted-foreground">
                              {reserva.unidadNombre || reserva.propertyNombre || '—'}
                            </p>
                          </td>
                          <td className="p-2">{reserva.channel}</td>
                          <td className="p-2 whitespace-nowrap">
                            {fecha(reserva.checkIn)} → {fecha(reserva.checkOut)}
                            <span className="text-xs text-muted-foreground ml-1">({reserva.noches}n)</span>
                          </td>
                          <td className="p-2 text-right">{importe(reserva.bruto, reserva.moneda)}</td>
                          <td className="p-2 text-right text-rose-600">
                            {reserva.comisionOta + reserva.comisionPasarela > 0
                              ? `-${importe(reserva.comisionOta + reserva.comisionPasarela, reserva.moneda)}`
                              : '—'}
                          </td>
                          <td className="p-2 text-right font-medium">{importe(reserva.neto, reserva.moneda)}</td>
                          <td className="p-2 text-right">{importe(reserva.cobrado, reserva.moneda)}</td>
                          <td className="p-2">
                            {reserva.esVenta ? (
                              <Badge
                                className={`${ESTADO_COBRO_BADGE[reserva.estadoCobro] || 'bg-slate-100 text-slate-700'} border-0`}
                              >
                                {reserva.estadoCobro}
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600 border-0">{reserva.estado}</Badge>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setFicha(reserva)}>
                              Ficha
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enlace al ERP */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Gastos, impuestos y facturación</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Hospitality solo informa de la reserva. El gasto real y la factura legal se
                  llevan en el ERP, con una sola contabilidad.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/finanzas">
                    Ir a Finanzas del ERP <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/finanzas/contabilidad/impuestos">
                    Impuestos <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {ficha && (
        <FichaReservaDialog
          reserva={ficha}
          onClose={() => setFicha(null)}
          onCambio={() => {
            setFicha(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

// ─── Ficha financiera de una reserva ────────────────────────────────────────

function FichaReservaDialog({
  reserva,
  onClose,
  onCambio,
}: {
  reserva: FilaReserva;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [lineas, setLineas] = useState<LineaReserva[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [nuevaLinea, setNuevaLinea] = useState({
    tipo: 'extra',
    concepto: '',
    cantidad: '1',
    importeUnitario: '',
  });
  const [nuevoPago, setNuevoPago] = useState({
    importe: '',
    metodo: 'manual',
    estado: 'pagado',
    referenciaExterna: '',
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resLineas, resPagos] = await Promise.all([
        fetch(`/api/hospitality/reservations/${reserva.id}/items`),
        fetch(`/api/hospitality/reservations/${reserva.id}/payments`),
      ]);
      if (resLineas.ok) setLineas((await resLineas.json()).items || []);
      if (resPagos.ok) setPagos((await resPagos.json()).pagos || []);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cargar la ficha de la reserva');
    } finally {
      setCargando(false);
    }
  }, [reserva.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalLineas = lineas.reduce((t, l) => t + l.importeTotal, 0);
  const cobrado = pagos.reduce((t, p) => {
    if (p.estado === 'pagado' || p.estado === 'parcial') return t + p.importe;
    if (p.estado === 'reembolsado') return t - Math.abs(p.importe);
    return t;
  }, 0);

  const agregarLinea = async () => {
    if (!nuevaLinea.concepto.trim() || !nuevaLinea.importeUnitario) {
      toast.error('Indica concepto e importe unitario');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/hospitality/reservations/${reserva.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: nuevaLinea.tipo,
          concepto: nuevaLinea.concepto.trim(),
          cantidad: Number(nuevaLinea.cantidad) || 1,
          importeUnitario: Number(nuevaLinea.importeUnitario),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error al añadir la línea');
      toast.success('Línea añadida');
      setNuevaLinea({ tipo: 'extra', concepto: '', cantidad: '1', importeUnitario: '' });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al añadir la línea');
    } finally {
      setGuardando(false);
    }
  };

  const borrarLinea = async (itemId: string) => {
    setGuardando(true);
    try {
      const res = await fetch(`/api/hospitality/reservations/${reserva.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar la línea');
      toast.success('Línea eliminada');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar la línea');
    } finally {
      setGuardando(false);
    }
  };

  const registrarPago = async () => {
    if (!nuevoPago.importe) {
      toast.error('Indica el importe del pago');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/hospitality/reservations/${reserva.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importe: Number(nuevoPago.importe),
          metodo: nuevoPago.metodo,
          estado: nuevoPago.estado,
          referenciaExterna: nuevoPago.referenciaExterna || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error al registrar el pago');
      toast.success('Pago registrado');
      setNuevoPago({ importe: '', metodo: 'manual', estado: 'pagado', referenciaExterna: '' });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstadoPago = async (pago: Pago, estado: string) => {
    setGuardando(true);
    try {
      const res = await fetch(
        `/api/hospitality/reservations/${reserva.id}/payments/${pago.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || 'Error al actualizar el pago');
      toast.success(`Pago marcado como ${estado}`);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const borrarPago = async (pago: Pago) => {
    setGuardando(true);
    try {
      const res = await fetch(
        `/api/hospitality/reservations/${reserva.id}/payments/${pago.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Error al eliminar el pago');
      toast.success('Pago eliminado');
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar el pago');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha financiera</DialogTitle>
          <DialogDescription>
            {reserva.huesped || 'Huésped'} · {reserva.channel} · {fecha(reserva.checkIn)} →{' '}
            {fecha(reserva.checkOut)}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-xs">Bruto (líneas)</p>
                <p className="font-bold">{importe(totalLineas, reserva.moneda)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-xs">Comisión OTA</p>
                <p className="font-bold">-{importe(reserva.comisionOta, reserva.moneda)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-xs">Cobrado</p>
                <p className="font-bold">{importe(cobrado, reserva.moneda)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-xs">Pendiente</p>
                <p className="font-bold">{importe(Math.max(0, totalLineas - cobrado), reserva.moneda)}</p>
              </div>
            </div>

            {/* Líneas */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Desglose de la reserva</h3>
              {lineas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Esta reserva aún no tiene desglose. Añade alojamiento, limpieza o extras para
                  calcular su rentabilidad.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 font-medium">Concepto</th>
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium text-right">Cant.</th>
                      <th className="pb-2 font-medium text-right">Unitario</th>
                      <th className="pb-2 font-medium text-right">Total</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((linea) => (
                      <tr key={linea.id} className="border-b last:border-0">
                        <td className="py-2">{linea.concepto}</td>
                        <td className="py-2 capitalize text-muted-foreground">{linea.tipo}</td>
                        <td className="py-2 text-right">{linea.cantidad}</td>
                        <td className="py-2 text-right">{importe(linea.importeUnitario, linea.moneda)}</td>
                        <td className="py-2 text-right font-medium">{importe(linea.importeTotal, linea.moneda)}</td>
                        <td className="py-2 text-right">
                          <AccionHospitality capacidad="finanzas.gestionar">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={guardando}
                            onClick={() => borrarLinea(linea.id)}
                            title="Eliminar línea"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          </AccionHospitality>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 items-end">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={nuevaLinea.tipo}
                    onValueChange={(v) => setNuevaLinea((l) => ({ ...l, tipo: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_LINEA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Concepto</Label>
                  <Input
                    value={nuevaLinea.concepto}
                    onChange={(e) => setNuevaLinea((l) => ({ ...l, concepto: e.target.value }))}
                    placeholder="Limpieza final"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min="1"
                    value={nuevaLinea.cantidad}
                    onChange={(e) => setNuevaLinea((l) => ({ ...l, cantidad: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Importe unitario</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={nuevaLinea.importeUnitario}
                    onChange={(e) => setNuevaLinea((l) => ({ ...l, importeUnitario: e.target.value }))}
                    placeholder="60"
                  />
                </div>
                <AccionHospitality capacidad="finanzas.gestionar">
                  <Button onClick={agregarLinea} disabled={guardando}>
                    <Plus className="h-4 w-4 mr-1" /> Añadir
                  </Button>
                </AccionHospitality>
              </div>
            </div>

            {/* Pagos */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Pagos</h3>
              {pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin pagos registrados: la reserva figura como pendiente de cobro.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 font-medium">Importe</th>
                      <th className="pb-2 font-medium">Método</th>
                      <th className="pb-2 font-medium">Estado</th>
                      <th className="pb-2 font-medium">Fecha</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((pago) => (
                      <tr key={pago.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{importe(pago.importe, pago.moneda)}</td>
                        <td className="py-2 capitalize text-muted-foreground">{pago.metodo}</td>
                        <td className="py-2">
                          <Badge
                            className={`${ESTADO_COBRO_BADGE[pago.estado] || 'bg-slate-100 text-slate-700'} border-0`}
                          >
                            {pago.estado}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {pago.fechaPago ? fecha(pago.fechaPago) : '—'}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {pago.estado !== 'reembolsado' && (
                            <AccionHospitality capacidad="finanzas.gestionar">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={guardando}
                              onClick={() => cambiarEstadoPago(pago, 'reembolsado')}
                              title="Marcar como reembolsado"
                            >
                              <Banknote className="h-4 w-4 text-amber-600" />
                            </Button>
                            </AccionHospitality>
                          )}
                          <AccionHospitality capacidad="finanzas.gestionar">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={guardando}
                            onClick={() => borrarPago(pago)}
                            title="Eliminar pago"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          </AccionHospitality>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 items-end">
                <div>
                  <Label className="text-xs">Importe</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={nuevoPago.importe}
                    onChange={(e) => setNuevoPago((p) => ({ ...p, importe: e.target.value }))}
                    placeholder={String(Math.max(0, totalLineas - cobrado).toFixed(2))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Método</Label>
                  <Select
                    value={nuevoPago.metodo}
                    onValueChange={(v) => setNuevoPago((p) => ({ ...p, metodo: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METODOS_PAGO.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Referencia</Label>
                  <Input
                    value={nuevoPago.referenciaExterna}
                    onChange={(e) => setNuevoPago((p) => ({ ...p, referenciaExterna: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <AccionHospitality capacidad="finanzas.gestionar">
                  <Button onClick={registrarPago} disabled={guardando}>
                    <Plus className="h-4 w-4 mr-1" /> Registrar pago
                  </Button>
                </AccionHospitality>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCambio} disabled={guardando}>
            Cerrar y recalcular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
