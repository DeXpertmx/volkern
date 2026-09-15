'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  CalendarX2,
  Plus,
  Pencil,
  Loader2,
  Search,
  X,
  User,
  Mail,
  Phone,
  Moon,
  DollarSign,
  Save,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { formatearImporte, monedaEfectiva, MONEDAS_SELECCIONABLES } from '@/lib/moneda';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { useCapacidadesHospitality } from '@/hooks/use-capacidades-hospitality';

interface Reservation {
  id: string;
  propertyId: string;
  unitId: string | null;
  channel: string;
  externalBookingId: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  amountAfterTax: number | null;
  currency: string | null;
  specialRequests: string | null;
  occupancyAdults: number;
  occupancyChildren: number;
  unit?: { id: string; nombre: string; codigo: string | null } | null;
  property?: { id: string; nombre: string } | null;
  contact?: { id: string; nombre: string | null; email: string | null; telefono: string | null } | null;
  guestData?: any;
}

interface Property {
  id: string;
  nombre: string;
}
interface Unit {
  id: string;
  propertyId: string;
  nombre: string;
  codigo: string | null;
  capacidad: number;
}

const ESTADOS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'checked_in', label: 'Check-in' },
  { value: 'checked_out', label: 'Check-out' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'no_show', label: 'No show' },
];

const CANALES = ['Airbnb', 'Booking.com', 'Expedia', 'Directa', 'Volkern'];

const ESTADO_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  checked_in: 'bg-blue-100 text-blue-800',
  checked_out: 'bg-slate-100 text-slate-700',
  no_show: 'bg-zinc-100 text-zinc-700',
};

const CHANNEL_COLOR: Record<string, string> = {
  airbnb: '#FF5A5F',
  booking: '#003580',
  expedia: '#00355F',
  directa: '#4F46E5',
  volkern: '#4F46E5',
};

function channelColor(c: string): string {
  const l = (c || '').toLowerCase();
  for (const k of Object.keys(CHANNEL_COLOR)) {
    if (l.includes(k)) return CHANNEL_COLOR[k];
  }
  return '#64748B';
}

function noches(a: string, b: string): number {
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return Math.max(0, Math.round(d));
}

function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

const EMPTY_FORM = {
  propertyId: '',
  unitId: '',
  huespedNombre: '',
  huespedEmail: '',
  huespedTelefono: '',
  canal: 'Directa',
  checkin: '',
  checkout: '',
  estado: 'confirmed',
  importe: '',
  // Vacío a propósito: lo rellena la divisa del tenant al abrir el formulario.
  moneda: '',
  notas: '',
};

