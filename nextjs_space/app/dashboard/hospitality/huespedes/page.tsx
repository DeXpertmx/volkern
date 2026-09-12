'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Users, Search, Loader2, Mail, Phone, Moon, DollarSign, ExternalLink, CalendarDays, UserRound, Link2, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { channelStyle, statusLabel } from '@/lib/hospitality/calendar';
import { formatearImporte, monedaEfectiva } from '@/lib/hospitality/moneda';

interface Estancia {
  id: string;
  externalBookingId: string;
  channel: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  noches: number;
  amountAfterTax: number | null;
  currency: string | null;
  specialRequests: string | null;
  propertyNombre: string | null;
  unitNombre: string | null;
}

interface Guest {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  contactId: string | null;
  totalEstancias: number;
  totalNoches: number;
  totalGasto: number;
  ultimaEstancia: string | null;
  reservas: Estancia[];
}

interface ContactoCRM {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
}

function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
];

export default function HospitalityHuespedesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  // Moneda de reporte del tenant, para cuando no hay estancias de las que deducirla.
  const [monedaTenant, setMonedaTenant] = useState('');
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<'ultima' | 'nombre'>('ultima');
  const [selected, setSelected] = useState<Guest | null>(null);

  // Diálogo de vinculación manual
  const [linkTarget, setLinkTarget] = useState<Guest | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [contactos, setContactos] = useState<ContactoCRM[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [creatingContact, setCreatingContact] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      params.set('order', order);
      const res = await fetch(`/api/hospitality/guests?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setGuests(d.guests || []);
        if (d.moneda) setMonedaTenant(d.moneda);
      } else {
        toast.error('Error al cargar huéspedes');
      }
    } catch {
      toast.error('Error al cargar huéspedes');
    } finally {
      setLoading(false);
    }
  }, [q, order]);

  useEffect(() => {
    const t = setTimeout(cargar, 250); // debounce para la búsqueda
    return () => clearTimeout(t);
  }, [cargar]);

  // Búsqueda de contactos del CRM para el diálogo de vinculación
  useEffect(() => {
    if (!linkTarget) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (linkSearch.trim()) params.set('search', linkSearch.trim());
        params.set('tipo', 'person');
        const res = await fetch(`/api/contacts?${params.toString()}`);
        if (res.ok) {
          const d = await res.json();
          setContactos(Array.isArray(d) ? d : []);
        } else {
          setContactos([]);
        }
      } catch {
        setContactos([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [linkTarget, linkSearch]);

  const cerrarDialogo = () => {
    setLinkTarget(null);
    setLinkSearch('');
    setContactos([]);
  };

  const vincular = async (contacto: ContactoCRM) => {
    if (!linkTarget) return;
    setLinkingId(contacto.id);
    try {
      const res = await fetch('/api/hospitality/guests/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestKey: linkTarget.id,
          contactId: contacto.id,
          // IDs exactos de las reservas del huésped: evita fallos de matching
          // por nombre/email en guestData (p.ej. firstName+lastName separados).
          reservationIds: linkTarget.reservas.map((r) => r.id),
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`Huésped vinculado a ${contacto.nombre}`);
        cerrarDialogo();
        await cargar();
      } else {
        toast.error(d.error || 'Error al vincular');
      }
    } catch {
      toast.error('Error al vincular el huésped');
    } finally {
      setLinkingId(null);
    }
  };

  // Crea un contacto nuevo en el CRM con los datos del huésped y lo vincula.
  // Si el email ya existe, reutiliza ese contacto en lugar de duplicarlo.
  const crearContactoNuevo = async () => {
    if (!linkTarget) return;
    setCreatingContact(true);
    try {
      // 1) Crear el contacto (o reutilizar si el email ya existe)
      let contacto: ContactoCRM | null = null;
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: linkTarget.nombre,
          email: linkTarget.email || '',
          telefono: linkTarget.telefono || undefined,
          tipo: 'person',
          tags: 'huesped',
        }),
      });
      if (res.ok) {
        const d = await res.json();
        contacto = { id: d.id, nombre: d.nombre, email: d.email, telefono: d.telefono };
      } else {
        const d = await res.json().catch(() => ({}));
        // Email duplicado: localizar el contacto existente para vincularlo.
        if (linkTarget.email && linkTarget.email.trim()) {
          const busqueda = await fetch(`/api/contacts?search=${encodeURIComponent(linkTarget.email)}&tipo=person`);
          if (busqueda.ok) {
            const lista = await busqueda.json();
            const match = Array.isArray(lista)
              ? lista.find((c: any) => (c.email || '').toLowerCase() === linkTarget.email!.toLowerCase())
              : null;
            if (match) {
              contacto = { id: match.id, nombre: match.nombre, email: match.email, telefono: match.telefono };
            }
          }
        }
        if (!contacto) {
          toast.error(d.error || 'Error al crear el contacto');
          return;
        }
      }

      // 2) Vincular el huésped al contacto (nuevo o existente)
      await vincular(contacto);
    } catch {
      toast.error('Error al crear el contacto');
    } finally {
      setCreatingContact(false);
    }
  };

  const totales = useMemo(
    () => ({
      estancias: guests.reduce((a, g) => a + g.totalEstancias, 0),
      noches: guests.reduce((a, g) => a + g.totalNoches, 0),
      gasto: guests.reduce((a, g) => a + g.totalGasto, 0),
      // La moneda sale de las estancias reales y, si no hay, de la del tenant.
      moneda: monedaEfectiva(
        guests.flatMap((g) => g.reservas.map((r) => r.currency)),
        monedaTenant
      ),
    }),
    [guests, monedaTenant]
  );

  const monedaSeleccionada = useMemo(
    () => (selected ? monedaEfectiva(selected.reservas.map((r) => r.currency), monedaTenant) : ''),
    [selected, monedaTenant]
  );

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Huéspedes
          </h1>
          <p className="text-muted-foreground mt-1">
            {guests.length} huéspedes · {totales.estancias} estancias · {totales.noches} noches
            {totales.gasto > 0 && (
              <> · {formatearImporte(totales.gasto, totales.moneda, 0)}</>
            )}
          </p>
        </div>
      </div>

      {/* Búsqueda y orden */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o teléfono..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as 'ultima' | 'nombre')}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ultima">Última estancia</option>
            <option value="nombre">Nombre</option>
          </select>
        </CardContent>
      </Card>

      {/* Lista de huéspedes */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : guests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-semibold">Sin huéspedes</p>
            <p className="text-sm text-muted-foreground">
              {q ? 'Ningún huésped coincide con la búsqueda' : 'Los huéspedes aparecen aquí cuando hay reservas vinculadas'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {guests.map((g, i) => (
            <Card
              key={g.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelected(g)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                  >
                    {iniciales(g.nombre)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{g.nombre}</p>
                      {g.contactId ? (
                        <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px]">
                          <UserRound className="h-3 w-3 mr-1" /> En CRM
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">
                          Sin vincular
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                      {g.email && (
                        <p className="flex items-center gap-1.5 truncate">
                          <Mail className="h-3 w-3 shrink-0" /> {g.email}
                        </p>
                      )}
                      {g.telefono && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0" /> {g.telefono}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 border-t pt-3 text-center">
                  <div>
                    <p className="text-lg font-bold">{g.totalEstancias}</p>
                    <p className="text-[11px] text-muted-foreground">Estancias</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold flex items-center justify-center">
                      <Moon className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                      {g.totalNoches}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Noches</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">
                      {g.totalGasto > 0
                        ? formatearImporte(
                            g.totalGasto,
                            monedaEfectiva(g.reservas.map((r) => r.currency), monedaTenant),
                            0
                          )
                        : '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Gasto</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {g.ultimaEstancia ? `Última: ${fmtFecha(g.ultimaEstancia)}` : 'Sin estancias'}
                  </span>
                  {g.contactId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/dashboard/contactos/${g.contactId}`);
                      }}
                    >
                      <UserRound className="h-3 w-3 mr-1" /> Ver en Contactos
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLinkTarget(g);
                      }}
                    >
                      <Link2 className="h-3 w-3 mr-1" /> Vincular
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Historial de estancias (Sheet lateral) */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold bg-indigo-100 text-indigo-700`}>
                    {iniciales(selected.nombre)}
                  </span>
                  {selected.nombre}
                </SheetTitle>
                <SheetDescription>
                  {selected.email || selected.telefono
                    ? [selected.email, selected.telefono].filter(Boolean).join(' · ')
                    : 'Huésped sin datos de contacto'}
                  {' · '}
                  {selected.totalEstancias} estancia{selected.totalEstancias !== 1 ? 's' : ''} · {selected.totalNoches} noche{selected.totalNoches !== 1 ? 's' : ''}
                  {selected.totalGasto > 0 && <> · {formatearImporte(selected.totalGasto, monedaSeleccionada, 0)}</>}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 flex flex-wrap gap-2">
                {selected.contactId ? (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/dashboard/contactos/${selected.contactId}`)}
                  >
                    <UserRound className="h-4 w-4 mr-1.5" /> Ver en Contactos
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => { setLinkTarget(selected); setSelected(null); }}>
                    <Link2 className="h-4 w-4 mr-1.5" /> Vincular a contacto del CRM
                  </Button>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {selected.reservas.map((r) => {
                  const cs = channelStyle(r.channel);
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span
                            className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5"
                            style={{ backgroundColor: cs.color }}
                          >
                            {r.channel}
                          </span>
                          <Badge className={`${r.estado === 'cancelled' ? 'bg-red-100 text-red-700' : r.estado === 'checked_in' ? 'bg-blue-100 text-blue-700' : r.estado === 'checked_out' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'} border-0`}>
                            {statusLabel(r.estado)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Estancia</p>
                            <p className="font-medium whitespace-nowrap">
                              {fmtFecha(r.checkIn)} → {fmtFecha(r.checkOut)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Noches</p>
                            <p className="font-medium flex items-center gap-1">
                              <Moon className="h-3.5 w-3.5 text-muted-foreground" /> {r.noches}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Unidad</p>
                            <p className="font-medium">{r.unitNombre || 'Sin asignar'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Importe</p>
                            <p className="font-medium flex items-center gap-1">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                              {r.amountAfterTax != null
                                ? formatearImporte(r.amountAfterTax, r.currency || '', 0)
                                : '—'}
                            </p>
                          </div>
                        </div>
                        {r.specialRequests && (
                          <p className="mt-3 text-xs text-muted-foreground border-t pt-2">
                            📝 {r.specialRequests}
                          </p>
                        )}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Ref. {r.externalBookingId} · {r.propertyNombre || 'Propiedad'}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Diálogo de vinculación manual a contacto del CRM */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => { if (!open) { setLinkTarget(null); setLinkSearch(''); setContactos([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Vincular huésped a contacto
            </DialogTitle>
            <DialogDescription>
              {linkTarget && (
                <>
                  Vinculando <strong>{linkTarget.nombre}</strong>
                  {linkTarget.email && <> ({linkTarget.email})</>} a un contacto existente del CRM. Sus estancias quedarán asociadas al contacto.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar contacto del CRM por nombre o email..."
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={creatingContact}
                onClick={crearContactoNuevo}
                title="Crea un contacto en el CRM con los datos del huésped y lo vincula"
              >
                {creatingContact ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-1" />
                )}
                {creatingContact ? '' : 'Crear contacto nuevo'}
              </Button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {searching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : contactos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {linkSearch ? 'Ningún contacto coincide con la búsqueda' : 'Escribe para buscar contactos del CRM'}
                </p>
              ) : (
                contactos.map((c) => (
                  <Card key={c.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {iniciales(c.nombre)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.nombre}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[c.email, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={linkingId === c.id}
                        onClick={() => vincular(c)}
                      >
                        {linkingId === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4 mr-1" />
                        )}
                        {linkingId === c.id ? '' : 'Vincular'}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}