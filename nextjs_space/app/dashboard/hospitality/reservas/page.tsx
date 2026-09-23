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
  Link2,
  ShieldAlert,
  UserPlus,
  RefreshCw,
  Settings2,
  CloudOff,
  Download,
  Printer,
  PlaneLanding,
  PlaneTakeoff,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CompletarParteVijerosDialog } from '@/components/hospitality/completar-parte-viajeros-dialog';
import { etiquetasDeCampos } from '@/lib/hospitality/booking-i18n';
import {
  MAX_INTENTOS_PARTE,
  queCorregirElParte,
  type FalloDeParte,
  type RechazoDelParte,
} from '@/lib/hospitality/parte-rechazo';
import type { CampoViajero } from '@/lib/hospitality/guest-checkin';
import { nightsBetween } from '@/lib/hospitality/calendar';
import { diaLocalIso } from '@/lib/hospitality/reservas-csv';
import { resumenReservas } from '@/lib/hospitality/analytics';
import { POLITICAS_NO_SHOW, ETIQUETA_POLITICA_NO_SHOW } from '@/lib/hospitality/no-show';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { MONEDAS_SELECCIONABLES, formatearImporte, monedaEfectiva, primeraMoneda } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import { useCapacidadesHospitality } from '@/hooks/use-capacidades-hospitality';
import { capacidadDeCambioDeReserva } from '@/lib/hospitality/capacidades';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Link from 'next/link';

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
  /** Respuestas del huésped a las preguntas personalizadas del hotel
   *  ({preguntaId: valor}). Asunto del hotel: nunca viajan al parte MIR. */
  respuestasCheckin?: Record<string, string> | null;
  /** Estado del parte de viajeros (RD 933/2021) que calcula la API. */
  parteViajeros?: ParteDeViajeros | null;
}

/**
 * Lo que la API dice del parte de viajeros de una reserva.
 *
 * `faltan` es lo que impide emitirlo, en los nombres del formulario del
 * check-in (documento, fecha de nacimiento, dirección…): el aviso de esta
 * pantalla y el formulario del huésped hablan así de lo mismo.
 */