export default function HospitalityReservasPage() {
  const { puede } = useCapacidadesHospitality();
  const [loading, setLoading] = useState(true);
  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  // Moneda de reporte del tenant, tal como la devuelve la API.
  const [monedaTenant, setMonedaTenant] = useState('');

  // Filtros
  const [fEstado, setFEstado] = useState('todas');
  const [fCanal, setFCanal] = useState('todos');
  const [fPropiedad, setFPropiedad] = useState('todas');
  const [q, setQ] = useState('');

  // Diálogos
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // La moneda de la vista sale de los datos; si aún no hay ninguno, de la moneda
  // de reporte del tenant, que es la fuente autoritativa. Nunca de una constante
  // del esquema: 'MXN' por defecto dejaba a un tenant español con pesos.
  const monedaLista = useMemo(
    () => monedaEfectiva(reservas.map((r) => r.currency), monedaTenant),
    [reservas, monedaTenant]
  );

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (fEstado !== 'todas') params.set('estado', fEstado);
      if (fCanal !== 'todos') params.set('canal', fCanal);
      if (fPropiedad !== 'todas') params.set('propertyId', fPropiedad);
      if (q.trim()) params.set('q', q.trim());
      const [rRes, pRes, uRes] = await Promise.all([
        fetch(`/api/hospitality/reservations?${params.toString()}`),
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
      ]);
      if (rRes.ok) {
        const d = await rRes.json();
        setReservas(d.reservations || []);
        if (d.moneda) setMonedaTenant(d.moneda);
      }
      if (pRes.ok) {
        const d = await pRes.json();
        setProperties(d.properties || []);
      }
      if (uRes.ok) {
        const d = await uRes.json();
        setUnits(d.units || []);
      }
    } catch {
      toast.error('Error al cargar reservas');
    } finally {
      setLoading(false);
    }
  }, [fEstado, fCanal, fPropiedad, q]);

  useEffect(() => {
    const t = setTimeout(cargar, 250); // debounce para la búsqueda
    return () => clearTimeout(t);
  }, [cargar]);

  const unidadesDePropiedad = useMemo(() => {
    const pid = editing ? editing.propertyId : form.propertyId;
    if (!pid || pid === 'todas') return units;
    return units.filter((u) => u.propertyId === pid);
  }, [units, form.propertyId, editing]);

  const abrirNueva = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, propertyId: properties[0]?.id || '', moneda: monedaLista });
    setFormOpen(true);
  };

  const abrirEditar = (r: Reservation) => {
    setEditing(r);
    const huesped = r.guestData || {};
    setForm({
      propertyId: r.propertyId,
      unitId: r.unitId || '',
      huespedNombre: huesped.firstName || r.contact?.nombre || '',
      huespedEmail: huesped.email || r.contact?.email || '',
      huespedTelefono: huesped.phone || r.contact?.telefono || '',
      canal: r.channel,
      checkin: r.checkIn.slice(0, 10),
      checkout: r.checkOut.slice(0, 10),
      estado: r.estado,
      importe: r.amountAfterTax != null ? String(r.amountAfterTax) : '',
      moneda: r.currency || monedaLista,
      notas: r.specialRequests || '',
    });
    setFormOpen(true);
  };

  const guardar = async () => {
    if (!form.propertyId) { toast.error('Selecciona una propiedad'); return; }
    if (!form.checkin || !form.checkout) { toast.error('Selecciona las fechas'); return; }
    if (form.checkout <= form.checkin) { toast.error('La salida debe ser posterior a la entrada'); return; }
    if (!form.canal.trim()) { toast.error('Indica el canal'); return; }

    setSaving(true);
    try {
      const url = editing ? `/api/hospitality/reservations/${editing.id}` : '/api/hospitality/reservations';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: form.propertyId || undefined,
          unitId: form.unitId || null,
          huespedNombre: form.huespedNombre || undefined,
          huespedEmail: form.huespedEmail || undefined,
          huespedTelefono: form.huespedTelefono || undefined,
          canal: form.canal,
          checkin: form.checkin,
          checkout: form.checkout,
          estado: form.estado,
          importe: form.importe || null,
          moneda: form.moneda,
          notas: form.notas || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editing ? 'Reserva actualizada' : 'Reserva creada');
        setFormOpen(false);
        setEditing(null);
        await cargar();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar la reserva');
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstadoRapido = async (r: Reservation, nuevo: string) => {
    try {
      const res = await fetch(`/api/hospitality/reservations/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Estado actualizado: ${ESTADOS.find((e) => e.value === nuevo)?.label || nuevo}`);
        await cargar();
      } else {
        toast.error(data.error || 'No se pudo cambiar el estado');
      }
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  const totalNoches = useMemo(
    () => reservas.filter((r) => r.estado !== 'cancelled').reduce((a, r) => a + noches(r.checkIn, r.checkOut), 0),
    [reservas]
  );
  const totalIngresos = useMemo(
    () => reservas.filter((r) => r.estado !== 'cancelled').reduce((a, r) => a + (r.amountAfterTax || 0), 0),
    [reservas]
  );

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarX2 className="h-8 w-8 text-primary" />
            Reservas
          </h1>
          <p className="text-muted-foreground mt-1">
            {reservas.length} reservas · {totalNoches} noches ·{' '}
            {totalIngresos > 0 ? formatearImporte(totalIngresos, monedaLista, 0) : '—'}
          </p>
        </div>
        <AccionHospitality capacidad="reservas.crear">
          <Button onClick={abrirNueva}>
            <Plus className="h-4 w-4 mr-2" /> Nueva Reserva
          </Button>
        </AccionHospitality>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por huésped, email o referencia..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              {ESTADOS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fCanal} onValueChange={setFCanal}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los canales</SelectItem>
              {CANALES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fPropiedad} onValueChange={setFPropiedad}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las propiedades</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(fEstado !== 'todas' || fCanal !== 'todos' || fPropiedad !== 'todas' || q) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFEstado('todas'); setFCanal('todos'); setFPropiedad('todas'); setQ(''); }}
            >
              <X className="h-4 w-4 mr-1" /> Limpiar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : reservas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarX2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-semibold">Sin reservas</p>
            <p className="text-sm text-muted-foreground mb-4">
              No hay reservas que coincidan con los filtros
            </p>
            <AccionHospitality capacidad="reservas.crear">
              <Button onClick={abrirNueva}>
                <Plus className="h-4 w-4 mr-2" /> Crear la primera reserva
              </Button>
            </AccionHospitality>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Huésped</th>
                    <th className="p-3 font-medium">Canal</th>
                    <th className="p-3 font-medium">Unidad</th>
                    <th className="p-3 font-medium">Fechas</th>
                    <th className="p-3 font-medium">Noches</th>
                    <th className="p-3 font-medium">Importe</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reservas.map((r) => {
                    const huesped =
                      (r.guestData?.firstName || r.guestData?.lastName
                        ? [r.guestData.firstName, r.guestData.lastName].filter(Boolean).join(' ')
                        : r.contact?.nombre) || 'Huésped';
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="p-3">
                          <p className="font-medium">{huesped}</p>
                          <p className="text-xs text-muted-foreground">{r.externalBookingId}</p>
                        </td>
                        <td className="p-3">
                          <span
                            className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5"
                            style={{ backgroundColor: channelColor(r.channel) }}
                          >
                            {r.channel}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.unit?.nombre || <span className="text-muted-foreground">Sin asignar</span>}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {fmtFecha(r.checkIn)} → {fmtFecha(r.checkOut)}
                        </td>
                        <td className="p-3">
                          <span className="flex items-center gap-1">
                            <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                            {noches(r.checkIn, r.checkOut)}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {r.amountAfterTax != null ? (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatearImporte(r.amountAfterTax, r.currency || monedaLista, 0)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge className={`${ESTADO_BADGE[r.estado] || 'bg-slate-100 text-slate-700'} border-0`}>
                            {ESTADOS.find((e) => e.value === r.estado)?.label || r.estado}
                          </Badge>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {puede('reservas.editar') && (
                            <Select
                              value={r.estado}
                              onValueChange={(v) => cambiarEstadoRapido(r, v)}
                            >
                              <SelectTrigger className="h-8 w-[130px] inline-flex mr-1" title="Cambiar estado">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Cancelar no es editar: el estado se ofrece a quien
                                    puede cambiar la reserva, y anularla solo a quien
                                    puede cancelarla. */}
                                {ESTADOS.filter(
                                  (e) => e.value !== r.estado && (e.value !== 'cancelled' || puede('reservas.cancelar'))
                                ).map((e) => (
                                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <AccionHospitality capacidad="reservas.editar">
                            <Button variant="ghost" size="sm" onClick={() => abrirEditar(r)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </AccionHospitality>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog alta/edición */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Reserva' : 'Nueva Reserva'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Referencia ${editing.externalBookingId} — los cambios se sincronizan con los canales`
                : 'Crea una reserva manual (directa o registrada desde otro canal)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Propiedad *</Label>
                <Select
                  value={form.propertyId}
                  onValueChange={(v) => setForm({ ...form, propertyId: v, unitId: '' })}
                  disabled={!!editing}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}>
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin asignar</SelectItem>
                    {unidadesDePropiedad.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nombre} ({u.capacidad} pers.)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="r-checkin">Entrada *</Label>
                <Input id="r-checkin" type="date" value={form.checkin} onChange={(e) => setForm({ ...form, checkin: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-checkout">Salida *</Label>
                <Input id="r-checkout" type="date" value={form.checkout} onChange={(e) => setForm({ ...form, checkout: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Canal *</Label>
                <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANALES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS.filter((e) => editing?.estado !== 'cancelled' || e.value === 'cancelled').map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="r-importe">Importe</Label>
                  <Input id="r-importe" type="number" min={0} value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-moneda">Moneda</Label>
                  <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                    <SelectTrigger id="r-moneda"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONEDAS_SELECCIONABLES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Huésped (opcional — se vincula al CRM)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="r-nombre" className="flex items-center gap-1"><User className="h-3 w-3" /> Nombre</Label>
                  <Input id="r-nombre" value={form.huespedNombre} onChange={(e) => setForm({ ...form, huespedNombre: e.target.value })} placeholder="Nombre del huésped" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-email" className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                  <Input id="r-email" type="email" value={form.huespedEmail} onChange={(e) => setForm({ ...form, huespedEmail: e.target.value })} placeholder="email@ejemplo.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="r-tel" className="flex items-center gap-1"><Phone className="h-3 w-3" /> Teléfono</Label>
                  <Input id="r-tel" value={form.huespedTelefono} onChange={(e) => setForm({ ...form, huespedTelefono: e.target.value })} placeholder="+52 ..." />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-notas">Solicitudes / Notas</Label>
              <Textarea id="r-notas" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej: Check-in tardío, cuna para bebé..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormOpen(false); setEditing(null); }}>Cancelar</Button>
            <AccionHospitality capacidad={editing ? 'reservas.editar' : 'reservas.crear'}>
              <Button onClick={guardar} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {editing ? 'Guardar cambios' : 'Crear reserva'}
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
