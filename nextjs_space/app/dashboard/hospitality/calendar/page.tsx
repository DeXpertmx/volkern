'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  colorTipoBloqueo,
  etiquetaTipoBloqueo,
  normalizarTipoBloqueo,
  PRESENTACION_BLOQUEO,
  TIPOS_BLOQUEO,
  type TipoBloqueo,
} from '@/lib/hospitality/block-types';
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
  Sparkles,
  Wrench,
  AlertTriangle,
  Plus,
  Trash2,
  Ban,
} from 'lucide-react';
import {
  buildDays,
  layoutReservations,
  nightsBetween,
  channelStyle,
  statusLabel,
  currentWeekRange,
  buildMonthGrid,
  occupancyByDay,
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

interface ManualBlock {
  id: string;
  unitId: string;
  fechaInicio: string;
  fechaFin: string;
  tipo: string;
  motivo: string | null;
  estado: string;
  unit?: { id: string; nombre: string; codigo: string | null; propertyId: string };
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
  const [blocks, setBlocks] = useState<ManualBlock[]>([]);
  const [view, setView] = useState<'planning' | 'mes' | 'operaciones'>('planning');
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [rangeStart, setRangeStart] = useState<Date>(() => currentWeekRange().start);
  const [monthCursor, setMonthCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<CalendarReservation | null>(null);
  const [ops, setOps] = useState<any>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [checking, setChecking] = useState<{ id: string; tipo: string } | null>(null);
  const [taskForm, setTaskForm] = useState<{
    open: boolean;
    tipo: 'cleaning' | 'maintenance';
    unitId: string;
    reservationId: string | null;
  } | null>(null);
  const [taskFields, setTaskFields] = useState({ incidencia: '', notas: '', prioridad: '' });
  const [taskSaving, setTaskSaving] = useState(false);
  const [blockForm, setBlockForm] = useState<{
    open: boolean;
    unitId: string;
    unitNombre: string;
    fechaInicio: string;
    fechaFin: string;
    tipo: TipoBloqueo;
    motivo: string;
  } | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);

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

  const loadBlocks = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        from: toIsoDate(rangeStart),
        to: toIsoDate(new Date(rangeStart.getTime() + 8 * 24 * 60 * 60 * 1000)),
      });
      if (selectedProperty !== 'all') params.set('propertyId', selectedProperty);
      const res = await fetch(`/api/hospitality/blocks?${params.toString()}`);
      if (!res.ok) {
        toast.error('Error al cargar bloqueos');
        return;
      }
      const data = await res.json();
      setBlocks(data.blocks || []);
    } catch {
      toast.error('Error al cargar bloqueos');
    }
  }, [rangeStart, selectedProperty]);

  const loadReservations = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        from: toIsoDate(rangeStart),
        to: toIsoDate(new Date(rangeStart.getTime() + 8 * 24 * 60 * 60 * 1000)),
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
    const boot = async () => {
      await loadBase();
      await loadReservations();
      await loadBlocks();
      setLoading(false);
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const days: CalendarDay[] = useMemo(() => buildDays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const layout = useMemo(() => layoutReservations(reservations, days), [reservations, days]);

  const visibleUnits = useMemo(() => {
    const list = selectedProperty === 'all' ? units : units.filter((u) => u.propertyId === selectedProperty);
    return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [units, selectedProperty]);

  const todayKey = useMemo(() => toIsoDate(new Date()), []);

  const monthGrid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const occupancy = useMemo(
    () => occupancyByDay(reservations, monthGrid.days),
    [reservations, monthGrid]
  );
  const loadOperations = useCallback(async () => {
    setOpsLoading(true);
    try {
      const res = await fetch('/api/hospitality/operations');
      if (res.ok) {
        const data = await res.json();
        setOps(data);
      } else {
        toast.error('Error al cargar operaciones');
      }
    } catch {
      toast.error('Error al cargar operaciones');
    } finally {
      setOpsLoading(false);
    }
  }, []);

  // Vista inicial por query (?vista=mes|operaciones) para poder enlazar
  // directamente a Operaciones desde el menú lateral.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('vista');
    if (v === 'planning' || v === 'mes' || v === 'operaciones') setView(v);
  }, []);

  useEffect(() => {
    if (view === 'operaciones') loadOperations();
  }, [view, loadOperations, reservations]);

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

  const openTaskForm = (tipo: 'cleaning' | 'maintenance') => {
    if (!selected) return;
    // Unidad de la reserva; si no tiene, se elige del select.
    const unitId = selected.unitId || '';
    setTaskFields({ incidencia: '', notas: '', prioridad: '' });
    setTaskForm({
      open: true,
      tipo,
      unitId,
      reservationId: selected.id,
    });
  };

  const openBlockForm = (unit: CalendarUnit) => {
    const inicio = toIsoDate(rangeStart);
    const fin = toIsoDate(new Date(rangeStart.getTime() + 2 * 24 * 60 * 60 * 1000));
    setBlockForm({
      open: true,
      unitId: unit.id,
      unitNombre: unit.nombre,
      fechaInicio: inicio,
      fechaFin: fin,
      tipo: normalizarTipoBloqueo('propietario'),
      motivo: '',
    });
  };

  const createBlock = async () => {
    if (!blockForm) return;
    if (!blockForm.fechaInicio || !blockForm.fechaFin) {
      toast.error('Indica las fechas del bloqueo');
      return;
    }
    if (blockForm.fechaFin <= blockForm.fechaInicio) {
      toast.error('La fecha fin debe ser posterior a la fecha inicio');
      return;
    }
    setBlockSaving(true);
    try {
      const res = await fetch('/api/hospitality/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: blockForm.unitId,
          fechaInicio: blockForm.fechaInicio,
          fechaFin: blockForm.fechaFin,
          tipo: blockForm.tipo,
          motivo: blockForm.motivo || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el bloqueo');
      toast.success('Bloqueo creado y disponibilidad sincronizada');
      setBlockForm(null);
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear bloqueo');
    } finally {
      setBlockSaving(false);
    }
  };

  const deleteBlock = async (block: ManualBlock) => {
    if (!window.confirm(`¿Eliminar el bloqueo de ${block.unit?.nombre || 'la unidad'}?`)) return;
    try {
      const res = await fetch(`/api/hospitality/blocks/${block.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el bloqueo');
      toast.success('Bloqueo eliminado y disponibilidad sincronizada');
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar bloqueo');
    }
  };
  const createTaskFromReservation = async () => {
    if (!taskForm) return;
    if (!taskForm.unitId) {
      toast.error('Selecciona una unidad');
      return;
    }
    if (taskForm.tipo === 'maintenance' && !taskFields.incidencia.trim()) {
      toast.error('Describe la incidencia');
      return;
    }
    setTaskSaving(true);
    try {
      const res = await fetch('/api/hospitality/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: taskForm.tipo,
          unitId: taskForm.unitId,
          reservationId: taskForm.reservationId || undefined,
          prioridad: taskFields.prioridad || undefined,
          notas: taskFields.notas || undefined,
          incidencia: taskForm.tipo === 'maintenance' ? taskFields.incidencia : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(taskForm.tipo === 'cleaning' ? 'Tarea de limpieza creada' : 'Incidencia registrada');
        setTaskForm(null);
        setTaskFields({ incidencia: '', notas: '', prioridad: '' });
        loadOperations();
      } else {
        toast.error(data.error || 'No se pudo crear la tarea');
      }
    } catch {
      toast.error('Error al crear la tarea');
    } finally {
      setTaskSaving(false);
    }
  };

  const runCheck = async (r: CalendarReservation, tipo: 'checkin' | 'checkout') => {
    setChecking({ id: r.id, tipo });
    try {
      const res = await fetch(`/api/hospitality/reservations/${r.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacion: tipo }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(tipo === 'checkin' ? 'Check-in realizado' : 'Check-out realizado · limpieza programada');
        setSelected(null);
        loadReservations();
        loadOperations();
        loadBase();
      } else {
        toast.error(data.error || 'No se pudo realizar la operación');
      }
    } catch {
      toast.error('Error al realizar la operación');
    } finally {
      setChecking(null);
    }
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
            {view === 'planning' ? 'Planificación' : view === 'mes' ? 'Mes' : 'Operaciones'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {view === 'planning'
              ? 'Ocupación de unidades por fecha'
              : view === 'mes'
                ? 'Ocupación del mes por día'
                : 'Llegadas, salidas, limpieza y mantenimiento de hoy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            {(['planning', 'mes', 'operaciones'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  view === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'planning' ? 'Planning' : v === 'mes' ? 'Mes' : 'Operaciones'}
              </button>
            ))}
          </div>
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
          {view === 'planning' ? (
            <>
              <Button onClick={gotoToday} variant="outline" size="sm">Hoy</Button>
              <Button onClick={() => gotoWeek(-1)} variant="outline" size="icon">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button onClick={() => gotoWeek(1)} variant="outline" size="icon">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : view === 'mes' ? (
            <>
              <span className="text-sm font-semibold px-2 min-w-[110px] text-center">
                {new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(monthCursor)}
              </span>
              <Button
                onClick={() => { setMonthCursor(new Date()); gotoToday(); }}
                variant="outline"
                size="sm"
              >
                Hoy
              </Button>
              <Button
                onClick={() => setMonthCursor((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
                variant="outline"
                size="icon"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setMonthCursor((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
                variant="outline"
                size="icon"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button onClick={loadOperations} variant="outline" size="sm" disabled={opsLoading}>
              {opsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refrescar'}
            </Button>
          )}
        </div>
      </div>

      {view === 'planning' && (
        <>
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
                const layoutBlocks = layout.get(unit.id) || [];
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
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground">{layoutBlocks.length} res.</span>
                          <button
                            type="button"
                            title="Bloquear fechas de esta unidad"
                            onClick={() => openBlockForm(unit)}
                            className="rounded p-1 text-muted-foreground hover:bg-amber-100 hover:text-amber-700"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
                      {layoutBlocks.map((block, i) => {
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
                      {blocks.filter((b) => b.unitId === unit.id && b.estado === 'activo').map((block) => {
                        // El bloqueo usa [fechaInicio, fechaFin): el checkout no se bloquea.
                        const first = days.findIndex((d) => d.key >= block.fechaInicio);
                        const end = days.findIndex((d) => d.key >= block.fechaFin);
                        const startCol = first < 0 ? days.length : first;
                        const endCol = end < 0 ? days.length : end;
                        if (endCol <= 0 || startCol >= days.length || endCol <= startCol) return null;
                        return (
                          <button
                            key={`block-${block.id}`}
                            type="button"
                            onClick={() => deleteBlock(block)}
                            className="z-20 rounded-md border px-2 py-1 text-left text-[11px] shadow-sm hover:brightness-95"
                            style={{
                              gridColumn: `${startCol + 1} / span ${Math.max(1, endCol - startCol)}`,
                              gridRow: 1,
                              marginLeft: 2,
                              marginRight: 2,
                              marginTop: 5,
                              marginBottom: 5,
                              borderColor: colorTipoBloqueo(block.tipo),
                              backgroundColor: `${colorTipoBloqueo(block.tipo)}1f`,
                              color: colorTipoBloqueo(block.tipo),
                            }}
                            title={`Bloqueo: ${etiquetaTipoBloqueo(block.tipo)} · pulsa para eliminar`}
                          >
                            <div className="flex items-center gap-1 truncate font-medium">
                              <Ban className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {etiquetaTipoBloqueo(block.tipo)}
                                {block.motivo ? ` · ${block.motivo}` : ''}
                              </span>
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
        </>
      )}

      {/* Vista Mes */}
      {view === 'mes' && (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 gap-1">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">
                  {d}
                </div>
              ))}
              {monthGrid.days.map((d) => {
                const dayRes = occupancy.get(d.key) || [];
                const isCurrentMonth = d.date.getMonth() === monthCursor.getMonth();
                return (
                  <button
                    key={d.key}
                    onClick={() => { setView('planning'); setRangeStart(startOfDay(d.date)); }}
                    className={`min-h-[84px] rounded-lg border p-1.5 text-left flex flex-col gap-0.5 transition-colors hover:border-primary/50 ${
                      d.isToday ? 'border-primary bg-primary/5' : 'border-border'
                    } ${isCurrentMonth ? '' : 'opacity-40'}`}
                  >
                    <p className={`text-[11px] font-semibold ${d.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {d.date.getDate()}
                    </p>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayRes.slice(0, 3).map((r) => (
                        <span
                          key={r.id}
                          className="text-[10px] leading-tight truncate rounded px-1 py-px text-white"
                          style={{ backgroundColor: channelStyle(r.channel).color }}
                        >
                          {r.guestName}
                        </span>
                      ))}
                      {dayRes.length > 3 && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          +{dayRes.length - 3} más
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vista Operaciones (Operations Board) */}
      {view === 'operaciones' && (
        <OperationsBoard
          ops={ops}
          loading={opsLoading}
          onRefresh={loadOperations}
          onSelectReservation={(r) => setSelected(r as any)}
          onCheck={runCheck}
        />
      )}

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

              {/* Acciones operativas (§18) */}
              {selected.estado === 'confirmed' && (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    disabled={checking?.id === selected.id}
                    onClick={() => runCheck(selected, 'checkin')}
                  >
                    {checking?.id === selected.id && checking.tipo === 'checkin' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Registrar check-in
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={checking?.id === selected.id}
                    onClick={() => runCheck(selected, 'checkout')}
                  >
                    {checking?.id === selected.id && checking.tipo === 'checkout' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Registrar check-out
                  </Button>
                </div>
              )}
              {selected.estado === 'checked_in' && (
                <Button
                  className="w-full"
                  disabled={checking?.id === selected.id}
                  onClick={() => runCheck(selected, 'checkout')}
                >
                  {checking?.id === selected.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1" />
                  )}
                  Registrar check-out · limpieza automática
                </Button>
              )}

              {/* Tareas desde la reserva */}
              {selected.estado !== 'cancelled' && (
                <div className="pt-1 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Tareas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTaskForm('cleaning')}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Limpieza
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTaskForm('maintenance')}
                    >
                      <Wrench className="h-3.5 w-3.5 mr-1" />
                      Mantenimiento
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Formulario de tarea desde la reserva */}
          {taskForm?.open && (
            <div className="absolute right-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-950 border-t shadow-2xl rounded-t-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  {taskForm.tipo === 'cleaning' ? <Sparkles className="h-4 w-4 text-primary" /> : <Wrench className="h-4 w-4 text-primary" />}
                  {taskForm.tipo === 'cleaning' ? 'Nueva tarea de limpieza' : 'Nueva incidencia'}
                </h4>
                <button onClick={() => setTaskForm(null)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Unidad</label>
                <select
                  value={taskForm.unitId}
                  onChange={(e) => setTaskForm((f) => (f ? { ...f, unitId: e.target.value } : f))}
                  className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Selecciona una unidad</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>
              {taskForm.tipo === 'maintenance' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Incidencia *</label>
                  <input
                    value={taskFields.incidencia}
                    onChange={(e) => setTaskFields((f) => ({ ...f, incidencia: e.target.value }))}
                    placeholder="Ej: Fuga en la ducha del baño principal"
                    className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Prioridad</label>
                  <select
                    value={taskFields.prioridad}
                    onChange={(e) => setTaskFields((f) => ({ ...f, prioridad: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Normal / Media</option>
                    {taskForm.tipo === 'cleaning' ? (
                      <>
                        <option value="baja">Baja</option>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                      </>
                    ) : (
                      <>
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                        <option value="critica">Crítica</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  value={taskFields.notas}
                  onChange={(e) => setTaskFields((f) => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  placeholder={taskForm.tipo === 'cleaning' ? 'Ej: Limpieza profunda tras check-out' : 'Detalles adicionales'}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setTaskForm(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={createTaskFromReservation} disabled={taskSaving}>
                  {taskSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Crear
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {blockForm?.open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-dialog-title"
          onClick={() => setBlockForm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="block-dialog-title" className="flex items-center gap-2 text-lg font-semibold">
                  <Ban className="h-5 w-5 text-amber-600" /> Bloquear unidad
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{blockForm.unitNombre}</p>
              </div>
              <button type="button" onClick={() => setBlockForm(null)} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="font-medium">Desde</span>
                <input
                  type="date"
                  value={blockForm.fechaInicio}
                  onChange={(event) => setBlockForm((form) => form ? { ...form, fechaInicio: event.target.value } : form)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="font-medium">Hasta (sin incluir)</span>
                <input
                  type="date"
                  value={blockForm.fechaFin}
                  onChange={(event) => setBlockForm((form) => form ? { ...form, fechaFin: event.target.value } : form)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="font-medium">Tipo de bloqueo</span>
              <select
                value={blockForm.tipo}
                onChange={(event) =>
                  setBlockForm((form) =>
                    form ? { ...form, tipo: event.target.value as TipoBloqueo } : form
                  )
                }
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {TIPOS_BLOQUEO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {PRESENTACION_BLOQUEO[tipo].etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium">Motivo (opcional)</span>
              <input
                value={blockForm.motivo}
                onChange={(event) => setBlockForm((form) => form ? { ...form, motivo: event.target.value } : form)}
                placeholder="Mantenimiento, uso del propietario..."
                maxLength={500}
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              El intervalo no estará disponible para reservas y se enviará al canal conectado.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBlockForm(null)}>Cancelar</Button>
              <Button type="button" onClick={createBlock} disabled={blockSaving}>
                {blockSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Crear bloqueo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Operations Board (plan maestro §19) ─────────────────────────────────── */
interface OperationsBoardProps {
  ops: any;
  loading: boolean;
  onRefresh: () => void;
  onSelectReservation: (r: any) => void;
  onCheck: (r: CalendarReservation, tipo: 'checkin' | 'checkout') => void;
}

const CLEANING_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En proceso',
  completed: 'Completada',
  blocked: 'Bloqueada',
};

const CLEANING_DOT: Record<string, string> = {
  pending: 'bg-amber-400',
  in_progress: 'bg-blue-500',
  completed: 'bg-emerald-500',
  blocked: 'bg-red-500',
};

const MAINT_LABEL: Record<string, string> = {
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
};

const MAINT_DOT: Record<string, string> = {
  abierta: 'bg-red-500',
  en_proceso: 'bg-blue-500',
  resuelta: 'bg-emerald-500',
  cerrada: 'bg-slate-400',
};

const PRIORITY_DOT: Record<string, string> = {
  baja: 'bg-slate-400',
  normal: 'bg-blue-400',
  media: 'bg-amber-400',
  alta: 'bg-orange-500',
  critica: 'bg-red-600',
};

function OperationsBoard({ ops, loading, onRefresh, onSelectReservation, onCheck }: OperationsBoardProps) {
  const [newTask, setNewTask] = useState<{ open: boolean; tipo: 'cleaning' | 'maintenance' }>({ open: false, tipo: 'cleaning' });
  const [form, setForm] = useState({ unitId: '', prioridad: '', responsable: '', notas: '', incidencia: '' });
  const [saving, setSaving] = useState(false);

  if (loading && !ops) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!ops) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted-foreground">No se pudieron cargar las operaciones.</p>
          <Button onClick={onRefresh} variant="outline" size="sm" className="mt-3">Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  const changeTask = async (tipo: 'cleaning' | 'maintenance', id: string, estado: string) => {
    try {
      const res = await fetch(`/api/hospitality/tasks?tipo=${tipo}&id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (res.ok) {
        toast.success('Estado actualizado');
        onRefresh();
      } else {
        toast.error('No se pudo actualizar el estado');
      }
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const deleteTask = async (tipo: 'cleaning' | 'maintenance', id: string) => {
    try {
      const res = await fetch(`/api/hospitality/tasks?tipo=${tipo}&id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Tarea eliminada');
        onRefresh();
      } else {
        toast.error('No se pudo eliminar');
      }
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const createTask = async () => {
    if (!form.unitId) {
      toast.error('Selecciona una unidad');
      return;
    }
    if (newTask.tipo === 'maintenance' && !form.incidencia.trim()) {
      toast.error('Describe la incidencia');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/hospitality/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: newTask.tipo,
          unitId: form.unitId,
          prioridad: form.prioridad || undefined,
          responsable: form.responsable || undefined,
          notas: form.notas || undefined,
          incidencia: newTask.tipo === 'maintenance' ? form.incidencia : undefined,
        }),
      });
      if (res.ok) {
        toast.success(newTask.tipo === 'cleaning' ? 'Tarea de limpieza creada' : 'Incidencia registrada');
        setNewTask({ open: false, tipo: 'cleaning' });
        setForm({ unitId: '', prioridad: '', responsable: '', notas: '', incidencia: '' });
        onRefresh();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'No se pudo crear');
      }
    } catch {
      toast.error('Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const activeUnits = (ops.unidades || []).filter((u: any) => u.estadoOperativo === 'occupied').length;
  const availableUnits = (ops.unidades || []).filter((u: any) => u.estadoOperativo === 'available').length;
  const cleaningUnits = (ops.unidades || []).filter((u: any) =>
    ['cleaning', 'dirty'].includes(u.estadoOperativo)
  ).length;
  const maintUnits = (ops.unidades || []).filter((u: any) =>
    ['maintenance', 'out_of_service'].includes(u.estadoOperativo)
  ).length;

  return (
    <div className="space-y-4">
      {/* KPIs de unidades */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{activeUnits}</p>
            <p className="text-xs text-muted-foreground">Ocupadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{availableUnits}</p>
            <p className="text-xs text-muted-foreground">Disponibles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{cleaningUnits}</p>
            <p className="text-xs text-muted-foreground">En limpieza</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{maintUnits}</p>
            <p className="text-xs text-muted-foreground">Mantenimiento</p>
          </CardContent>
        </Card>
      </div>

      {/* Llegadas y salidas de hoy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Llegadas hoy ({ops.llegadasHoy?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ops.llegadasHoy?.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin llegadas hoy</p>
            )}
            {ops.llegadasHoy?.map((r: any) => (
              <div key={r.id} className="rounded-lg border p-2 hover:bg-muted/50 transition-colors">
                <button onClick={() => onSelectReservation(r)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{r.guestName}</p>
                    <span
                      className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5 shrink-0"
                      style={{ backgroundColor: channelStyle(r.channel).color }}
                    >
                      {channelStyle(r.channel).label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.unit?.nombre || 'Sin unidad'} · {r.externalBookingId}
                  </p>
                </button>
                <Button size="sm" variant="outline" className="mt-1.5 w-full" onClick={() => onCheck({ ...r, unitId: r.unit?.id || null, unitNombre: r.unit?.nombre || null }, 'checkin')}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Registrar check-in
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <XCircle className="h-4 w-4" /> Salidas hoy ({ops.salidasHoy?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ops.salidasHoy?.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin salidas hoy</p>
            )}
            {ops.salidasHoy?.map((r: any) => (
              <div key={r.id} className="rounded-lg border p-2 hover:bg-muted/50 transition-colors">
                <button onClick={() => onSelectReservation(r)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{r.guestName}</p>
                    <span
                      className="text-[10px] font-semibold text-white rounded px-1.5 py-0.5 shrink-0"
                      style={{ backgroundColor: channelStyle(r.channel).color }}
                    >
                      {channelStyle(r.channel).label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.unit?.nombre || 'Sin unidad'} · {r.externalBookingId}
                  </p>
                </button>
                <Button size="sm" variant="outline" className="mt-1.5 w-full" onClick={() => onCheck({ ...r, unitId: r.unit?.id || null, unitNombre: r.unit?.nombre || null }, 'checkout')}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Registrar check-out · limpieza
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Limpieza */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Limpieza ({ops.limpieza?.length || 0})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setNewTask({ open: true, tipo: 'cleaning' })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nueva
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {ops.limpieza?.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin tareas de limpieza pendientes</p>
          )}
          {ops.limpieza?.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${CLEANING_DOT[t.estado] || 'bg-slate-400'}`} />
                  <p className="text-sm font-medium truncate">{t.unit?.nombre || 'Unidad'}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {CLEANING_LABEL[t.estado] || t.estado}
                  </span>
                </div>
                {t.notas && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.notas}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {t.estado !== 'completed' ? (
                  <Button size="sm" variant="outline" onClick={() => changeTask('cleaning', t.id, 'completed')}>
                    Completar
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" onClick={() => deleteTask('cleaning', t.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Mantenimiento */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" /> Mantenimiento ({ops.mantenimiento?.length || 0})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setNewTask({ open: true, tipo: 'maintenance' })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nueva
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {ops.mantenimiento?.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin incidencias abiertas</p>
          )}
          {ops.mantenimiento?.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${MAINT_DOT[t.estado] || 'bg-slate-400'}`} />
                  <p className="text-sm font-medium truncate">{t.incidencia}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {MAINT_LABEL[t.estado] || t.estado}
                  </span>
                  {t.prioridad !== 'media' && (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[t.prioridad] || ''}`} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {t.unit?.nombre || 'Unidad'}
                  {t.descripcion ? ` · ${t.descripcion}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {t.estado === 'abierta' ? (
                  <Button size="sm" variant="outline" onClick={() => changeTask('maintenance', t.id, 'en_proceso')}>
                    Iniciar
                  </Button>
                ) : null}
                {t.estado === 'en_proceso' ? (
                  <Button size="sm" variant="outline" onClick={() => changeTask('maintenance', t.id, 'resuelta')}>
                    Resolver
                  </Button>
                ) : null}
                <Button size="icon" variant="ghost" onClick={() => deleteTask('maintenance', t.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Diálogo nueva tarea */}
      {newTask.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNewTask({ open: false, tipo: 'cleaning' })}>
          <div
            className="bg-white dark:bg-slate-950 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                {newTask.tipo === 'cleaning' ? <Sparkles className="h-4 w-4 text-primary" /> : <Wrench className="h-4 w-4 text-primary" />}
                {newTask.tipo === 'cleaning' ? 'Nueva tarea de limpieza' : 'Nueva incidencia de mantenimiento'}
              </h3>
              <button onClick={() => setNewTask({ open: false, tipo: 'cleaning' })} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Unidad</label>
                <select
                  value={form.unitId}
                  onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Selecciona una unidad</option>
                  {(ops.unidades || []).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>
              {newTask.tipo === 'maintenance' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Incidencia *</label>
                  <input
                    value={form.incidencia}
                    onChange={(e) => setForm((f) => ({ ...f, incidencia: e.target.value }))}
                    placeholder="Ej: Fuga en la ducha del baño principal"
                    className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Normal / Media</option>
                    {newTask.tipo === 'cleaning' ? (
                      <>
                        <option value="baja">Baja</option>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                      </>
                    ) : (
                      <>
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                        <option value="critica">Crítica</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Responsable</label>
                  <input
                    value={form.responsable}
                    onChange={(e) => setForm((f) => ({ ...f, responsable: e.target.value }))}
                    placeholder="Nombre"
                    className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                  rows={2}
                  placeholder={newTask.tipo === 'cleaning' ? 'Ej: Limpieza profunda tras check-out' : 'Detalles adicionales'}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewTask({ open: false, tipo: 'cleaning' })}>
                Cancelar
              </Button>
              <Button size="sm" onClick={createTask} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Crear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

