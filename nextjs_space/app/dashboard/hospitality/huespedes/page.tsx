'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Users, Search, Loader2, Mail, Phone, Moon, DollarSign, ExternalLink, CalendarDays, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { channelStyle, statusLabel } from '@/lib/hospitality/calendar';

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
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<'ultima' | 'nombre'>('ultima');
  const [selected, setSelected] = useState<Guest | null>(null);

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

  const totales = useMemo(
    () => ({
      estancias: guests.reduce((a, g) => a + g.totalEstancias, 0),
      noches: guests.reduce((a, g) => a + g.totalNoches, 0),
      gasto: guests.reduce((a, g) => a + g.totalGasto, 0),
    }),
    [guests]
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
              <> · {totales.gasto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })}</>
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
                      {g.contactId && (
                        <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px]">
                          <UserRound className="h-3 w-3 mr-1" /> En CRM
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
                      {g.totalGasto > 0 ? g.totalGasto.toLocaleString('es-MX', { maximumFractionDigits: 0 }) : '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Gasto</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {g.ultimaEstancia ? `Última: ${fmtFecha(g.ultimaEstancia)}` : 'Sin estancias'}
                  </span>
                  <span className="flex items-center gap-1 text-primary">
                    Ver historial <ExternalLink className="h-3 w-3" />
                  </span>
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
                  {selected.totalGasto > 0 && <> · {selected.totalGasto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })}</>}
                </SheetDescription>
              </SheetHeader>

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
                                ? `${r.amountAfterTax.toLocaleString('es-MX')} ${r.currency || ''}`
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
    </div>
  );
}