'use client';

/**
 * Finanzas de hospitality (FASE 3.B del plan de Booking Engine + Payments).
 *
 * Por reserva: desglose (líneas), comisión OTA, bruto/neto/margen y cobro
 * (pagado/pendiente/parcial) con registro de pagos. Y vista de cobros por
 * estado y resumen por canal. Todo el cálculo lo hace el servidor con el
 * módulo puro; esta pantalla solo muestra y captura.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Banknote,
  Building2,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  Loader2,
  Percent,
  Plus,
  RefreshCcw,
  Search,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Linea {
  tipo: string;
  concepto: string;
  cantidad: number;
  importeUnitario: number;
  importeTotal: number;
}

interface Pago {
  id: string;
  importe: number;
  moneda: string;
  metodo: string;
  estado: string;
  referenciaExterna: string | null;
  fechaPago: string | null;
  notas: string | null;
}

interface GastoErp {
  id: string;
  descripcion: string;
  importe: number;
  moneda: string;
  categoria: string;
  proveedor: string | null;
  baseImponible: number | null;
  ivaPct: number | null;
  ivaCuota: number | null;
}

interface FilaReserva {
  id: string;
  externalBookingId: string;
  channel: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  unitNombre: string | null;
  propertyId: string;
  propertyNombre: string | null;
  huesped: string;
  moneda: string;
  /** Ingreso de alojamiento: NO incluye la penalización por no-show. */
  bruto: number;
  desglose: { alojamiento: number; limpieza: number; extra: number; otro: number; penalizacion: number };
  /** Cargo por no-show emitido en esta reserva (0 si no hay). */
  penalizacion: number;
  comisionOta: number;
  comisionPasarela: number;
  otrosGastos: number;
  neto: number;
  margenPct: number;
  cobrado: number;
  pendiente: number;
  estadoCobro: 'pendiente' | 'parcial' | 'pagado' | 'sobrepagado' | 'reembolsado';
  lineas: Linea[];
  pagos: Pago[];
  gastosErp: GastoErp[];
}

interface Resumen {
  porMoneda: Record<string, { bruto: number; penalizacion: number; comisionOta: number; neto: number; cobrado: number; pendiente: number; reservas: number }>;
  porCanal: Record<string, { bruto: number; neto: number; reservas: number }>;
  porEstadoCobro: Record<string, number>;
  total: number;
}

interface CuentaCobro {
  id: string;
  provider: string;
  stripeAccountId: string | null;
  estado: 'sin_conectar' | 'pendiente' | 'activo' | 'restringido';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  moneda: string;
  pais: string | null;
}

const ETIQUETA_COBRO: Record<FilaReserva['estadoCobro'], string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagado: 'Pagado',
  sobrepagado: 'Sobrepagado',
  reembolsado: 'Reembolsado',
};

const COLOR_COBRO: Record<FilaReserva['estadoCobro'], string> = {
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  parcial: 'bg-blue-100 text-blue-800 border-blue-200',
  pagado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  sobrepagado: 'bg-purple-100 text-purple-800 border-purple-200',
  reembolsado: 'bg-slate-100 text-slate-800 border-slate-200',
};

const TIPO_LINEA_LABEL: Record<string, string> = {
  alojamiento: 'Alojamiento',
  limpieza: 'Limpieza',
  extra: 'Extras',
  otro: 'Otros',
  penalizacion: 'Penalización',
};

const METODOS = ['transferencia', 'efectivo', 'stripe', 'manual', 'otro'];
const ESTADOS_PAGO = ['pagado', 'pendiente', 'parcial', 'reembolsado', 'fallido'];

const ETIQUETA_CUENTA: Record<CuentaCobro['estado'], string> = {
  sin_conectar: 'Sin conectar',
  pendiente: 'Onboarding pendiente',
  activo: 'Activa',
  restringido: 'Restringida',
};

const COLOR_CUENTA: Record<CuentaCobro['estado'], string> = {
  sin_conectar: 'bg-slate-100 text-slate-700 border-slate-200',
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  activo: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  restringido: 'bg-red-100 text-red-800 border-red-200',
};