interface ParteDeViajeros {
  aplica: boolean;
  completo: boolean;
  /** Fichas de viajero guardadas: cero significa «no hay documentación». */
  viajeros: number;
  faltan: CampoViajero[];
  recomendados: CampoViajero[];
  estado: string | null;
  comunicada: boolean;
  /** El servicio rechazó el parte: hay algo que corregir, y no siempre es del huésped. */
  rechazado: boolean;
  rechazo: RechazoDelParte | null;
  /**
   * El parte NO llegó al Ministerio (caída, red, timeout). Es lo contrario de un
   * rechazo: el servicio no ha visto esos datos, así que no hay nada que
   * corregir en el formulario del huésped — se reintenta.
   */
  sinEntregar: boolean;
  fallo: FalloDeParte | null;
  /** Envíos intentados. */
  intentos: number;
  /** El barrido agotó sus intentos: ya no lo reintenta solo. */
  abandonado: boolean;
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

/**
 * Por qué no se emite (o no se factura) una penalización, en lenguaje de
 * operador. Los motivos son del módulo puro y del emisor; aquí solo se traducen.
 */
const MOTIVO_PENALIZACION: Record<string, string> = {
  politica_ninguna: 'La propiedad está configurada sin penalización por no-show.',
  canal_del_proveedor:
    'La reserva viene de un canal externo, que cobra su propia penalización: no se emite cargo para no cobrar dos veces.',
  sin_importe: 'La reserva no trae importe, así que no hay base para calcular la penalización.',
  sin_noches: 'La reserva no tiene noches, así que no hay base para calcular la penalización.',
  estado_no_es_no_show: 'Solo se emite penalización sobre una reserva marcada como no-show.',
  ya_emitida: 'La penalización ya estaba emitida.',
  sin_penalizacion: 'Esta reserva no tiene penalización emitida que facturar.',
  sin_contacto_fiscal:
    'El huésped no está vinculado al CRM: sin receptor fiscal el ERP no puede emitir la factura.',
};

/** Previsualización que devuelve GET /reservations/[id]/penalizacion. */
interface PenalizacionPreview {
  politica: string;
  noches: number;
  canalEmiteElCargo: boolean;
  previsto: {
    aplica: boolean;
    importe: number;
    nochesPenalizadas: number;
    concepto: string;
    motivo: string | null;
  };
  emitida: {
    id: string;
    concepto: string;
    importe: number;
    moneda: string;
    fecha: string;
    invoiceId: string | null;
    facturada: boolean;
  } | null;
}

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

function fmtFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

/**
 * ¿A esta reserva le faltan datos para el parte de viajeros?
 *
 * Tres condiciones, y las tres importan: el parte le corresponde (no es una
 * cancelada ni un no-show), no está ya aceptado por el Ministerio, y al
 * huésped le falta documentación. Lo decide el cálculo del servicio —las mismas
 * reglas del check-in—, no una lista paralela aquí.
 */
function faltaParteDeViajeros(r: Reservation): boolean {
  const parte = r.parteViajeros;
  return Boolean(parte?.aplica && !parte.completo && !parte.comunicada);
}

/**
 * ¿Es una llegada de HOY a la que aún le faltan datos del parte?
 *
 * Es el trabajo de recepción que NO puede esperar: el huésped llega hoy y el
 * Ministerio exige el documento (RD 933/2021) — una llegada sin parte se
 * pinta en rojo y se pone al principio de la lista, aunque el orden
 * cronológico la trajera más abajo. La ventana de «hoy» es la MISMA regla de
 * día local del módulo (la del planning y del CSV, `diaLocalIso`), y la
 * condición de «sin parte» es el mismo predicado del aviso — no hay una
 * segunda definición de nada.
 */
function llegaHoySinParte(r: Reservation, hoyIso: string): boolean {
  return diaLocalIso(r.checkIn) === hoyIso && faltaParteDeViajeros(r);
}

/**
 * ¿El servicio RECHAZÓ el parte de esta reserva?
 *
 * Es un aviso distinto del de «faltan datos», y por eso va aparte: aquí los
 * datos pueden estar completos y el problema estar en el dato o en la propia
 * configuración del hotel. Lo que no se mezcla es con lo aceptado: un parte
 * aceptado después de un rechazo no avisa de nada.
 */
function parteRechazado(r: Reservation): boolean {
  const parte = r.parteViajeros;
  return Boolean(parte?.aplica && parte.rechazado && !parte.comunicada);
}

/**
 * ¿El barrido ya se rindió con el parte de esta reserva?
 *
 * Importa decirlo: el producto reintenta un parte rechazado con esperas
 * crecientes (1h, 2h, 4h…) hasta un máximo de intentos, y cuando se agota **no
 * lo vuelve a intentar nadie** — si el hotel no lo pulsa, ese parte se queda
 * sin comunicar. Un aviso que no lo dijera estaría dejando creer que el
 * sistema sigue trabajando en ello.
 */
function parteAbandonadoSinReintento(r: Reservation): boolean {
  return (
    (parteRechazado(r) || parteSinEntregar(r)) && r.parteViajeros?.abandonado === true
  );
}

/**
 * ¿El parte no llegó al Ministerio?
 *
 * Es un aviso aparte del rechazo y del de «faltan datos», y por eso va con su
 * propio texto: aquí el Ministerio no ha visto el parte, así que mandar al
 * operador a corregir datos sería perder el tiempo —lo que toca es reintentar—.
 * Si el barrido ya se rindió, el aviso lo dice: entonces el reintento es del
 * hotel, no del producto.
 */
function parteSinEntregar(r: Reservation): boolean {
  const parte = r.parteViajeros;
  return Boolean(parte?.aplica && parte.sinEntregar && !parte.comunicada);
}

/** El motivo de la no-entrega, acotado para que quepa en una fila. */
function motivoDeLaNoEntrega(r: Reservation): string {
  const motivo = r.parteViajeros?.fallo?.motivo ?? '';
  return motivo.length > 80 ? `${motivo.slice(0, 80)}…` : motivo;
}

/**
 * Lo que le falta al huésped, con el nombre que le da el formulario del
 * check-in. Se acota a tres campos: el detalle completo está en el formulario.
 */
/**
 * Las respuestas del huésped a las preguntas del hotel, con el texto de la
 * pregunta (la reserva guarda el id). Asunto del hotel: no salen en el parte
 * oficial del Ministerio.
 */
function respuestasLegibles(r: Reservation, preguntas: Record<string, string>): string {
  const entradas = Object.entries(r.respuestasCheckin ?? {});
  if (entradas.length === 0) return '';
  return entradas
    .map(([id, valor]) => `${preguntas[id] ?? id}: ${valor}`)
    .join(' · ');
}

function camposQueFaltan(r: Reservation): string {
  const faltan = r.parteViajeros?.faltan ?? [];
  // Sin ninguna ficha de viajero no hay campos que listar: lo que falta es la
  // documentación entera (y decirlo así es más útil que una lista vacía).
  if (faltan.length === 0) return 'sin datos de ningún viajero';
  const etiquetas = etiquetasDeCampos(faltan.slice(0, 3), 'es');
  const resto = faltan.length - 3;
  return resto > 0 ? `${etiquetas} y ${resto} más` : etiquetas;
}

/**
 * El motivo del rechazo, acotado para que quepa en una fila.
 *
 * El texto completo —y el código— están en el aviso de cabecera y en el panel
 * del registro: aquí solo hace falta que el operador sepa que hay algo que
 * mirar en esa reserva.
 */
function motivoDelRechazo(r: Reservation): string {
  const motivo = r.parteViajeros?.rechazo?.motivo ?? '';
  return motivo.length > 80 ? `${motivo.slice(0, 80)}…` : motivo;
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
  // La divisa de una reserva nueva la resuelve la API con la moneda de reporte
  // del tenant; este formulario solo la enseña cuando ya hay una.
  moneda: '',
  notas: '',
};

export default function HospitalityReservasPage() {
  const { puede } = useCapacidadesHospitality();
  /** Moneda de reporte del tenant: respaldo de la divisa de una reserva nueva. */
  const monedaTenant = useMonedaTenant();
  const [loading, setLoading] = useState(true);
  /** Los filtros activos de la lista, para el CSV de la lista del día. */
  const [filtrosCsv, setFiltrosCsv] = useState('');
  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // Dialog de penalización por no-show.
  const [penal, setPenal] = useState<{
    open: boolean;
    reserva: Reservation | null;
    data: PenalizacionPreview | null;
    cargando: boolean;
    guardando: boolean;
  }>({ open: false, reserva: null, data: null, cargando: false, guardando: false });

  // Filtros
  const [fEstado, setFEstado] = useState('todas');
  const [fCanal, setFCanal] = useState('todos');
  const [fPropiedad, setFPropiedad] = useState('todas');
  const [q, setQ] = useState('');
  // Movimiento del día (recepción): null = sin chip, «llegadas» y «salidas» son
  // excluyentes entre sí — una reserva puede llegar y salir en días distintos.
  const [fMovimiento, setFMovimiento] = useState<'llegadas' | 'salidas' | null>(null);

  // Diálogos
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Reserva cuyo parte de viajeros se está completando a mano (dialog compartido
  // con la pantalla del registro: misma tarea, mismo formulario).
  const [parteDe, setParteDe] = useState<Reservation | null>(null);

  // Textos de las preguntas personalizadas del check-in (id → pregunta): la
  // reserva guarda las respuestas por id y la fila las enseña con su pregunta.
  const [preguntasCheckin, setPreguntasCheckin] = useState<Record<string, string>>({});

  // La carga del día de recepción, en todo el tenant (independiente de los
  // filtros activos): cuántas llegadas y salidas hay HOY. La trae la misma
  // llamada de la lista (resumenHoy).
  const [resumenHoy, setResumenHoy] = useState<{ llegadas: number; salidas: number } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (fEstado !== 'todas') params.set('estado', fEstado);
      if (fCanal !== 'todos') params.set('canal', fCanal);
      if (fPropiedad !== 'todas') params.set('propertyId', fPropiedad);
      if (q.trim()) params.set('q', q.trim());
      if (fMovimiento) params.set('movimiento', fMovimiento);
      // El CSV de la lista del día: la recepción exporta EXACTAMENTE lo que
      // ve (mismos filtros en la URL, mismos datos). El backend responde un
      // archivo; si no hay reservas responde 404 y se lo decimos en pantalla.
      setFiltrosCsv(params.toString());
      const [rRes, pRes, uRes, mRes] = await Promise.all([
        fetch(`/api/hospitality/reservations?${params.toString()}`),
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
        fetch('/api/hospitality/registro-viajeros'),
      ]);
      if (rRes.ok) {
        const d = await rRes.json();
        setReservas(d.reservations || []);
        setPreguntasCheckin(
          d.preguntasCheckin && typeof d.preguntasCheckin === 'object' ? d.preguntasCheckin : {}
        );
        setResumenHoy(
          d.resumenHoy &&
          typeof d.resumenHoy.llegadas === 'number' &&
          typeof d.resumenHoy.salidas === 'number'
            ? d.resumenHoy
            : null
        );
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
  }, [fEstado, fCanal, fPropiedad, q, fMovimiento]);

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
    setForm({ ...EMPTY_FORM, propertyId: properties[0]?.id || '' });
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
      moneda: primeraMoneda(r.currency, monedaTenant),
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

        // Un no-show puede haber emitido su penalización: se cuenta en el
        // momento, porque es dinero y cambió la configuración de cobro.
        const pen = data?.penalizacion;
        if (pen) {
          if (pen.emitida) {
            toast.info(
              `Penalización emitida: ${formatearImporte(pen.importe, pen.moneda)} (${pen.politica === 'estancia_completa' ? 'estancia completa' : `${pen.nochesPenalizadas} noche`}). ` +
                `La unidad queda libre: el cargo se factura desde Finanzas.`
            );
          } else if (pen.motivo && MOTIVO_PENALIZACION[pen.motivo]) {
            toast.info(MOTIVO_PENALIZACION[pen.motivo]);
          }
        }

        await cargar();
      } else {
        toast.error(data.error || 'No se pudo cambiar el estado');
      }
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  // ─── Penalización por no-show ─────────────────────────────────────────────
  // Qué se cobra lo decide el módulo puro en el servidor; aquí solo se enseña
  // la previsualización y se piden las dos acciones: emitir el cargo y facturarlo
  // por el ERP (hospitality no factura: lo hace el ERP, regla 4 del plan).
  const abrirPenalizacion = async (r: Reservation) => {
    setPenal({ open: true, reserva: r, data: null, cargando: true, guardando: false });
    try {
      const res = await fetch(`/api/hospitality/reservations/${r.id}/penalizacion`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'No se pudo consultar la penalización');
        setPenal((p) => ({ ...p, cargando: false }));
        return;
      }
      setPenal((p) => ({ ...p, data, cargando: false }));
    } catch {
      toast.error('Error al consultar la penalización');
      setPenal((p) => ({ ...p, cargando: false }));
    }
  };

  const emitirPenalizacion = async () => {
    const r = penal.reserva;
    if (!r) return;
    setPenal((p) => ({ ...p, guardando: true }));
    try {
      const res = await fetch(`/api/hospitality/reservations/${r.id}/penalizacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'No se pudo emitir la penalización');
      } else if (data.emitida) {
        toast.success(`Penalización emitida: ${formatearImporte(data.importe, data.moneda)}`);
      } else {
        toast.info(MOTIVO_PENALIZACION[data.motivo] || 'No procedía emitir penalización');
      }
      await abrirPenalizacion(r);
      await cargar();
    } catch {
      toast.error('Error al emitir la penalización');
    } finally {
      setPenal((p) => ({ ...p, guardando: false }));
    }
  };

  const facturarPenalizacion = async () => {
    const r = penal.reserva;
    if (!r) return;
    setPenal((p) => ({ ...p, guardando: true }));
    try {
      const res = await fetch(`/api/hospitality/reservations/${r.id}/penalizacion/facturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'No se pudo facturar la penalización');
      } else if (data.facturada) {
        toast.success(`Factura del ERP emitida: ${data.numero} (${formatearImporte(data.importe, data.moneda)})`);
      } else {
        toast.info('La penalización ya estaba facturada');
      }
      await abrirPenalizacion(r);
    } catch {
      toast.error('Error al facturar la penalización');
    } finally {
      setPenal((p) => ({ ...p, guardando: false }));
    }
  };

  // Totales de la lista filtrada: módulo puro (noches y producción con la
  // regla del módulo, no aritmética en la página).
  const resumen = useMemo(() => resumenReservas(reservas), [reservas]);

  // La divisa con la que se escriben los importes de la lista: la de las
  // reservas que se están viendo (la predominante, si hay varias) y, si no hay
  // ninguna, la moneda de reporte del tenant — la misma precedencia que usa la
  // API, para que la cabecera y las filas no puedan discrepar.
  const monedaListado = useMemo(
    () => monedaEfectiva(reservas.map((r) => r.currency), monedaTenant),
    [reservas, monedaTenant]
  );

  // Reservas a las que les falta el parte de viajeros por datos del huésped:
  // el aviso de cabecera y las acciones de cada fila salen de aquí.
  const conPartePendiente = useMemo(() => reservas.filter(faltaParteDeViajeros), [reservas]);

  // El día de hoy con la regla del módulo (string estable dentro del día).
  const hoyIso = diaLocalIso(new Date());
  // Las llegadas de hoy sin parte van PRIMERO: el orden de la lista deja de
  // ser solo cronológico cuando hay trabajo urgente. El sort es estable, así
  // que dentro de cada grupo se conserva el orden por fecha de entrada.
  const reservasOrdenadas = useMemo(
    () =>
      [...reservas].sort(
        (a, b) => Number(llegaHoySinParte(b, hoyIso)) - Number(llegaHoySinParte(a, hoyIso))
      ),
    [reservas, hoyIso]
  );

  // Y las que el Ministerio RECHAZÓ: no es lo mismo (los datos pueden estar
  // completos) ni se arregla igual (puede ser la configuración del hotel).
  const conParteRechazado = useMemo(() => reservas.filter(parteRechazado), [reservas]);

  // Y las que NO llegaron al Ministerio: el servicio no respondió (caída, red,
  // timeout). Tercer aviso, tercer texto: aquí no hay nada que corregir en los
  // datos del huésped, lo que toca es reintentar.
  const conParteSinEntregar = useMemo(() => reservas.filter(parteSinEntregar), [reservas]);

  // De cada familia de fallo, las que ya no se reintentan solas: si nadie las
  // toca, se quedan sin comunicar, así que el aviso no puede callarlo. Van
  // separadas porque cada aviso cuenta las suyas (sumarlas diría «rechazados»
  // de partes que el Ministerio ni ha visto).
  const sinReintentoRechazados = useMemo(
    () => conParteRechazado.filter(parteAbandonadoSinReintento),
    [conParteRechazado]
  );
  const sinReintentoSinEntregar = useMemo(
    () => conParteSinEntregar.filter(parteAbandonadoSinReintento),
    [conParteSinEntregar]
  );

  /**
   * Enlace de check-in del huésped, para reenviárselo: es la vía por la que los
   * documentos los pone el huésped en vez del operador (y en las reservas de
   * canal, la única: el huésped no pasó por la web).
   */
  /**
   * Reintenta el envío de un parte rechazado (acción `enviar` de la API).
   *
   * Hace falta porque el reintento del barrido espacia las esperas (1h, 2h,
   * 4h… hasta 16h) y se rinde a los cinco: cuando el rechazo no es de los
   * datos —el servicio estaba caído, la configuración ya se corrigió—, el
   * operador tiene que poder forzarlo sin esperar al próximo peldaño.
   */
  const reintentarEnvio = async (r: Reservation) => {
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enviar', reservaId: r.id }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos?.error || 'No se pudo reenviar el parte');
      if (datos.estado === 'datos_incompletos') {
        toast.warning('Faltan datos del huésped: completa el parte para poder enviarlo');
      } else {
        toast.success(`Parte ${datos.estado}`);
      }
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reenviar el parte');
    }
  };

  const copiarEnlaceCheckin = async (r: Reservation) => {
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enlace', reservaId: r.id }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos?.error || 'No se pudo generar el enlace');
      await navigator.clipboard?.writeText(datos.url);
      toast.success('Enlace de check-in copiado: envíalo al huésped');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el enlace');
    }
  };


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
            {reservas.length} reservas · {resumen.noches} noches · {resumen.ingresos > 0 ? formatearImporte(resumen.ingresos, monedaListado, 0) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const consulta = filtrosCsv ? `?${filtrosCsv}` : '';
              // Navegación directa (no fetch): el navegador descarga el CSV
              // con su nombre de archivo, igual que un enlace de exportación.
              window.location.href = `/api/hospitality/reservations/export${consulta}`;
              toast.info('Exportando la lista visible (llegadas, salidas y respuestas del check-in)');
            }}
          >
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const consulta = filtrosCsv ? `?${filtrosCsv}` : '';
              // Nueva pestaña (no fetch): la hoja la imprime el navegador
              // (Ctrl+P) con sus estilos de impresión. Misma lista filtrada
              // que el CSV — unidades, horarios y notas para housekeeping.
              window.open(
                `/api/hospitality/reservations/print${consulta}`,
                '_blank',
                'noopener'
              );
            }}
          >
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button onClick={abrirNueva}>
            <Plus className="h-4 w-4 mr-2" /> Nueva Reserva
          </Button>
        </div>
      </div>

      {/* El día de un vistazo — y a la vez el filtro. Las píldoras muestran la
          carga de recepción de HOY en todo el tenant (llegadas y salidas con
          movimiento, la regla del módulo de estados) y al pulsarlas filtran la
          lista. Independientes de los filtros activos: aunque recepción esté
          filtrando por propiedad o buscando a alguien, ve la carga completa
          del día. Excluyentes entre sí: una reserva llega y sale en días
          distintos. */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Hoy
          </span>
          <button
            type="button"
            onClick={() => setFMovimiento(fMovimiento === 'llegadas' ? null : 'llegadas')}
            className={
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
              (fMovimiento === 'llegadas'
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted')
            }
            aria-pressed={fMovimiento === 'llegadas'}
          >
            <PlaneLanding className="h-3.5 w-3.5" />
            {resumenHoy ? `${resumenHoy.llegadas} llegada${resumenHoy.llegadas === 1 ? '' : 's'} hoy` : 'Llegadas hoy'}
          </button>
          <button
            type="button"
            onClick={() => setFMovimiento(fMovimiento === 'salidas' ? null : 'salidas')}
            className={
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
              (fMovimiento === 'salidas'
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted')
            }
            aria-pressed={fMovimiento === 'salidas'}
          >
            <PlaneTakeoff className="h-3.5 w-3.5" />
            {resumenHoy ? `${resumenHoy.salidas} salida${resumenHoy.salidas === 1 ? '' : 's'} hoy` : 'Salidas hoy'}
          </button>
        </CardContent>
      </Card>

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
          {(fEstado !== 'todas' || fCanal !== 'todos' || fPropiedad !== 'todas' || q || fMovimiento) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFEstado('todas'); setFCanal('todos'); setFPropiedad('todas'); setQ(''); setFMovimiento(null); }}
            >
              <X className="h-4 w-4 mr-1" /> Limpiar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Aviso del parte de viajeros: la ley obliga a comunicar los documentos
          de cada viajero, y de las reservas de canal no llegan. Se avisa aquí,
          antes de la llegada, que es cuando el hotel todavía puede pedirlos. */}
      {!loading && conPartePendiente.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-start gap-3 pt-6 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {conPartePendiente.length} reserva(s) sin los datos del huésped para el parte de
                viajeros
              </p>
              <p className="mt-1">
                El Ministerio del Interior exige el documento de cada viajero (RD 933/2021).
                Complétalos con el botón de la fila o copia el enlace de check-in y mándaselo al
                huésped: el parte sale en cuanto estén completos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Partes RECHAZADOS por el Ministerio: es otro aviso, y no se puede
          confundir con «faltan datos». Los datos pueden estar completos y el
          problema estar en un campo concreto —que se corrige en el formulario—
          o en la configuración del hotel, donde completar datos no arregla
          nada. Por eso cada rechazo trae su motivo y sus acciones. */}
      {!loading && conParteRechazado.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="space-y-3 pt-6 text-sm text-red-900">
            <div className="flex flex-wrap items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {conParteRechazado.length} parte(s) rechazado(s) por el Ministerio
                </p>
                <p className="mt-1">
                  El Servicio de Hospedajes no aceptó la comunicación (RD 933/2021). El motivo es
                  el suyo, tal cual, y no siempre es un dato del huésped.
                </p>
                {sinReintentoRechazados.length > 0 && (
                  <p className="mt-1 font-medium">
                    {sinReintentoRechazados.length} de ellos agotaron sus {MAX_INTENTOS_PARTE}{' '}
                    intentos: el producto ya no los reintenta solo, y se quedarán sin comunicar si
                    nadie los corrige o los reenvía.
                  </p>
                )}
              </div>
            </div>
            {conParteRechazado.map((r) => {
              const rechazo = r.parteViajeros?.rechazo ?? null;
              return (
                <div key={r.id} className="rounded-md border border-red-200 bg-white/70 p-3">
                  <p className="font-medium">
                    {r.externalBookingId}
                    {rechazo?.codigo ? ` · código ${rechazo.codigo}` : ''}
                  </p>
                  {rechazo && <p className="mt-1">{rechazo.motivo}</p>}
                  {rechazo && <p className="mt-1 text-red-800">{queCorregirElParte(rechazo)}</p>}
                  {parteAbandonadoSinReintento(r) && (
                    <p className="mt-1 font-medium">
                      {r.parteViajeros?.intentos ?? MAX_INTENTOS_PARTE} intentos agotados: el
                      barrido ya no lo reintenta solo.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {rechazo?.ambito === 'datos' ? (
                      <>
                        <Button size="sm" onClick={() => setParteDe(r)}>
                          <UserPlus className="mr-2 h-4 w-4" /> Corregir los datos
                        </Button>
                        <AccionHospitality capacidad="operaciones.gestionar">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copiarEnlaceCheckin(r)}
                          >
                            <Link2 className="mr-2 h-4 w-4" /> Enlace de check-in
                          </Button>
                        </AccionHospitality>
                      </>
                    ) : (
                      <>
                        <AccionHospitality capacidad="operaciones.gestionar">
                          <Button size="sm" variant="outline" onClick={() => void reintentarEnvio(r)}>
                            <RefreshCw className="mr-2 h-4 w-4" />{' '}
                            {parteAbandonadoSinReintento(r) ? 'Reenviar el parte' : 'Reintentar el envío'}
                          </Button>
                        </AccionHospitality>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href="/dashboard/hospitality/registro-viajeros">
                            <Settings2 className="mr-2 h-4 w-4" /> Registro de viajeros
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Partes que NO llegaron al Ministerio: el servicio no respondió. Es el
          tercer aviso y no se puede confundir con el rechazo — allí el
          Ministerio leyó el parte y no lo quiso; aquí no lo ha visto— ni con
          «faltan datos». Por eso el texto y las acciones son otros: no hay
          nada que corregir en el formulario del huésped, se reintenta. */}
      {!loading && conParteSinEntregar.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="space-y-3 pt-6 text-sm text-red-900">
            <div className="flex flex-wrap items-start gap-3">
              <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {conParteSinEntregar.length} parte(s) sin entregar al Ministerio
                </p>
                <p className="mt-1">
                  El Servicio de Hospedajes no respondió a la comunicación (RD 933/2021): el parte
                  no está registrado, pero tampoco rechazado — los datos del huésped no son el
                  problema. El sistema lo reintenta con esperas crecientes (1h, 2h,
                  4h…) hasta {MAX_INTENTOS_PARTE} veces.
                </p>
                {sinReintentoSinEntregar.length > 0 && (
                  <p className="mt-1 font-medium">
                    {sinReintentoSinEntregar.length} de ellos agotaron sus {MAX_INTENTOS_PARTE}{' '}
                    intentos: el producto ya no los reintenta solo, y esa estancia se quedará sin
                    comunicar si nadie los reenvía.
                  </p>
                )}
              </div>
            </div>
            {conParteSinEntregar.map((r) => {
              const fallo = r.parteViajeros?.fallo ?? null;
              return (
                <div key={r.id} className="rounded-md border border-red-200 bg-white/70 p-3">
                  <p className="font-medium">{r.externalBookingId}</p>
                  {fallo && <p className="mt-1">{fallo.motivo}</p>}
                  {fallo && <p className="mt-1 text-red-800">{queCorregirElParte(fallo)}</p>}
                  {parteAbandonadoSinReintento(r) && (
                    <p className="mt-1 font-medium">
                      {r.parteViajeros?.intentos ?? MAX_INTENTOS_PARTE} intentos agotados: el
                      barrido ya no lo reintenta solo.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AccionHospitality capacidad="operaciones.gestionar">
                      <Button size="sm" onClick={() => void reintentarEnvio(r)}>
                        <RefreshCw className="mr-2 h-4 w-4" />{' '}
                        {parteAbandonadoSinReintento(r) ? 'Reenviar el parte' : 'Reintentar el envío'}
                      </Button>
                    </AccionHospitality>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href="/dashboard/hospitality/registro-viajeros">
                        <Settings2 className="mr-2 h-4 w-4" /> Registro de viajeros
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
            <Button onClick={abrirNueva}>
              <Plus className="h-4 w-4 mr-2" /> Crear la primera reserva
            </Button>
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
                  {reservasOrdenadas.map((r) => {
                    const huesped =
                      (r.guestData?.firstName || r.guestData?.lastName
                        ? [r.guestData.firstName, r.guestData.lastName].filter(Boolean).join(' ')
                        : r.contact?.nombre) || 'Huésped';
                    // Prioridad de recepción: llegada de HOY sin parte. La fila
                    // entera se tiñe de rojo y la nota pierde el ámbar — hoy no
                    // es «pendiente», es «el huésped llega hoy».
                    const urgente = llegaHoySinParte(r, hoyIso);
                    return (
                      <tr
                        key={r.id}
                        className={'border-b last:border-0 hover:bg-muted/40' + (urgente ? ' bg-red-50' : '')}
                      >
                        <td className="p-3">
                          <p className="font-medium">{huesped}</p>
                          <p className="text-xs text-muted-foreground">{r.externalBookingId}</p>
                          {faltaParteDeViajeros(r) && (
                            <p
                              className={
                                'mt-1 flex items-start gap-1 text-xs ' +
                                (urgente ? 'text-red-700' : 'text-amber-700')
                              }
                            >
                              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                Falta para el parte: {camposQueFaltan(r)}
                                {urgente && ' · llega hoy'}
                              </span>
                            </p>
                          )}
                          {parteRechazado(r) && (
                            <p className="mt-1 flex items-start gap-1 text-xs text-red-700">
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                Parte rechazado: {motivoDelRechazo(r)}
                                {/* Si el barrido ya se rindió, la fila lo dice: no vale
                                    con esperar a que el sistema lo arregle solo. */}
                                {parteAbandonadoSinReintento(r) && ' · sin reintentos automáticos'}
                              </span>
                            </p>
                          )}
                          {parteSinEntregar(r) && (
                            <p className="mt-1 flex items-start gap-1 text-xs text-red-700">
                              <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                Parte sin entregar: {motivoDeLaNoEntrega(r)}
                                {parteAbandonadoSinReintento(r) && ' · sin reintentos automáticos'}
                              </span>
                            </p>
                          )}
                          {respuestasLegibles(r, preguntasCheckin) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {respuestasLegibles(r, preguntasCheckin)}
                            </p>
                          )}
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
                            {nightsBetween(new Date(r.checkIn), new Date(r.checkOut))}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {r.amountAfterTax != null ? (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatearImporte(r.amountAfterTax, r.currency || monedaListado)}
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
                          {/* Los estados que se ofrecen son los que el rol puede
                              aplicar: cancelar una reserva no es editarla, así que
                              no se enseña «Cancelada» a quien solo puede corregir
                              fechas o importe (la regla la resuelve
                              `capacidadDeCambioDeReserva`, la misma que la API).
                              Y si no puede aplicar ninguno, no hay desplegable. */}
                          {ESTADOS.some(
                            (e) =>
                              e.value !== r.estado &&
                              puede(capacidadDeCambioDeReserva(e.value, r.estado))
                          ) ? (
                          <Select
                            value={r.estado}
                            onValueChange={(v) => cambiarEstadoRapido(r, v)}
                          >
                            <SelectTrigger className="h-8 w-[130px] inline-flex mr-1" title="Cambiar estado">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ESTADOS.filter(
                                (e) =>
                                  e.value !== r.estado &&
                                  puede(capacidadDeCambioDeReserva(e.value, r.estado))
                              ).map((e) => (
                                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {/* El no-show no ocupa la unidad, pero sí se cobra: aquí
                              el operador emite el cargo y lo factura por el ERP. */}
                          {r.estado === 'no_show' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirPenalizacion(r)}
                              title="Penalización por no-show"
                            >
                              <DollarSign className="h-4 w-4" />
                            </Button>
                          )}
                          {/* El parte de viajeros: completarlo a mano o pasarle al
                              huésped su enlace de check-in. */}
                          {faltaParteDeViajeros(r) && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setParteDe(r)}
                                title="Completar los datos del huésped para el parte de viajeros"
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                              <AccionHospitality capacidad="operaciones.gestionar">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void copiarEnlaceCheckin(r)}
                                  title="Copiar el enlace de check-in del huésped"
                                >
                                  <Link2 className="h-4 w-4" />
                                </Button>
                              </AccionHospitality>
                            </>
                          )}
                          {/* Rechazado: lo que toca depende de dónde esté el problema
                              (los datos del huésped o la configuración del hotel). */}
                          {parteRechazado(r) &&
                            (r.parteViajeros?.rechazo?.ambito === 'datos' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setParteDe(r)}
                                title="Corregir los datos del huésped y reenviar el parte rechazado"
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            ) : (
                              <AccionHospitality capacidad="operaciones.gestionar">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void reintentarEnvio(r)}
                                  title={
                                    parteAbandonadoSinReintento(r)
                                      ? 'Reenviar el parte rechazado (el barrido ya no lo reintenta)'
                                      : 'Reintentar el envío del parte rechazado'
                                  }
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </AccionHospitality>
                            ))}
                          <Button variant="ghost" size="sm" onClick={() => abrirEditar(r)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
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

      {/* Dialog de penalización por no-show */}
      <Dialog
        open={penal.open}
        onOpenChange={(open) => { if (!open) setPenal({ open: false, reserva: null, data: null, cargando: false, guardando: false }); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Penalización por no-show</DialogTitle>
            <DialogDescription>
              {penal.reserva
                ? `Reserva ${penal.reserva.externalBookingId} · ${penal.reserva.channel}`
                : 'Cargo por no presentarse'}
            </DialogDescription>
          </DialogHeader>

          {penal.cargando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando la penalización…
            </div>
          ) : penal.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Política de la propiedad</p>
                  <p className="font-medium">
                    {POLITICAS_NO_SHOW.includes(penal.data.politica as any)
                      ? ETIQUETA_POLITICA_NO_SHOW[penal.data.politica as keyof typeof ETIQUETA_POLITICA_NO_SHOW]
                      : penal.data.politica}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Noches de la estancia</p>
                  <p className="font-medium">{penal.data.noches}</p>
                </div>
              </div>

              {penal.data.emitida ? (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{penal.data.emitida.concepto}</span>
                    <Badge variant="secondary">
                      {formatearImporte(penal.data.emitida.importe, penal.data.emitida.moneda)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {penal.data.emitida.facturada
                      ? 'Facturada por el ERP: este cargo ya no se puede facturar dos veces.'
                      : 'Emitida y pendiente de facturar por el ERP.'}
                  </p>
                </div>
              ) : penal.data.previsto.aplica ? (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{penal.data.previsto.concepto}</span>
                    <Badge variant="secondary">
                      {formatearImporte(penal.data.previsto.importe, penal.reserva?.currency || monedaListado)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El cargo es una línea de la reserva: la unidad sigue libre y la analítica no la cuenta
                    como ocupación.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rounded-md border p-3">
                  {MOTIVO_PENALIZACION[penal.data.previsto.motivo || ''] ||
                    'No procede emitir penalización en esta reserva.'}
                </p>
              )}

              {penal.data.emitida && !penal.data.emitida.facturada && (
                <p className="text-sm text-muted-foreground">
                  La factura legal la emite el ERP (serie fiscal y Veri*factu). Necesita que el huésped esté
                  vinculado al CRM para tener receptor fiscal.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No se pudo cargar la penalización.</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPenal({ open: false, reserva: null, data: null, cargando: false, guardando: false })}>
              Cerrar
            </Button>
            {penal.data && !penal.data.emitida && penal.data.previsto.aplica && (
              <AccionHospitality capacidad="finanzas.gestionar">
                <Button onClick={emitirPenalizacion} disabled={penal.guardando}>
                  {penal.guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                  Emitir penalización
                </Button>
              </AccionHospitality>
            )}
            {penal.data?.emitida && !penal.data.emitida.facturada && (
              <AccionHospitality capacidad="finanzas.gestionar">
                <Button onClick={facturarPenalizacion} disabled={penal.guardando}>
                  {penal.guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Facturar por el ERP
                </Button>
              </AccionHospitality>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {/* El PATCH no pide lo mismo si el estado nuevo es «cancelada»
                (`reservas.cancelar`) que si solo se corrigen fechas o importe;
                se resuelve con la misma regla que la API. */}
            <AccionHospitality
              capacidad={editing ? capacidadDeCambioDeReserva(form.estado, editing.estado) : 'reservas.crear'}
            >
              <Button onClick={guardar} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {editing ? 'Guardar cambios' : 'Crear reserva'}
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parte de viajeros (RD 933/2021): mismo formulario que la pantalla del
          registro de viajeros, para no completar los datos en dos sitios. */}
      <CompletarParteVijerosDialog
        reserva={parteDe ? { id: parteDe.id, referencia: parteDe.externalBookingId } : null}
        onCerrar={() => setParteDe(null)}
        onCompletado={cargar}
      />
    </div>
  );
}
