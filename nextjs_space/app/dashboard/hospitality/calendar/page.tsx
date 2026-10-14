'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { capacidadDeTarea } from '@/lib/hospitality/capacidades';
import { toast } from 'sonner';
import {
  accionBloqueo,
  colorTipoBloqueo,
  esBloqueoActivo,
  etiquetaTipoBloqueo,
  LONGITUD_MAXIMA_MOTIVO,
  normalizarTipoBloqueo,
  PRESENTACION_BLOQUEO,
  RAZONES_BLOQUEO,
  TIPOS_BLOQUEO,
  type EstadoBloqueo,
  type TipoBloqueo,
} from '@/lib/hospitality/block-types';
import {
  choquesParaRespuesta,
  mensajeConflictoBloqueo,
  type ChoqueBloqueo,
} from '@/lib/hospitality/bloqueos-conflicto';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  User,
  Users,
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
  Unlock,
} from 'lucide-react';
import {
  buildDays,
  layoutReservations,
  nightsBetween,
  channelStyle,
  statusLabel,
  currentWeekRange,
  buildMonthGrid,
  fechaDeIso,
  occupancyByDay,
  startOfDay,
  toIsoDate,
  type CalendarReservation,
  type CalendarUnit,
  type CalendarDay,
} from '@/lib/hospitality/calendar';
import { finEstanciaReal } from '@/lib/hospitality/checkout';
import { tarifaPorNoche } from '@/lib/hospitality/estacionalidad';
import { formatearImporte } from '@/lib/moneda';

interface Property {
  id: string;
  nombre: string;
}

/** Foto de propiedad tal como vive en el Json `fotos` (string u objeto). */
interface PropertyFoto {
  url?: unknown;
}

/** Plan de tarifa tal como lo devuelve `/api/hospitality/rateplans`. */
interface RatePlan {
  id: string;
  unitId: string;
  propertyId: string;
  tarifa: number;
  moneda: string;
  activo: boolean;
  temporadas?: unknown;
  finDeSemana?: unknown;
}