function fmtDinero(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda || 'MXN', maximumFractionDigits: 2 }).format(valor || 0);
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export default function HospitalityFinanzas() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FilaReserva[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [properties, setProperties] = useState<{ id: string; nombre: string }[]>([]);
  const [propertyId, setPropertyId] = useState<string>('all');
  const [estadoCobro, setEstadoCobro] = useState<string>('all');
  const [q, setQ] = useState('');
  const [detalle, setDetalle] = useState<FilaReserva | null>(null);
  const [pagoForm, setPagoForm] = useState<{
    reservationId: string;
    huesped: string;
    importe: string;
    moneda: string;
    metodo: string;
    estado: string;
    referenciaExterna: string;
    notas: string;
  } | null>(null);
  const [pagoSaving, setPagoSaving] = useState(false);
  const [cuenta, setCuenta] = useState<CuentaCobro | null>(null);
  const [cuentaBusy, setCuentaBusy] = useState(false);
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (propertyId !== 'all') params.set('propertyId', propertyId);
      if (estadoCobro !== 'all') params.set('estadoCobro', estadoCobro);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/hospitality/finanzas?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar finanzas');
      setRows(data.reservas || []);
      setResumen(data.resumen || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar finanzas');
    } finally {
      setLoading(false);
    }
  }, [propertyId, estadoCobro, q]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/hospitality/properties');
        const data = await res.json();
        if (res.ok) setProperties((data.properties || []).map((p: any) => ({ id: p.id, nombre: p.nombre })));
      } catch {
        /* sin propiedades el filtro simplemente queda vacío */
      }
    })();
  }, []);

  useEffect(() => {
    load();
    // El filtro de búsqueda se aplica al pulsar Enter (form), no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, estadoCobro]);

  const monedaPrincipal = useMemo(() => {
    const monedas = Object.keys(resumen?.porMoneda || {});
    return monedas.length === 1 ? monedas[0] : null;
  }, [resumen]);

  const loadCuenta = useCallback(async () => {
    try {
      const res = await fetch('/api/hospitality/cuenta-cobro');
      const data = await res.json();
      if (res.ok) setCuenta(data.cuenta || null);
    } catch {
      /* sin cuenta de cobro la sección queda en su estado por defecto */
    }
  }, []);

  useEffect(() => {
    loadCuenta();
  }, [loadCuenta]);

  const conectarCuenta = async () => {
    setCuentaBusy(true);
    try {
      const res = await fetch('/api/hospitality/cuenta-cobro', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el onboarding');
      // El onboarding KYC ocurre en Stripe: redirigir a su formulario.
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al iniciar el onboarding');
      setCuentaBusy(false);
    }
  };

  const sincronizarCuenta = async () => {
    setCuentaBusy(true);
    try {
      const res = await fetch('/api/hospitality/cuenta-cobro', { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar la cuenta');
      setCuenta(data.cuenta);
      toast.success(`Estado de la cuenta: ${ETIQUETA_CUENTA[data.cuenta.estado as CuentaCobro['estado']] || data.cuenta.estado}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al sincronizar la cuenta');
    } finally {
      setCuentaBusy(false);
    }
  };

  const cobrarReserva = async (r: FilaReserva) => {
    setCobrandoId(r.id);
    try {
      const res = await fetch('/api/hospitality/finanzas/cobrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: r.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el cobro');
      toast.success('Cobro creado: redirigiendo a Stripe…');
      // El pago en la cuenta DEL TENANT se completa en el Checkout de Stripe.
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear el cobro');
      setCobrandoId(null);
    }
  };

  const registrarPago = async () => {
    if (!pagoForm) return;
    const importe = Number(pagoForm.importe);
    if (!Number.isFinite(importe) || importe <= 0) {
      toast.error('Indica un importe mayor que cero');
      return;
    }
    setPagoSaving(true);
    try {
      const res = await fetch('/api/hospitality/finanzas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: pagoForm.reservationId,
          importe,
          moneda: pagoForm.moneda || undefined,
          metodo: pagoForm.metodo,
          estado: pagoForm.estado,
          referenciaExterna: pagoForm.referenciaExterna || undefined,
          notas: pagoForm.notas || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago');
      toast.success(`Pago registrado · estado de la reserva: ${ETIQUETA_COBRO[data.estadoCobro as FilaReserva['estadoCobro']] || data.estadoCobro}`);
      setPagoForm(null);
      setDetalle(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al registrar el pago');
    } finally {
      setPagoSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cuenta de cobro Stripe Connect (el dinero de la reserva directa llega al tenant) */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Cuenta de cobro</span>
            {cuenta && (
              <Badge variant="outline" className={COLOR_CUENTA[cuenta.estado]}>
                {ETIQUETA_CUENTA[cuenta.estado]}
              </Badge>
            )}
          </div>
          {cuenta?.stripeAccountId && (
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">{cuenta.stripeAccountId}</span>
          )}
          <span className="text-xs text-muted-foreground hidden lg:inline">
            Los cobros con tarjeta se ingresan directamente en tu cuenta de Stripe.
          </span>
          <div className="ml-auto flex items-center gap-2">
            {(!cuenta || cuenta.estado === 'sin_conectar') && (
              <Button type="button" size="sm" onClick={conectarCuenta} disabled={cuentaBusy}>
                {cuentaBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1 h-4 w-4" />}
                Conectar con Stripe
              </Button>
            )}
            {cuenta && cuenta.estado !== 'sin_conectar' && cuenta.estado !== 'activo' && (
              <>
                <Button type="button" size="sm" variant="outline" onClick={conectarCuenta} disabled={cuentaBusy}>
                  <ExternalLink className="mr-1 h-4 w-4" /> Completar onboarding
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={sincronizarCuenta} disabled={cuentaBusy}>
                  {cuentaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Verificar
                </Button>
              </>
            )}
            {cuenta?.estado === 'activo' && (
              <Button type="button" size="sm" variant="outline" onClick={sincronizarCuenta} disabled={cuentaBusy}>
                {cuentaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Verificar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      {resumen && resumen.total > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(resumen.porMoneda).map(([moneda, m]) => (
            <Card key={moneda}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Resumen ({moneda})</span>
                  <Badge variant="outline">{m.reservas} reservas</Badge>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingreso bruto</span>
                    <span className="font-semibold">{fmtDinero(m.bruto, moneda)}</span>
                  </div>
                  {m.penalizacion > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Penalizaciones no-show</span>
                      <span className="text-emerald-600">+{fmtDinero(m.penalizacion, moneda)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comisiones OTA</span>
                    <span className="text-red-600">-{fmtDinero(m.comisionOta, moneda)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5">
                    <span className="font-medium">Ingreso neto</span>
                    <span className="font-bold">{fmtDinero(m.neto, moneda)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cobrado</span>
                    <span className="text-emerald-600">{fmtDinero(m.cobrado, moneda)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pendiente</span>
                    <span className="text-amber-600">{fmtDinero(m.pendiente, moneda)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CircleDollarSign className="h-4 w-4" /> Cobros
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(resumen.porEstadoCobro) as FilaReserva['estadoCobro'][]).map((k) => (
                  <Badge key={k} variant="outline" className={COLOR_COBRO[k]}>
                    {ETIQUETA_COBRO[k]}: {resumen.porEstadoCobro[k]}
                  </Badge>
                ))}
                {Object.keys(resumen.porEstadoCobro).length === 0 && (
                  <span className="text-xs text-muted-foreground">Sin reservas en el periodo</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" /> Por canal
              </div>
              <div className="space-y-1.5 text-sm">
                {Object.entries(resumen.porCanal)
                  .sort((a, b) => b[1].bruto - a[1].bruto)
                  .slice(0, 5)
                  .map(([canal, c]) => (
                    <div key={canal} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">{canal}</span>
                      <span className="font-medium shrink-0">
                        {fmtDinero(c.bruto, monedaPrincipal || 'MXN')}
                        {monedaPrincipal ? '' : ` ×${c.reservas}`}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar huésped o referencia…"
              className="pl-8 w-56"
            />
          </form>
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Propiedad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las propiedades</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estadoCobro} onValueChange={setEstadoCobro}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Estado de cobro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los cobros</SelectItem>
              {(Object.keys(ETIQUETA_COBRO) as FilaReserva['estadoCobro'][]).map((k) => (
                <SelectItem key={k} value={k}>{ETIQUETA_COBRO[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {/* Tabla de reservas */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando finanzas…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No hay reservas con los filtros actuales.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Reserva</th>
                    <th className="px-3 py-2 font-medium">Canal</th>
                    <th className="px-3 py-2 font-medium text-right">Bruto</th>
                    <th className="px-3 py-2 font-medium text-right">Comisión OTA</th>
                    <th className="px-3 py-2 font-medium text-right">Neto</th>
                    <th className="px-3 py-2 font-medium text-right">Margen</th>
                    <th className="px-3 py-2 font-medium text-right">Cobrado</th>
                    <th className="px-3 py-2 font-medium text-right">Pendiente</th>
                    <th className="px-3 py-2 font-medium">Cobro</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <button type="button" className="text-left hover:underline" onClick={() => setDetalle(r)}>
                          <div className="font-medium">{r.huesped}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.unitNombre || 'Sin unidad'} · {fmtFecha(r.checkIn)} → {fmtFecha(r.checkOut)}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.channel}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtDinero(r.bruto, r.moneda)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{r.comisionOta > 0 ? `-${fmtDinero(r.comisionOta, r.moneda)}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtDinero(r.neto, r.moneda)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`inline-flex items-center gap-0.5 text-xs ${r.margenPct >= 60 ? 'text-emerald-600' : r.margenPct >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                          <Percent className="h-3 w-3" />
                          {r.margenPct.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-600">{fmtDinero(r.cobrado, r.moneda)}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{fmtDinero(r.pendiente, r.moneda)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={COLOR_COBRO[r.estadoCobro]}>{ETIQUETA_COBRO[r.estadoCobro]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {cuenta?.estado === 'activo' && r.pendiente > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => cobrarReserva(r)}
                              disabled={cobrandoId === r.id}
                              title="Cobrar con tarjeta (Stripe): el dinero llega a tu cuenta"
                            >
                              {cobrandoId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                              Cobrar
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPagoForm({
                                reservationId: r.id,
                                huesped: r.huesped,
                                importe: r.pendiente > 0 ? String(r.pendiente) : '',
                                moneda: r.moneda,
                                metodo: 'transferencia',
                                estado: 'pagado',
                                referenciaExterna: '',
                                notas: '',
                              })
                            }
                          >
                            <Plus className="h-3.5 w-3.5" /> Pago
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle de la reserva */}
      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" /> {detalle.huesped} · {detalle.unitNombre || 'Sin unidad'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ingreso bruto</span>
                    <span className="font-semibold">{fmtDinero(detalle.bruto, detalle.moneda)}</span>
                  </div>
                  {detalle.lineas.length > 0 && (
                    <div className="ml-3 space-y-1 border-l pl-3 text-xs text-muted-foreground">
                      {detalle.lineas.map((l, i) => (
                        <div key={i} className="flex justify-between gap-3">
                          <span>{TIPO_LINEA_LABEL[l.tipo] || l.tipo}: {l.concepto} × {l.cantidad}</span>
                          <span>{fmtDinero(l.importeTotal, detalle.moneda)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* La penalización no es alojamiento: se suma aparte del bruto,
                      porque es un cargo de cancelación (la unidad no se ocupó). */}
                  {detalle.penalizacion > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Penalización por no-show</span>
                      <span className="text-emerald-600">+{fmtDinero(detalle.penalizacion, detalle.moneda)}</span>
                    </div>
                  )}
                  {detalle.comisionOta > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comisión OTA</span>
                      <span className="text-red-600">-{fmtDinero(detalle.comisionOta, detalle.moneda)}</span>
                    </div>
                  )}
                  {detalle.comisionPasarela > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comisión pasarela</span>
                      <span className="text-red-600">-{fmtDinero(detalle.comisionPasarela, detalle.moneda)}</span>
                    </div>
                  )}
                  {detalle.otrosGastos > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gastos imputados (ERP)</span>
                      <span className="text-red-600">-{fmtDinero(detalle.otrosGastos, detalle.moneda)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1.5">
                    <span className="font-medium">Ingreso neto</span>
                    <span className="font-bold">{fmtDinero(detalle.neto, detalle.moneda)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margen</span>
                    <span>{detalle.margenPct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cobrado / Pendiente</span>
                    <span>
                      <span className="text-emerald-600">{fmtDinero(detalle.cobrado, detalle.moneda)}</span>
                      {' / '}
                      <span className="text-amber-600">{fmtDinero(detalle.pendiente, detalle.moneda)}</span>
                    </span>
                  </div>
                </div>

                {detalle.gastosErp.length > 0 && (
                  <div>
                    <span className="font-medium">Gastos del ERP imputados ({detalle.gastosErp.length})</span>
                    <ul className="mt-1.5 space-y-1.5">
                      {detalle.gastosErp.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{g.descripcion}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {g.categoria}
                              {g.proveedor ? ` · ${g.proveedor}` : ''}
                              {g.ivaPct != null ? ` · IVA ${g.ivaPct}% (${fmtDinero(g.ivaCuota || 0, g.moneda)})` : ''}
                            </div>
                          </div>
                          <span className="shrink-0 font-medium">{fmtDinero(g.importe, g.moneda)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-medium">Pagos ({detalle.pagos.length})</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPagoForm({
                          reservationId: detalle.id,
                          huesped: detalle.huesped,
                          importe: detalle.pendiente > 0 ? String(detalle.pendiente) : '',
                          moneda: detalle.moneda,
                          metodo: 'transferencia',
                          estado: 'pagado',
                          referenciaExterna: '',
                          notas: '',
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Añadir pago
                    </Button>
                  </div>
                  {detalle.pagos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin pagos registrados.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detalle.pagos.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {fmtDinero(p.importe, p.moneda)} · {p.metodo}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {p.referenciaExterna || 'Sin referencia'} · {fmtFecha(p.fechaPago)}
                              {p.notas ? ` · ${p.notas}` : ''}
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0 capitalize">{p.estado}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetalle(null)}>Cerrar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Registro de pago */}
      <Dialog open={!!pagoForm} onOpenChange={(open) => !open && setPagoForm(null)}>
        <DialogContent className="max-w-md">
          {pagoForm && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" /> Registrar pago · {pagoForm.huesped}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="font-medium">Importe ({pagoForm.moneda})</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pagoForm.importe}
                    onChange={(e) => setPagoForm((f) => (f ? { ...f, importe: e.target.value } : f))}
                    className="mt-1"
                    autoFocus
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-medium">Método</span>
                    <Select value={pagoForm.metodo} onValueChange={(v) => setPagoForm((f) => (f ? { ...f, metodo: v } : f))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METODOS.map((m) => (
                          <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block">
                    <span className="font-medium">Estado</span>
                    <Select value={pagoForm.estado} onValueChange={(v) => setPagoForm((f) => (f ? { ...f, estado: v } : f))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS_PAGO.map((e) => (
                          <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <label className="block">
                  <span className="font-medium">Referencia (opcional)</span>
                  <Input
                    value={pagoForm.referenciaExterna}
                    onChange={(e) => setPagoForm((f) => (f ? { ...f, referenciaExterna: e.target.value } : f))}
                    placeholder="Nº de transferencia, recibo…"
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="font-medium">Notas (opcional)</span>
                  <Input
                    value={pagoForm.notas}
                    onChange={(e) => setPagoForm((f) => (f ? { ...f, notas: e.target.value } : f))}
                    className="mt-1"
                  />
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPagoForm(null)}>Cancelar</Button>
                <Button onClick={registrarPago} disabled={pagoSaving}>
                  {pagoSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Registrar pago
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
