'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  User,
  Phone,
  Mail,
  BedDouble,
  Moon,
  DollarSign,
  StickyNote,
  X,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  buildDays,
  layoutReservations,
  nightsBetween,
  channelStyle,
  statusLabel,
  currentWeekRange,
  startOfDay,
  toIsoDate,
  type CalendarReservation,
  type CalendarUnit,
  type CalendarDay,
} from '@/lib/hospitality/calendar';

interface Property {
  id: string;
  nombre: string;
}

interface RawReservation {
  id: string;
  propertyId: string;
  unitId: string | null;
  channel: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  amountAfterTax: number | null;
  currency: string | null;
  specialRequests: string | null;
  externalBookingId: string;
  guestData?: any;
  contact?: { id: string; nombre: string | null; email: string | null; telefono: string | null } | null;
  unit?: { id: string; nombre: string; codigo: string | null } | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

export default function HospitalityCalendar() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<CalendarUnit[]>([]);
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [rangeStart, setRangeStart] = useState<Date>(() => currentWeekRange().start);
  const [selected, setSelected] = useState<CalendarReservation | null>(null);

  const rangeEnd = useMemo(() => new Date(rangeStart.getTime() + 6 * 24 * 60 * 60 * 1000), [rangeStart]);

  const loadBase = useCallback(async () => {
    try {
      const [propRes, unitRes] = await Promise.all([
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
      ]);
      if (propRes.ok) {
        const d = await propRes.json();
        setProperties(d.properties || []);
      }
      if (unitRes.ok) {
        const d = await unitRes.json();
        setUnits((d.units || []).map((u: any) => ({
          id: u.id,
          nombre: u.nombre,
          codigo: u.codigo,
          propertyId: u.propertyId,
        })));
      }
    } catch {
      toast.error('Error al cargar propiedades y unidades');
    }
  }, []);