/** Primera URL válida del Json `fotos` (portada de la fila del planning). */
function fotoPortada(fotos: unknown): string | null {
  if (!Array.isArray(fotos)) return null;
  for (const f of fotos as PropertyFoto[]) {
    if (typeof f === 'string' && f) return f;
    if (f && typeof f === 'object' && typeof f.url === 'string' && f.url) return f.url;
  }
  return null;
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
  checkOutReal?: string | null;
  amountAfterTax: number | null;
  currency: string | null;
  specialRequests: string | null;
  externalBookingId: string;
  guestData?: any;
  contact?: { id: string; nombre: string | null; email: string | null; telefono: string | null } | null;
  unit?: { id: string; nombre: string; codigo: string | null } | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Ventana del listado de bloqueos: lo liberado hace poco —que es lo que se
 * reactiva— y el año de venta por delante. La rejilla pide la UNIÓN de esta
 * ventana con la semana visible, así que un bloqueo del mes que viene se puede
 * abrir desde el listado aunque no esté en la semana que se está mirando.
 */
const BLOQUEOS_ATRAS_MS = 30 * DIA_MS;
const BLOQUEOS_ADELANTE_MS = 365 * DIA_MS;

function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

export default function HospitalityCalendar() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyFotos, setPropertyFotos] = useState<Record<string, string | null>>({});
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
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
  // Bloqueo abierto en el detalle: desde ahí se libera, se reactiva o se borra.
  const [blockDetail, setBlockDetail] = useState<ManualBlock | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  // Reservas que impiden cerrar las fechas que el operador está mirando. Se
  // limpia al abrir cualquier diálogo: un aviso de un intento anterior no puede
  // quedarse pegado a otro bloqueo.
  const [bloqueoConflicto, setBloqueoConflicto] = useState<ChoqueBloqueo[] | null>(null);

  const rangeEnd = useMemo(() => new Date(rangeStart.getTime() + 6 * 24 * 60 * 60 * 1000), [rangeStart]);

  const loadBase = useCallback(async () => {
    try {
      const [propRes, unitRes] = await Promise.all([
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
      ]);
      if (propRes.ok) {
        const d = await propRes.json();
        const lista: any[] = d.properties || [];
        setProperties(lista.map((p) => ({ id: p.id, nombre: p.nombre })));
        setPropertyFotos(
          Object.fromEntries(lista.map((p) => [p.id, fotoPortada(p.fotos)]))
        );
      }
      if (unitRes.ok) {
        const d = await unitRes.json();
        setUnits((d.units || []).map((u: any) => ({
          id: u.id,
          nombre: u.nombre,
          codigo: u.codigo,
          propertyId: u.propertyId,
          capacidad: u.capacidad,
          tarifaBase: u.tarifaBase,
          moneda: u.moneda,
        })));
      }
      // Planes de tarifa activos: el precio por día del planning usa el MISMO
      // plan que el booking engine (el más barato activo de la unidad).
      const rateRes = await fetch('/api/hospitality/rateplans?activo=true');
      if (rateRes.ok) {
        const d = await rateRes.json();
        setRatePlans(d.ratePlans || []);
      }
    } catch {
      toast.error('Error al cargar propiedades y unidades');
    }
  }, []);

  const loadBlocks = useCallback(async () => {
    try {
      const ahora = Date.now();
      const params = new URLSearchParams({
        from: toIsoDate(new Date(Math.min(rangeStart.getTime(), ahora - BLOQUEOS_ATRAS_MS))),
        to: toIsoDate(new Date(Math.max(rangeStart.getTime() + 8 * DIA_MS, ahora + BLOQUEOS_ADELANTE_MS))),
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
        checkOutReal: r.checkOutReal ? new Date(r.checkOutReal) : null,
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

  // Precio por día por unidad: plan activo más barato (misma convención que
  // el booking engine) + tarifaPorNoche para estacionalidad/fin de semana.
  const preciosPorDia = useMemo(() => {
    const mapa = new Map<string, Map<string, { precio: number; moneda: string }>>();
    for (const u of visibleUnits) {
      const planes = ratePlans.filter((p) => p.unitId === u.id);
      const plan =
        planes.slice().sort((a, b) => a.tarifa - b.tarifa)[0] ?? null;
      const porDia = new Map<string, { precio: number; moneda: string }>();
      if (plan || (u.tarifaBase ?? 0) > 0) {
        for (const d of days) {
          const precio = tarifaPorNoche({
            fecha: d.date,
            tarifaBase: u.tarifaBase,
            plan: plan ? { tarifa: plan.tarifa, estacionalidad: plan.temporadas ?? plan.finDeSemana } : null,
          });
          if (precio != null) {
            porDia.set(d.key, { precio, moneda: plan?.moneda || u.moneda || '' });
          }
        }
      }
      mapa.set(u.id, porDia);
    }
    return mapa;
  }, [visibleUnits, ratePlans, days]);

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

  // La salida se anuncia el día del fin REAL de la estancia
  // (`finEstanciaReal` = min(checkOut, checkOutReal), módulo checkout): con
  // salida anticipada no se anuncia días después de que el huésped ya se
  // fue. La llegada no cambia (no hay checkInReal).
  const todayDepartures = useMemo(() => {
    return reservations.filter(
      (r) => r.estado !== 'cancelled' && toIsoDate(finEstanciaReal(r.checkOut, r.checkOutReal)) === todayKey
    );
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
    const fin = toIsoDate(new Date(rangeStart.getTime() + 2 * DIA_MS));
    setBloqueoConflicto(null);
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
    // La razón es obligatoria: es lo que queda escrito junto a las fechas.
    if (!blockForm.motivo.trim()) {
      toast.error('Escribe el motivo: queda registrado con las fechas y se ve en el calendario');
      return;
    }
    // Aviso previo con las reservas que ya están cargadas en pantalla. El
    // servidor vuelve a comprobarlo —es la autoridad—; esto solo evita el viaje
    // cuando el choque ya se ve.
    if (choquesDelFormulario.length > 0) {
      setBloqueoConflicto(choquesDelFormulario);
      toast.error(mensajeConflictoBloqueo(choquesDelFormulario));
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
          motivo: blockForm.motivo.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Si el servidor conoce choques que la pantalla no tenía (una reserva
        // fuera de la semana visible), se enseñan con su detalle.
        if (Array.isArray(data.conflicto)) setBloqueoConflicto(data.conflicto);
        throw new Error(data.error || 'No se pudo crear el bloqueo');
      }
      toast.success('Bloqueo creado y disponibilidad sincronizada');
      setBloqueoConflicto(null);
      setBlockForm(null);
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear bloqueo');
    } finally {
      setBlockSaving(false);
    }
  };

  /**
   * Abrir el detalle de un bloqueo (desde la rejilla o desde el listado). El
   * aviso de choque de un intento anterior no viaja con él.
   */
  const abrirDetalleBloqueo = (block: ManualBlock) => {
    setBloqueoConflicto(null);
    setBlockDetail(block);
  };

  /**
   * Liberar y reactivar son la MISMA llamada: el `estado` de destino del PATCH.
   * El servidor empuja la propiedad al canal, así que el calendario que ve la
   * OTA se reabre (o se cierra) en el mismo acto. Liberar no borra la fila: el
   * motivo y el tipo se conservan para poder reactivarla sin volver a escribirla.
   */
  const cambiarEstadoBloqueo = async (block: ManualBlock, destino: EstadoBloqueo) => {
    setBlockBusy(true);
    try {
      const res = await fetch(`/api/hospitality/blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: destino }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Reactivar sobre noches vendidas: el servidor devuelve las reservas
        // que están en medio para poder enseñarlas.
        if (Array.isArray(data.conflicto)) setBloqueoConflicto(data.conflicto);
        throw new Error(data.error || 'No se pudo actualizar el bloqueo');
      }
      setBloqueoConflicto(null);
      toast.success(
        destino === 'cancelado'
          ? 'Fechas liberadas: vuelven a estar disponibles'
          : 'Fechas bloqueadas otra vez y sincronizadas'
      );
      setBlockDetail(null);
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar el bloqueo');
    } finally {
      setBlockBusy(false);
    }
  };

  const deleteBlock = async (block: ManualBlock) => {
    if (!window.confirm(`¿Eliminar el bloqueo de ${block.unit?.nombre || 'la unidad'}? Se pierde el motivo y no se podrá reactivar.`)) return;
    try {
      const res = await fetch(`/api/hospitality/blocks/${block.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el bloqueo');
      toast.success('Bloqueo eliminado y disponibilidad sincronizada');
      setBlockDetail(null);
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar bloqueo');
    }
  };

  // Listado de gestión: primero lo que cierra fechas hoy, después lo liberado
  // —que es justo lo que se reactiva— y, dentro de cada grupo, por fecha.
  const bloqueosLista = useMemo(() => {
    const hoy = toIsoDate(new Date());
    return blocks
      .filter((b) => b.fechaFin > hoy)
      .slice()
      .sort((a, b) => {
        const grupoA = esBloqueoActivo(a.estado) ? 0 : 1;
        const grupoB = esBloqueoActivo(b.estado) ? 0 : 1;
        if (grupoA !== grupoB) return grupoA - grupoB;
        return a.fechaInicio.localeCompare(b.fechaInicio);
      });
  }, [blocks]);

  /**
   * Aviso previo del choque con reservas, con las que ya están cargadas en
   * pantalla. Usa la MISMA regla pura que el servidor (`choquesParaRespuesta`),
   * así que si aquí sale un choque, la API lo confirmaría; y si aquí no sale,
   * el servidor sigue siendo quien decide (puede haber reservas fuera de la
   * semana y rango que se está mirando).
   */
  const choquesDelFormulario = useMemo(() => {
    if (!blockForm?.open) return [];
    const inicio = fechaDeIso(blockForm.fechaInicio);
    const fin = fechaDeIso(blockForm.fechaFin);
    if (!inicio || !fin || fin.getTime() <= inicio.getTime()) return [];
    return choquesParaRespuesta(
      reservations
        .filter((r) => r.unitId === blockForm.unitId)
        .map((r) => ({
          id: r.id,
          estado: r.estado,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          checkOutReal: r.checkOutReal,
          channel: r.channel,
          externalBookingId: r.externalBookingId,
          huesped: r.guestName,
        })),
      inicio,
      fin
    );
  }, [blockForm, reservations]);

  // Lo que enseña el diálogo: lo que el servidor ya confirmó (es la verdad) o,
  // si aún no se ha intentado, el aviso previo de la pantalla.
  const choquesVisibles = bloqueoConflicto ?? choquesDelFormulario;
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

  // ─── Cobro de la reserva seleccionada (Pagado / Pendiente / Total) ──────────
  // La API de pagos exige `finanzas.ver`: si el rol del operador no la tiene
  // (403) o falla, el bloque simplemente no se pinta y queda el importe simple.
  const [cobro, setCobro] = useState<{ cobrado: number; totalLineas: number | null } | null>(null);
  useEffect(() => {
    setCobro(null);
    if (!selected) return;
    let cancelada = false;
    (async () => {
      try {
        const res = await fetch(`/api/hospitality/reservations/${selected.id}/payments`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelada) {
          setCobro({ cobrado: Number(data.cobrado) || 0, totalLineas: data.totalLineas ?? null });
        }
      } catch {
        // Sin bloque financiero: el panel sigue siendo útil sin él.
      }
    })();
    return () => {
      cancelada = true;
    };
  }, [selected?.id]);

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
                    d.isToday ? 'bg-primary/10' : d.isPast ? 'bg-muted/60' : d.isWeekend ? 'bg-muted/40' : ''
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
                        <div className="flex min-w-0 items-center gap-2">
                          {propertyFotos[unit.propertyId] && (
                            <img
                              src={propertyFotos[unit.propertyId]!}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{unit.nombre}</p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              {unit.codigo && <span className="truncate">{unit.codigo}</span>}
                              {unit.codigo && ' · '}
                              <Users className="h-3 w-3 shrink-0" /> {unit.capacidad ?? '—'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground">{layoutBlocks.length} res.</span>
                          <button
                            type="button"
                            title="Bloquear fechas de esta unidad"
                            onClick={() => openBlockForm(unit)}
                            className="rounded-md border border-amber-300/70 p-1 text-amber-700 hover:bg-amber-100 dark:border-amber-800/70 dark:text-amber-400 dark:hover:bg-amber-950/40"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {days.map((d) => (
                        <div
                          key={d.key}
                          className={`border-r last:border-r-0 ${
                            d.isToday ? 'bg-primary/5' : d.isPast ? 'bg-muted/60' : d.isWeekend ? 'bg-muted/30' : ''
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
                      {/* Precios por día en celdas libres (día futuro): la fila
                          ocupa la franja inferior de la celda, como el benchmark. */}
                      {days.map((d) => {
                        if (d.isPast) return null;
                        const precioDia = preciosPorDia.get(unit.id)?.get(d.key);
                        if (!precioDia) return null;
                        return (
                          <span
                            key={`precio-${d.key}`}
                            className="pointer-events-none absolute bottom-0.5 left-1 text-[10px] font-semibold text-muted-foreground"
                            style={{
                              gridColumn: `${days.findIndex((x) => x.key === d.key) + 1} / span 1`,
                              gridRow: 1,
                            }}
                          >
                            {formatearImporte(precioDia.precio, precioDia.moneda, 0)}
                          </span>
                        );
                      })}
                      {/* Bloqueos manuales — los activos con el color de su tipo y
                          los ya liberados en trazo discontinuo. Los dos se ven, y
                          se pueden abrir, porque un bloqueo liberado es lo que hay
                          que reactivar, y uno invisible no se puede reactivar. */}
                      {blocks.filter((b) => b.unitId === unit.id).map((block) => {
                        const activo = esBloqueoActivo(block.estado);
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
                            onClick={() => abrirDetalleBloqueo(block)}
                            className={`z-20 rounded-md border px-2 py-1 text-left text-[11px] shadow-sm hover:brightness-95 ${
                              activo ? '' : 'border-dashed border-muted-foreground/50 text-muted-foreground opacity-70'
                            }`}
                            style={{
                              gridColumn: `${startCol + 1} / span ${Math.max(1, endCol - startCol)}`,
                              gridRow: 1,
                              marginLeft: 2,
                              marginRight: 2,
                              marginTop: 5,
                              marginBottom: 5,
                              ...(activo
                                ? {
                                    borderColor: colorTipoBloqueo(block.tipo),
                                    backgroundColor: `${colorTipoBloqueo(block.tipo)}1f`,
                                    color: colorTipoBloqueo(block.tipo),
                                  }
                                : {}),
                            }}
                            title={
                              activo
                                ? `Bloqueo: ${etiquetaTipoBloqueo(block.tipo)} · pulsa para liberar o eliminar`
                                : `Bloqueo liberado: ${etiquetaTipoBloqueo(block.tipo)} · pulsa para reactivar`
                            }
                          >
                            <div className="flex items-center gap-1 truncate font-medium">
                              {activo ? (
                                <Ban className="h-3 w-3 shrink-0" />
                              ) : (
                                <Unlock className="h-3 w-3 shrink-0" />
                              )}
                              <span className={`truncate ${activo ? '' : 'line-through'}`}>
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
          <span className="mx-2 border-l h-4" />
          <span className="font-semibold text-muted-foreground">Bloqueos:</span>
          {TIPOS_BLOQUEO.map((tipo) => (
            <span key={tipo} className="flex items-center gap-1.5">
              {/* Mismo aspecto que en la cuadrícula: fondo translúcido + borde del color del tipo. */}
              <span
                className="w-3 h-3 rounded-sm border"
                style={{
                  backgroundColor: `${PRESENTACION_BLOQUEO[tipo].color}1f`,
                  borderColor: PRESENTACION_BLOQUEO[tipo].color,
                }}
              />
              {PRESENTACION_BLOQUEO[tipo].etiqueta}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            {/* Liberado: trazo discontinuo gris, igual que en la cuadrícula. */}
            <span className="w-3 h-3 rounded-sm border border-dashed border-muted-foreground/50" />
            Liberado
          </span>
        </div>
      </Card>

      {/* Listado de bloqueos: lo que cierra fechas y lo liberado, cada uno con su
          acción. Existe porque un bloqueo fuera de la semana visible no está en
          la rejilla: sin este listado no habría forma de liberarlo ni de
          reactivarlo sin navegar hasta su semana. */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4 text-amber-600" />
            Bloqueos de fechas ({bloqueosLista.filter((b) => esBloqueoActivo(b.estado)).length} activos)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Uso del propietario, mantenimiento o cierre administrativo. Al <strong>liberar</strong> las
            fechas vuelven a estar disponibles en tu web y en los canales; al <strong>reactivar</strong> se
            cierran otra vez, con el mismo motivo, sin volver a crearlas.
          </p>
          {bloqueosLista.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              No hay bloqueos entre hoy y el próximo año. Usa el botón «Bloquear fechas» de la fila de
              una unidad en la cuadrícula de arriba.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {bloqueosLista.map((block) => {
                const activo = esBloqueoActivo(block.estado);
                const accion = accionBloqueo(block.estado);
                return (
                  <div key={block.id} className="flex flex-wrap items-center gap-2 p-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorTipoBloqueo(block.tipo) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${activo ? '' : 'text-muted-foreground line-through'}`}>
                        {block.unit?.nombre || 'Unidad'} · {etiquetaTipoBloqueo(block.tipo)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {block.fechaInicio} → {block.fechaFin}
                        {block.motivo ? ` · ${block.motivo}` : ''}
                        {activo ? '' : ' · liberado'}
                      </p>
                    </div>
                    <AccionHospitality capacidad="reservas.editar">
                      <Button
                        type="button"
                        size="sm"
                        variant={activo ? 'outline' : 'default'}
                        onClick={() => cambiarEstadoBloqueo(block, accion.destino)}
                        disabled={blockBusy}
                      >
                        {accion.etiqueta}
                      </Button>
                    </AccionHospitality>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
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

              {/* Cobro: Pagado / Pendiente / Total (como el benchmark); el
                  Total usa las líneas de la reserva (tarifa + extras) y cae al
                  importe del canal si aún no tiene líneas. */}
              {cobro && (() => {
                const total = cobro.totalLineas ?? selected.amountAfterTax ?? null;
                if (total == null) return null;
                const moneda = selected.currency || '';
                return (
                  <div className="rounded-lg border p-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pagado</p>
                        <p className="text-sm font-bold text-emerald-600">
                          {formatearImporte(cobro.cobrado, moneda, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pendiente</p>
                        <p className={`text-sm font-bold ${total - cobro.cobrado > 0.005 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {formatearImporte(total - cobro.cobrado, moneda, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                        <p className="text-sm font-bold">{formatearImporte(total, moneda, 0)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Importe simple (fallback sin permiso de finanzas) */}
              {!cobro && selected.amountAfterTax != null && (
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
                  <AccionHospitality capacidad="operaciones.checkin">
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
                  </AccionHospitality>
                  <AccionHospitality capacidad="operaciones.checkin">
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
                  </AccionHospitality>
                </div>
              )}
              {selected.estado === 'checked_in' && (
                <AccionHospitality capacidad="operaciones.checkin">
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
                </AccionHospitality>
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
                {/* La tarea puede ser limpieza o incidencia: el permiso lo
                    decide el tipo, con la misma regla que usa la API. */}
                <AccionHospitality capacidad={capacidadDeTarea(taskForm.tipo)}>
                  <Button size="sm" onClick={createTaskFromReservation} disabled={taskSaving}>
                    {taskSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Crear
                  </Button>
                </AccionHospitality>
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
              <span className="font-medium">Motivo (queda registrado)</span>
              <input
                value={blockForm.motivo}
                onChange={(event) => setBlockForm((form) => form ? { ...form, motivo: event.target.value } : form)}
                list="razones-bloqueo"
                placeholder={RAZONES_BLOQUEO[blockForm.tipo][0]}
                maxLength={LONGITUD_MAXIMA_MOTIVO}
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
              {/* Las razones frecuentes del tipo elegido: sugieren sin cerrar la
                  lista. Escribir «Visita de un familiar» o «Noches vendidas a
                  una empresa» es lo que hace que el cierre se entienda después. */}
              <datalist id="razones-bloqueo">
                {RAZONES_BLOQUEO[blockForm.tipo].map((razon) => (
                  <option key={razon} value={razon} />
                ))}
              </datalist>
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Escribe la razón con tus palabras: quien mire el calendario más adelante sabrá por qué esas
              noches estaban cerradas.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              El intervalo no estará disponible para reservas y se enviará al canal conectado. Las noches ya
              vendidas no se pueden cerrar.
            </p>
            {choquesVisibles.length > 0 && <AvisoConflictoBloqueo choques={choquesVisibles} />}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBlockForm(null)}>Cancelar</Button>
              <AccionHospitality capacidad="reservas.editar">
                <Button type="button" onClick={createBlock} disabled={blockSaving}>
                  {blockSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Crear bloqueo
                </Button>
              </AccionHospitality>
            </div>
          </div>
        </div>
      )}

      {/* Detalle del bloqueo: liberar (deja las fechas disponibles otra vez),
          reactivar (las cierra de nuevo) o eliminar la fila. */}
      {blockDetail && (() => {
        const activo = esBloqueoActivo(blockDetail.estado);
        const accion = accionBloqueo(blockDetail.estado);
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-detail-title"
            onClick={() => setBlockDetail(null)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 id="block-detail-title" className="flex items-center gap-2 text-lg font-semibold">
                    {activo ? <Ban className="h-5 w-5 text-amber-600" /> : <Unlock className="h-5 w-5 text-muted-foreground" />}
                    {activo ? 'Fechas bloqueadas' : 'Bloqueo liberado'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {blockDetail.unit?.nombre || 'Unidad'}
                  </p>
                </div>
                <button type="button" onClick={() => setBlockDetail(null)} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Cerrar">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-1.5 rounded-lg border p-3 text-sm">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                  {blockDetail.fechaInicio} → {blockDetail.fechaFin}
                  <span className="text-xs text-muted-foreground">(sin incluir)</span>
                </p>
                <p className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border"
                    style={{
                      backgroundColor: `${colorTipoBloqueo(blockDetail.tipo)}1f`,
                      borderColor: colorTipoBloqueo(blockDetail.tipo),
                    }}
                  />
                  {etiquetaTipoBloqueo(blockDetail.tipo)}
                </p>
                <p className="flex items-start gap-2">
                  <StickyNote className="h-4 w-4 shrink-0 text-primary" />
                  <span className={blockDetail.motivo ? '' : 'italic text-muted-foreground'}>
                    {blockDetail.motivo ||
                      'Sin motivo registrado (bloqueo anterior a que el motivo fuera obligatorio)'}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {activo
                    ? 'Estas noches están cerradas en tu web y en los canales.'
                    : 'Estas noches están otra vez a la venta; el bloqueo se conserva para poder reactivarlo.'}
                </p>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{accion.ayuda}</p>

              {blockDetail && bloqueoConflicto && bloqueoConflicto.length > 0 && (
                <AvisoConflictoBloqueo choques={bloqueoConflicto} />
              )}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <AccionHospitality capacidad="reservas.editar">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => deleteBlock(blockDetail)}
                    disabled={blockBusy}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Eliminar
                  </Button>
                </AccionHospitality>
                <AccionHospitality capacidad="reservas.editar">
                  <Button
                    type="button"
                    onClick={() => cambiarEstadoBloqueo(blockDetail, accion.destino)}
                    disabled={blockBusy}
                  >
                    {blockBusy ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : activo ? (
                      <Unlock className="mr-1 h-4 w-4" />
                    ) : (
                      <Ban className="mr-1 h-4 w-4" />
                    )}
                    {accion.etiqueta}
                  </Button>
                </AccionHospitality>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Aviso de choque con fechas ya contratadas ───────────────────────────── */

/**
 * Las reservas que impiden cerrar esas fechas, cada una con su estancia
 * completa (la de la reserva, que puede sobresalir del bloqueo que se intenta
 * crear): es lo que el operador necesita para decidir —liberarla, moverla o
 * bloquear solo las noches libres—.
 *
 * El texto sale del módulo puro compartido con la API
 * (`mensajeConflictoBloqueo`), así que la pantalla y el servidor dicen
 * exactamente lo mismo.
 */
function AvisoConflictoBloqueo({ choques }: { choques: ChoqueBloqueo[] }) {
  if (choques.length === 0) return null;
  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Esas noches ya están vendidas
      </p>
      <p className="mt-1">{mensajeConflictoBloqueo(choques)}</p>
      <ul className="mt-2 space-y-0.5">
        {choques.map((choque) => (
          <li key={choque.id}>
            {choque.etiqueta} · {choque.desde} → {choque.hasta}
          </li>
        ))}
      </ul>
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
                  <AccionHospitality capacidad={capacidadDeTarea('cleaning')}>
                    <Button size="sm" variant="outline" onClick={() => changeTask('cleaning', t.id, 'completed')}>
                      Completar
                    </Button>
                  </AccionHospitality>
                ) : null}
                <AccionHospitality capacidad={capacidadDeTarea('cleaning')}>
                  <Button size="icon" variant="ghost" onClick={() => deleteTask('cleaning', t.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </AccionHospitality>
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
                  <AccionHospitality capacidad={capacidadDeTarea('maintenance')}>
                    <Button size="sm" variant="outline" onClick={() => changeTask('maintenance', t.id, 'en_proceso')}>
                      Iniciar
                    </Button>
                  </AccionHospitality>
                ) : null}
                {t.estado === 'en_proceso' ? (
                  <AccionHospitality capacidad={capacidadDeTarea('maintenance')}>
                    <Button size="sm" variant="outline" onClick={() => changeTask('maintenance', t.id, 'resuelta')}>
                      Resolver
                    </Button>
                  </AccionHospitality>
                ) : null}
                <AccionHospitality capacidad={capacidadDeTarea('maintenance')}>
                  <Button size="icon" variant="ghost" onClick={() => deleteTask('maintenance', t.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </AccionHospitality>
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
              <AccionHospitality capacidad={capacidadDeTarea(newTask.tipo)}>
                <Button size="sm" onClick={createTask} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Crear
                </Button>
              </AccionHospitality>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