  const loadReservations = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        from: toIsoDate(rangeStart),
        to: toIsoDate(new Date(rangeStart.getTime() + 8 * 24 * 60 * 60 * 1000)), // margen para estancias largas
      });
      if (selectedProperty !== 'all') params.set('propertyId', selectedProperty);

      const res = await fetch(`/api/hospitality/reservations?${params.toString()}`);
      if (!res.ok) {
        toast.error('Error al cargar reservas');
        return;
      }
      const data = await res.json();
      const mapped: CalendarReservation[] = (data.reservations || []).map((r: RawReservation) => ({
        id: r.id,
        unitId: r.unitId,
        unitNombre: r.unit?.nombre || null,
        propertyId: r.propertyId,
        channel: r.channel,
        guestName: (r.guestData?.firstName || r.guestData?.lastName
          ? [r.guestData.firstName, r.guestData.lastName].filter(Boolean).join(' ')
          : r.contact?.nombre) || 'Huésped',
        email: r.guestData?.email || r.contact?.email || null,
        phone: r.guestData?.phone || r.contact?.telefono || null,
        estado: r.estado,
        checkIn: new Date(r.checkIn),
        checkOut: new Date(r.checkOut),
        nights: nightsBetween(new Date(r.checkIn), new Date(r.checkOut)),
        amountAfterTax: r.amountAfterTax,
        currency: r.currency,
        specialRequests: r.specialRequests,
        externalBookingId: r.externalBookingId,
      }));
      setReservations(mapped);
    } catch {
      toast.error('Error al cargar reservas');
    }
  }, [rangeStart, selectedProperty]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  const days: CalendarDay[] = useMemo(() => buildDays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const layout = useMemo(() => layoutReservations(reservations, days), [reservations, days]);

  const visibleUnits = useMemo(() => {
    const list = selectedProperty === 'all' ? units : units.filter((u) => u.propertyId === selectedProperty);
    return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [units, selectedProperty]);

  const todayKey = useMemo(() => toIsoDate(new Date()), []);

  // Vista "Hoy" (mobile / quick glance): llegadas y salidas
  const todayArrivals = useMemo(() => {
    return reservations.filter((r) => r.estado !== 'cancelled' && toIsoDate(r.checkIn) === todayKey);
  }, [reservations, todayKey]);

  const todayDepartures = useMemo(() => {
    return reservations.filter((r) => r.estado !== 'cancelled' && toIsoDate(r.checkOut) === todayKey);
  }, [reservations, todayKey]);

  const gotoWeek = (offset: number) => {
    setRangeStart((prev) => new Date(prev.getTime() + offset * WEEK_MS));
  };

  const gotoToday = () => {
    setRangeStart(currentWeekRange().start);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-primary" />
            Planificación
          </h1>
          <p className="text-muted-foreground mt-1">Ocupación de unidades por fecha</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Todas las propiedades</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          <Button onClick={gotoToday} variant="outline" size="sm">Hoy</Button>
          <Button onClick={() => gotoWeek(-1)} variant="outline" size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button onClick={() => gotoWeek(1)} variant="outline" size="icon">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Vista Hoy (mobile-first) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Llegadas hoy ({todayArrivals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {todayArrivals.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin llegadas hoy</p>
            ) : (
              todayArrivals.map((r) => (
                <p key={r.id} className="text-xs flex items-center justify-between">
                  <span>{r.guestName}</span>
                  <span className="text-muted-foreground">{r.unitNombre}</span>
                </p>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <XCircle className="h-4 w-4" /> Salidas hoy ({todayDepartures.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {todayDepartures.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin salidas hoy</p>
            ) : (
              todayDepartures.map((r) => (
                <p key={r.id} className="text-xs flex items-center justify-between">
                  <span>{r.guestName}</span>
                  <span className="text-muted-foreground">{r.unitNombre}</span>
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Planning */}
      <Card className="overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <div className="min-w-[900px]">
            {/* Cabecera de fechas (sticky top) */}
            <div
              className="grid sticky top-0 z-20 bg-card border-b"
              style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(110px, 1fr))` }}
            >
              <div className="sticky left-0 z-30 bg-card p-2 text-xs font-semibold text-muted-foreground flex items-center gap-1 border-r">
                <Building2 className="h-3.5 w-3.5" />
                Unidad
              </div>
              {days.map((d) => (
                <div
                  key={d.key}
                  className={`p-2 text-center border-r last:border-r-0 ${
                    d.isToday ? 'bg-primary/10' : d.isWeekend ? 'bg-muted/40' : ''
                  }`}
                >
                  <p className={`text-xs font-bold ${d.isToday ? 'text-primary' : ''}`}>{d.label}</p>
                  {d.isToday && (
                    <p className="text-[10px] text-primary font-semibold uppercase tracking-wide">Hoy</p>
                  )}
                </div>
              ))}
            </div>

            {/* Filas por unidad */}
            {visibleUnits.length === 0 ? (
              <div className="p-10 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">Sin unidades</p>
                <p className="text-sm text-muted-foreground">
                  Crea propiedades y unidades para ver la planificación
                </p>
              </div>
            ) : (
              visibleUnits.map((unit) => {
                const blocks = layout.get(unit.id) || [];
                return (
                  <div
                    key={unit.id}
                    className="relative border-b last:border-b-0"
                    style={{ minHeight: 56 }}
                  >
                    {/* Grid base: columna unidad + celdas de días */}
                    <div
                      className="grid pointer-events-none"
                      style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(110px, 1fr))` }}
                    >
                      <div className="sticky left-0 z-30 bg-card p-2 border-r flex items-center justify-between gap-1 min-w-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{unit.nombre}</p>
                          {unit.codigo && (
                            <p className="text-[11px] text-muted-foreground truncate">{unit.codigo}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{blocks.length} res.</span>
                      </div>
                      {days.map((d) => (
                        <div
                          key={d.key}
                          className={`border-r last:border-r-0 ${
                            d.isToday ? 'bg-primary/5' : d.isWeekend ? 'bg-muted/30' : ''
                          }`}
                        />
                      ))}
                    </div>

                    {/* Capa de bloques (mismas columnas, excluyendo columna unidad) */}
                    <div
                      className="absolute inset-y-0 grid"
                      style={{
                        left: 200,
                        right: 0,
                        gridTemplateColumns: `repeat(${days.length}, minmax(110px, 1fr))`,
                      }}
                    >
                      {blocks.map((block, i) => {
                        const style = channelStyle(block.reservation.channel);
                        const isCancelled = block.reservation.estado === 'cancelled';
                        return (
                          <button
                            key={`${block.reservation.id}-${i}`}
                            onClick={() => setSelected(block.reservation)}
                            className={`z-10 rounded-md px-2 py-1 text-left overflow-hidden shadow-sm hover:shadow-md hover:z-20 transition-all ${
                              isCancelled ? 'bg-slate-300 text-slate-600 opacity-70 line-through' : style.block
                            }`}
                            style={{
                              gridColumn: `${block.startCol + 1} / span ${block.colSpan}`,
                              gridRow: 1,
                              marginLeft: 2,
                              marginRight: 2,
                              marginTop: 4,
                              marginBottom: 4,
                            }}
                            title={`${block.reservation.guestName} · ${block.totalNights} noches`}
                          >
                            <div className="flex items-center gap-1 truncate text-[11px] leading-tight font-medium">
                              {block.continuesLeft && <span className="text-[10px]">‹</span>}
                              <span className="truncate">{block.reservation.guestName}</span>
                              <span className="opacity-80 shrink-0">· {block.totalNights} n</span>
                              {block.continuesRight && <span className="text-[10px]">›</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Leyenda */}
        <div className="p-3 border-t flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-muted-foreground">Canales:</span>
          {['airbnb', 'booking', 'direct', 'expedia'].map((c) => {
            const s = channelStyle(c);
            return (
              <span key={c} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            );
          })}
          <span className="mx-2 border-l h-4" />
          <span className="font-semibold text-muted-foreground">Estados:</span>
          {Object.entries({ pending: 'bg-amber-400', confirmed: 'bg-emerald-500', cancelled: 'bg-red-500', checked_in: 'bg-blue-500' }).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${c}`} />
              {statusLabel(k)}
            </span>
          ))}
        </div>
      </Card>

      {/* Panel lateral de detalle */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSelected(null)}>
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-950 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: channelStyle(selected.channel).color }} />
                    {channelStyle(selected.channel).label}
                  </p>
                  <h2 className="text-xl font-bold mt-1">{selected.guestName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.externalBookingId} · {statusLabel(selected.estado)}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Estancia */}
              <div className="rounded-lg border p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estancia</p>
                <p className="text-sm flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {fmtDay(selected.checkIn)} → {fmtDay(selected.checkOut)}
                </p>
                <p className="text-sm flex items-center gap-2">
                  <Moon className="h-4 w-4 text-primary" />
                  {selected.nights} noches
                </p>
                <p className="text-sm flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-primary" />
                  {selected.unitNombre || 'Sin unidad asignada'}
                </p>
              </div>

              {/* Huésped */}
              <div className="rounded-lg border p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Huésped</p>
                <p className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  {selected.guestName}
                </p>
                {selected.phone && (
                  <p className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" />
                    {selected.phone}
                  </p>
                )}
                {selected.email && (
                  <p className="text-sm flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    {selected.email}
                  </p>
                )}
              </div>

              {/* Importe */}
              {selected.amountAfterTax != null && (
                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4 text-primary" /> Importe
                  </p>
                  <p className="font-semibold">
                    {selected.currency || ''} {selected.amountAfterTax}
                  </p>
                </div>
              )}

              {/* Solicitudes */}
              {selected.specialRequests && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <StickyNote className="h-4 w-4 text-primary" /> Solicitudes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{selected.specialRequests}</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

