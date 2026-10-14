'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DoorOpen,
  Loader2,
  Link2,
  Plus,
  Plug,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { MONEDAS_SELECCIONABLES, formatearImporte, monedaEfectiva } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
// Módulo puro (sin BD ni red): trae la forma del informe de descartes del canal
// para pintar las unidades rechazadas, no para reimplementar la regla.
import type { RechazoDeCanal } from '@/lib/hospitality/rechazo-canal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectorPais } from '@/components/paises-municipios/selectores';
import { paisASelector, selectorAPais } from '@/lib/paises-municipios/paises';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface PropiedadResumen {
  id: string;
  nombre: string;
  codigo: string | null;
  ciudad: string | null;
  pais: string | null;
  estado: string;
  _count?: { units: number };
}

interface UnidadOnboarding {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  capacidad: number;
  tarifaBase: number | null;
  moneda: string;
  estado: string;
  planesActivos: number;
  vinculada: boolean;
  roomCode: string | null;
  rateplanCode: string | null;
  /** El vínculo lo creó el sistema al recibir una reserva. */
  vinculoAutomatico: boolean;
  vinculoMotivo: string | null;
}

type EstadoPaso = 'completado' | 'pendiente' | 'error' | 'bloqueado';

interface PasoOnboarding {
  clave: string;
  orden: number;
  titulo: string;
  descripcion: string;
  estado: EstadoPaso;
  detalle?: string;
  /** Requisito de un tercero (el catálogo no existe hasta activar el canal). */
  requisitoExterno?: { quien: string; titulo: string; detalle: string };
}

interface Snapshot {
  propiedad: {
    id: string;
    nombre: string;
    codigo: string | null;
    ciudad: string | null;
    pais: string | null;
    estado: string;
    timezone: string;
  };
  hotelCode: string | null;
  unidades: UnidadOnboarding[];
  unidadesVinculadas: number;
  conectividad: { configurada: boolean; estado: string };
  pruebas: { disponibilidad: string | null; tarifas: string | null; reserva: string | null };
  pasos: PasoOnboarding[];
  puedeActivar: { ok: boolean; faltantes: string[] };
}

interface RateplanCatalogo {
  rateplanCode: string;
  rateplanName: string;
  occupancy: number | null;
  noOfMeals: number | null;
}

interface RoomCatalogo {
  roomCode: string;
  roomName: string;
  count: number | null;
  active: boolean | null;
  minOcc: number | null;
  maxOcc: number | null;
  rateplans: RateplanCatalogo[];
}

/**
 * Ocupación de la habitación en una línea. Ayuda a elegir la unidad correcta
 * cuando el código no lo dice todo: la capacidad de la unidad tiene que caer
 * dentro de este rango.
 */
function etiquetaOcupacion(room: RoomCatalogo): string | null {
  if (room.minOcc !== null && room.maxOcc !== null) return `${room.minOcc}-${room.maxOcc} huéspedes`;
  if (room.maxOcc !== null) return `hasta ${room.maxOcc} huéspedes`;
  if (room.minOcc !== null) return `desde ${room.minOcc} huéspedes`;
  return null;
}

/** Incidencia de conectividad: reserva que no se pudo registrar por falta de vínculo. */
interface IncidenciaConectividad {
  hotelCode: string;
  propertyId: string | null;
  property: string | null;
  roomCode: string | null;
  rateplanCode: string | null;
  tipo: 'roomcode_sin_mapping' | 'propiedad_sin_mapping' | 'multi_habitacion';
  /** Solo multi_habitación: habitaciones del booking para registrarlas partidas. */
  habitaciones?: Array<{
    indice: number;
    roomCode: string | null;
    bookingId: string | null;
    roomGuestName: string | null;
    ocupacion: { adultos: number; ninos: number } | null;
    /** Partes derivadas (bookingId#n) ya registradas como reservas. */
    registradas: string[];
  }>;
  intentos: number;
  primeraFecha: string;
  ultimaFecha: string;
  canales: string[];
  acciones: string[];
  bookingIds: string[];
  /** Reservas del grupo que ya están registradas en el sistema. */
  registradas: number;
  /** Eventos reenviables al Reservation Engine (vacío si no se puede procesar ninguno). */
  eventoIds: string[];
  vinculo: { unitId: string | null; unit: string | null; externalUnitCode: string } | null;
  /** Huéspedes reales de la reserva según el payload (null si no los publica). */
  ocupacion: { adultos: number; ninos: number; total: number } | null;
  errorMensaje: string | null;
}

/** Reserva viva que sigue ocupando una unidad cuyo vínculo se deshizo. */
interface ReservaAfectada {
  id: string;
  externalBookingId: string | null;
  channel: string | null;
  estado: string;
  checkIn: string | null;
  checkOut: string | null;
  huesped: string | null;
  huéspedes: number;
}

interface ResumenIncidencias {
  pendientes: number;
  vinculadas: number;
  resueltas: number;
  eventosAnalizados: number;
}

/** Una reserva que el canal reportó como no-show (con su cargo emitido). */
interface NoShowCanal {
  reservationId: string;
  bookingId: string | null;
  referencia: string;
  canal: string;
  hotelCode: string;
  propertyId: string | null;
  property: string | null;
  unit: string | null;
  huesped: string | null;
  email: string | null;
  checkIn: string;
  checkOut: string;
  reportadoEn: string;
  intentos: number;
  estado: string;
  penalizacion: { importe: number; moneda: string; facturada: boolean } | null;
}

interface ResumenNoShowsCanal {
  total: number;
  conPenalizacion: number;
}

interface ResultadoReenvio {
  eventoId: string;
  bookingId: string | null;
  channel: string | null;
  estado: 'registrada' | 'duplicado' | 'sin_vinculo' | 'error';
  reservationId?: string;
  error?: string;
  roomCode?: string | null;
}

interface RespuestaReenvio {
  ok: boolean;
  reenviadas: number;
  duplicadas: number;
  sinVinculo: number;
  fallidas: number;
  resultados?: ResultadoReenvio[];
}

interface RespuestaVinculacionAutomatica {
  ok: boolean;
  aplicar: boolean;
  aplicadas: Array<{ roomCode: string; unit: string; motivo: string }>;
  propuestas: Array<{ roomCode: string | null; motivo: string; detalle?: string }>;
  resumen: { aplicadas: number; propuestas: number; sinVinculo: number };
}

const TIPOS_UNIDAD = ['apartamento', 'habitacion', 'casa', 'villa', 'estudio', 'loft', 'bungalow', 'otro'];

const ESTADO_PASO_UI: Record<EstadoPaso, { label: string; clase: string }> = {
  completado: { label: 'Completado', clase: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800 border-amber-200' },
  error: { label: 'Con error', clase: 'bg-red-100 text-red-800 border-red-200' },
  bloqueado: { label: 'Bloqueado', clase: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function HospitalityOnboardingPage() {
  const [loading, setLoading] = useState(true);
  const [cargandoSnapshot, setCargandoSnapshot] = useState(false);
  const [propiedades, setPropiedades] = useState<PropiedadResumen[]>([]);
  const [propertyId, setPropertyId] = useState<string>('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Acción en curso (para deshabilitar botones y mostrar spinner puntual).
  const [busy, setBusy] = useState<string | null>(null);

  // Paso 1 — nueva propiedad
  const [nuevaPropiedad, setNuevaPropiedad] = useState({
    nombre: '',
    ciudad: '',
    pais: '',
    timezone: 'America/Mexico_City',
  });

  // Paso 2 — nueva unidad
  /**
   * Moneda de reporte del tenant. Es la divisa con la que el paso de la unidad
   * nace y a la que vuelve tras crearla: el asistente no empieza en una divisa
   * que nadie eligió, y el campo se puede cambiar en el propio paso.
   */
  const monedaTenant = useMonedaTenant();
  const [nuevaUnidad, setNuevaUnidad] = useState({
    nombre: '',
    codigo: '',
    tipo: 'apartamento',
    capacidad: '2',
    tarifaBase: '',
    moneda: '',
  });
  /**
   * Divisa con la que nacerá una unidad nueva: la del inventario que ya existe
   * (un hotel no mezcla divisas por descuido) y, si no hay ninguna, la moneda de
   * reporte del tenant. Es la MISMA precedencia que aplica la API al crear una
   * unidad, así que el paso enseña lo que se va a guardar; si no hay ninguna de
   * las dos, el campo queda vacío y el servidor la resuelve.
   */
  const monedaDeUnidadNueva = useMemo(
    () => monedaEfectiva((snapshot?.unidades || []).map((u) => u.moneda), monedaTenant),
    [snapshot, monedaTenant]
  );

  // Paso 5 — catálogo externo
  const [hotelCodeInput, setHotelCodeInput] = useState('');
  const [catalogo, setCatalogo] = useState<RoomCatalogo[] | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  // Paso 6 — asignaciones por unidad
  const [asignaciones, setAsignaciones] = useState<Record<string, { roomCode: string; rateplanCode: string }>>({});

  // Resultado detallado de la última prueba por paso. `unidades` solo llega
  // cuando el canal descartó parte del envío: es la lista de lo que hay que
  // arreglar, con el nombre de la unidad del hotel.
  const [resultados, setResultados] = useState<
    Record<string, { ok: boolean; texto: string; unidades?: RechazoDeCanal['descartadas'] }>
  >({});

  // Incidencias de conectividad (reservas rechazadas por falta de vínculo)
  const [incidencias, setIncidencias] = useState<IncidenciaConectividad[] | null>(null);
  const [resumenIncidencias, setResumenIncidencias] = useState<ResumenIncidencias | null>(null);
  const [incidenciasError, setIncidenciasError] = useState<string | null>(null);
  const [cargandoIncidencias, setCargandoIncidencias] = useState(false);
  // No-shows reportados por el canal (action no_show del webhook) con su cargo.
  const [noShowsCanal, setNoShowsCanal] = useState<NoShowCanal[] | null>(null);
  const [resumenNoShows, setResumenNoShows] = useState<ResumenNoShowsCanal | null>(null);
  // Qué lista mira el operador en el panel de incidencias.
  const [vistaIncidencias, setVistaIncidencias] = useState<'vinculos' | 'noshow'>('vinculos');
  // Clave del grupo que se está reenviando (hotelCode|roomCode|rateplanCode)
  const [reenviando, setReenviando] = useState<string | null>(null);
  /** Unidad cuyo vínculo automático se está a punto de deshacer (confirmación). */
  const [unidadADeshacer, setUnidadADeshacer] = useState<UnidadOnboarding | null>(null);
  /** Reservas vivas de esa unidad (preview mientras se confirma el deshacer). */
  const [reservasDeshacer, setReservasDeshacer] = useState<ReservaAfectada[] | null>(null);
  const [cargandoReservasDeshacer, setCargandoReservasDeshacer] = useState(false);
  /** Reservas del último vínculo deshecho: el operador decide si las mueve. */
  const [deshacerReservas, setDeshacerReservas] = useState<{
    unitId: string;
    unitName: string;
    roomCode: string | null;
    reservas: ReservaAfectada[];
  } | null>(null);
  /** Reasignación en curso: id de la reserva que se está moviendo. */
  const [reasignando, setReasignando] = useState<string | null>(null);
  const [autoVinculando, setAutoVinculando] = useState(false);
  // Registro partido de un booking multi-habitación: unidades elegidas por
  // habitación + estado del envío (la clave del grupo en curso).
  const [partidaUnidades, setPartidaUnidades] = useState<Record<number, string>>({});
  const [partidaEnCurso, setPartidaEnCurso] = useState<string | null>(null);

  const cargar = useCallback(async (idPropiedad?: string) => {
    try {
      if (idPropiedad) setCargandoSnapshot(true);
      else setLoading(true);
      setErrorCarga(null);

      const url = idPropiedad
        ? `/api/hospitality/onboarding?propertyId=${encodeURIComponent(idPropiedad)}`
        : '/api/hospitality/onboarding';
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo cargar el onboarding');
      const data = await res.json();

      setPropiedades(data.propiedades || []);
      if (data.onboarding) {
        setSnapshot(data.onboarding);
        setHotelCodeInput(data.onboarding.hotelCode || '');
        // Precarga las asignaciones actuales para que el paso 6 sea editable.
        const iniciales: Record<string, { roomCode: string; rateplanCode: string }> = {};
        for (const u of data.onboarding.unidades as UnidadOnboarding[]) {
          if (u.roomCode) {
            iniciales[u.id] = { roomCode: u.roomCode, rateplanCode: u.rateplanCode || '' };
          }
        }
        setAsignaciones(iniciales);
      } else {
        setSnapshot(null);
      }
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'Error al cargar el onboarding');
    } finally {
      setLoading(false);
      setCargandoSnapshot(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const qs = new URLSearchParams(window.location.search).get('propertyId');
    if (qs) setPropertyId(qs);
  }, [cargar]);

  useEffect(() => {
    if (propertyId) cargar(propertyId);
  }, [propertyId, cargar]);

  // Incidencias del webhook: reservas rechazadas por falta de vínculo de unidad.
  const cargarIncidencias = useCallback(async (idPropiedad: string) => {
    if (!idPropiedad) return;
    setCargandoIncidencias(true);
    setIncidenciasError(null);
    try {
      // Las dos listas del panel viajan en paralelo; cada una falla sola.
      const [resVinculos, resNoShow] = await Promise.allSettled([
        fetch(`/api/hospitality/incidencias?propertyId=${encodeURIComponent(idPropiedad)}`),
        fetch(`/api/hospitality/incidencias?tipo=no_show&propertyId=${encodeURIComponent(idPropiedad)}`),
      ]);

      if (resVinculos.status === 'fulfilled' && resVinculos.value.ok) {
        const data = await resVinculos.value.json();
        setIncidencias(data.incidencias || []);
        setResumenIncidencias(data.resumen || null);
      } else {
        setIncidencias(null);
        setResumenIncidencias(null);
      }

      if (resNoShow.status === 'fulfilled' && resNoShow.value.ok) {
        const data = await resNoShow.value.json();
        setNoShowsCanal(data.noShows || []);
        setResumenNoShows(data.resumen || null);
      } else {
        setNoShowsCanal(null);
        setResumenNoShows(null);
      }

      if (resVinculos.status === 'rejected' || resNoShow.status === 'rejected') {
        setIncidenciasError('Error al cargar las incidencias');
      }
    } catch (e) {
      setIncidencias(null);
      setResumenIncidencias(null);
      setIncidenciasError(e instanceof Error ? e.message : 'Error al cargar las incidencias');
    } finally {
      setCargandoIncidencias(false);
    }
  }, []);

  useEffect(() => {
    if (snapshot?.propiedad.id) cargarIncidencias(snapshot.propiedad.id);
  }, [snapshot?.propiedad.id, cargarIncidencias]);

  /**
   * Vincula automáticamente las habitaciones que están rechazando reservas con
   * unidades libres, pero solo cuando la coincidencia no admite dudas (el
   * código o el nombre de la unidad, o una única unidad libre). Lo demás vuelve
   * como propuesta para que decida el operador.
   */
  const vincularAutomaticamente = async () => {
    if (!snapshot) return;
    setAutoVinculando(true);
    try {
      const res = await fetch('/api/hospitality/incidencias/vinculacion-automatica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: snapshot.propiedad.id }),
      });
      const data: RespuestaVinculacionAutomatica & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron proponer los vínculos');

      const aplicadas = data.resumen?.aplicadas ?? 0;
      const propuestas = data.resumen?.propuestas ?? 0;
      const detalle = (data.aplicadas || [])
        .map((a) => `${a.roomCode} → ${a.unit}`)
        .join(', ');

      if (aplicadas > 0) {
        toast.success(
          `${aplicadas} vínculo(s) aplicados${detalle ? `: ${detalle}` : ''}` +
            (propuestas > 0 ? ` · ${propuestas} para revisar` : '')
        );
      } else if (propuestas > 0) {
        toast.info(`${propuestas} propuesta(s) que necesitan tu decisión`);
      } else {
        toast.info('No hay vínculos que aplicar');
      }

      await cargar(snapshot.propiedad.id);
      await cargarIncidencias(snapshot.propiedad.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al proponer los vínculos');
    } finally {
      setAutoVinculando(false);
    }
  };

  /**
   * Reenvía al Reservation Engine los eventos guardados de una incidencia que
   * ya tiene vínculo, sin esperar a que el canal vuelva a enviar la reserva.
   * El motor es idempotente por bookingId: un reenvío no duplica nada.
   */
  /**
   * Registro partido: envía las unidades elegidas por habitación del booking
   * multi-habitación. El endpoint es idempotente por parte (bookingId#n), así
   * que reintentar una pasada fallida no duplica nada.
   */
  const registrarPartida = async (incidencia: IncidenciaConectividad) => {
    if (!snapshot || incidencia.eventoIds.length === 0 || !incidencia.habitaciones?.length) return;
    const elegidas = incidencia.habitaciones
      .filter((h) => h.registradas.length === 0)
      .map((h) => ({ indice: h.indice, unitId: partidaUnidades[h.indice] }));
    if (elegidas.some((u) => !u.unitId)) {
      toast.error('Elige la unidad para cada habitación pendiente antes de registrar.');
      return;
    }
    if (new Set(elegidas.map((u) => u.unitId)).size !== elegidas.length) {
      toast.error('Cada habitación necesita una unidad distinta.');
      return;
    }
    setPartidaEnCurso(claveIncidencia(incidencia));
    try {
      const res = await fetch('/api/hospitality/incidencias/registrar-partida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: incidencia.eventoIds[0], unidades: elegidas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'No se pudo registrar la reserva partida');
      }
      const creadas = (data.habitaciones as Array<{ estado: string }>).filter((h) => h.estado === 'creada').length;
      toast.success(
        data.eventoCerrado
          ? `Booking partido registrado: ${creadas} reserva(s) nueva(s).`
          : `Registradas ${creadas} habitación(es); quedan pendientes: el grupo sigue en el panel.`
      );
      setPartidaUnidades({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar la reserva partida');
    } finally {
      setPartidaEnCurso(null);
      await cargarIncidencias(snapshot.propiedad.id);
    }
  };

  const reenviarIncidencia = async (incidencia: IncidenciaConectividad) => {
    if (!snapshot || incidencia.eventoIds.length === 0) return;
    setReenviando(claveIncidencia(incidencia));
    try {
      const res = await fetch('/api/hospitality/incidencias/reintentar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoIds: incidencia.eventoIds }),
      });
      const data: RespuestaReenvio & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron reenviar las reservas');

      const partes: string[] = [];
      if (data.reenviadas > 0) partes.push(`${data.reenviadas} procesada(s)`);
      if (data.duplicadas > 0) partes.push(`${data.duplicadas} ya estaba(n) registrada(s)`);
      if (data.sinVinculo > 0) partes.push(`${data.sinVinculo} sin vínculo`);
      if (data.fallidas > 0) partes.push(`${data.fallidas} con error`);
      const detalle = partes.join(' · ') || 'sin cambios';

      if (data.ok) {
        toast.success(`Reenvío completado: ${detalle}`);
      } else {
        const primerError = data.resultados?.find(
          (r) => r.estado === 'sin_vinculo' || r.estado === 'error'
        )?.error;
        toast.error(`Reenvío con pendientes: ${detalle}${primerError ? ` · ${primerError}` : ''}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al reenviar las reservas');
    } finally {
      setReenviando(null);
      await cargarIncidencias(snapshot.propiedad.id);
    }
  };

  const paso = useMemo(
    () => (clave: string) => snapshot?.pasos.find((p) => p.clave === clave) ?? null,
    [snapshot]
  );

  // ── Paso 1: crear propiedad ───────────────────────────────────────────────
  const crearPropiedad = async () => {
    if (!nuevaPropiedad.nombre.trim()) {
      toast.error('El nombre de la propiedad es obligatorio');
      return;
    }
    setBusy('propiedad');
    try {
      const res = await fetch('/api/hospitality/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaPropiedad),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear la propiedad');
      toast.success('Propiedad creada');
      setNuevaPropiedad({ nombre: '', ciudad: '', pais: '', timezone: 'America/Mexico_City' });
      await cargar();
      setPropertyId(data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error creando la propiedad');
    } finally {
      setBusy(null);
    }
  };

  // ── Paso 2: crear unidad ──────────────────────────────────────────────────
  const crearUnidad = async () => {
    if (!snapshot) return;
    if (!nuevaUnidad.nombre.trim()) {
      toast.error('El nombre de la unidad es obligatorio');
      return;
    }
    setBusy('unidad');
    try {
      const res = await fetch('/api/hospitality/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nuevaUnidad, propertyId: snapshot.propiedad.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear la unidad');
      toast.success('Unidad creada');
      setNuevaUnidad({
        nombre: '',
        codigo: '',
        tipo: 'apartamento',
        capacidad: '2',
        tarifaBase: '',
        // La divisa del paso vuelve a la que le tocaría a la próxima unidad.
        moneda: monedaDeUnidadNueva,
      });
      await cargar(snapshot.propiedad.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error creando la unidad');
    } finally {
      setBusy(null);
    }
  };

  // ── Paso 5: catálogo externo ──────────────────────────────────────────────
  const cargarCatalogo = useCallback(
    async (silencioso = false) => {
      if (!snapshot || !hotelCodeInput.trim()) return;
      setBusy('catalogo');
      setCatalogoError(null);
      try {
        const res = await fetch('/api/hospitality/onboarding/catalogo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: snapshot.propiedad.id, hotelCode: hotelCodeInput.trim() }),
        });
        const data = await res.json();
        if (!data.ok) {
          setCatalogo(null);
          setCatalogoError(data.error || 'No se pudo obtener el catálogo');
          if (!silencioso) toast.error(data.error || 'No se pudo obtener el catálogo');
          return;
        }
        setCatalogo(data.rooms || []);
        if (!silencioso) toast.success(`Catálogo obtenido: ${(data.rooms || []).length} tipo(s) de habitación`);
      } catch (e) {
        setCatalogoError(e instanceof Error ? e.message : 'Error al obtener el catálogo');
      } finally {
        setBusy(null);
      }
    },
    [snapshot, hotelCodeInput]
  );

  // Con el código ya vinculado, el catálogo se recupera solo para poder editar
  // las asignaciones del paso 6 sin volver a escribirlo.
  useEffect(() => {
    if (snapshot?.hotelCode && !catalogo && busy === null) {
      setHotelCodeInput(snapshot.hotelCode);
      cargarCatalogo(true);
    }
  }, [snapshot?.hotelCode, catalogo, busy, cargarCatalogo]);

  // ── Paso 6: guardar vínculos ──────────────────────────────────────────────
  const guardarMapping = async () => {
    if (!snapshot) return;
    const lista = Object.entries(asignaciones)
      .filter(([, v]) => v.roomCode)
      .map(([unitId, v]) => ({ unitId, roomCode: v.roomCode, rateplanCode: v.rateplanCode || null }));
    if (lista.length === 0) {
      toast.error('Asigna al menos una unidad a una habitación');
      return;
    }
    setBusy('mapping');
    try {
      const res = await fetch('/api/hospitality/onboarding/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: snapshot.propiedad.id,
          hotelCode: hotelCodeInput.trim() || snapshot.hotelCode,
          asignaciones: lista,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar el mapping');
      toast.success(`${data.vinculadas?.length || lista.length} unidad(es) vinculadas`);
      await cargar(snapshot.propiedad.id);
      // Los vínculos nuevos pueden resolver incidencias ya registradas.
      await cargarIncidencias(snapshot.propiedad.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error guardando el mapping');
    } finally {
      setBusy(null);
    }
  };

  // ── Paso 6b: deshacer un vínculo (revisión de un vínculo automático) ────
  /** Preview de las reservas que siguen en la unidad, para la confirmación. */
  const cargarReservasADeshacer = async (unidad: UnidadOnboarding) => {
    if (!snapshot) return;
    setCargandoReservasDeshacer(true);
    try {
      const qs = `propertyId=${encodeURIComponent(snapshot.propiedad.id)}&unitId=${encodeURIComponent(unidad.id)}`;
      const res = await fetch(`/api/hospitality/onboarding/mapping/deshacer?${qs}`);
      const data = await res.json();
      setReservasDeshacer(data.ok ? data.reservas : []);
    } catch {
      // El preview es best-effort: no bloquea el deshacer.
      setReservasDeshacer(null);
    } finally {
      setCargandoReservasDeshacer(false);
    }
  };

  /** Reasigna una reserva a otra unidad (PATCH, valida overbooking). */
  const reasignarReserva = async (reservaId: string, unitId: string, nombre: string) => {
    if (!snapshot) return;
    setReasignando(reservaId);
    try {
      const res = await fetch(`/api/hospitality/reservations/${encodeURIComponent(reservaId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo mover la reserva');
      toast.success(`Reserva movida a ${nombre}`);
      setDeshacerReservas((d) =>
        d ? { ...d, reservas: d.reservas.filter((r) => r.id !== reservaId) } : d
      );
      await cargar(snapshot.propiedad.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al mover la reserva');
    } finally {
      setReasignando(null);
    }
  };

  const deshacerVinculo = async (unidad: UnidadOnboarding) => {
    if (!snapshot) return;
    setBusy(`deshacer-${unidad.id}`);
    try {
      const res = await fetch('/api/hospitality/onboarding/mapping/deshacer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: snapshot.propiedad.id, unitId: unidad.id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo deshacer el vínculo');

      toast.success(
        `Vínculo deshecho: ${unidad.nombre} queda libre y ${data.roomCode ?? 'la habitación'} sin vínculo. ` +
          'No se volverá a crear solo.'
      );
      // El select no debe seguir mostrando el vínculo que acabamos de deshacer.
      setAsignaciones((a) => {
        const copia = { ...a };
        delete copia[unidad.id];
        return copia;
      });
      // Las reservas que siguen en la unidad se muestran con su acción para
      // reasignarlas: no son un aviso que se pierde en un toast.
      const reservas: ReservaAfectada[] = data.reservas ?? [];
      if (reservas.length > 0) {
        setDeshacerReservas({
          unitId: unidad.id,
          unitName: unidad.nombre,
          roomCode: data.roomCode ?? null,
          reservas,
        });
      }
      await cargar(snapshot.propiedad.id);
      await cargarIncidencias(snapshot.propiedad.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al deshacer el vínculo');
    } finally {
      setBusy(null);
    }
  };

  // ── Pasos 7-9: pruebas ────────────────────────────────────────────────────
  const ejecutarPrueba = async (prueba: 'disponibilidad' | 'tarifas' | 'reserva') => {
    if (!snapshot) return;
    setBusy(prueba);
    setResultados((r) => ({ ...r, [prueba]: { ok: false, texto: 'Ejecutando…' } }));
    try {
      const res = await fetch('/api/hospitality/onboarding/probar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: snapshot.propiedad.id, prueba }),
      });
      const data = await res.json();
      const detalle = data.detalle || {};
      // La reserva de prueba se borra y se vuelve a empujar la disponibilidad. Si
      // esa reposición falla, el proveedor se queda esas noches cerradas: el paso
      // sigue siendo válido (la reserva llegó) pero hay que decirlo, no callarlo.
      const reposicion = (detalle.reposicion || null) as { ok?: boolean } | null;
      // El aviso del servidor es la fuente: cubre también el push que no manda
      // nada (respuesta OK con 0 envíos, que deja igualmente las noches cerradas).
      const reposicionSuspendida =
        prueba === 'reserva' && !!data.ok && (!!data.aviso || reposicion?.ok === false);
      const texto = data.ok
        ? prueba === 'reserva'
          ? `${reposicionSuspendida ? 'Reserva recibida y eliminada · disponibilidad NO repuesta' : 'Reserva recibida, eliminada y disponibilidad repuesta'} · ${detalle.unidad || ''} ${detalle.roomCode || ''}`
          : `${detalle.pushCount ?? 0} envío(s) aceptados por el proveedor`
        : data.error || 'La prueba falló';
      // Unidades que el canal descartó: se pintan una a una debajo del resultado,
      // porque un aviso que se va con el toast se pierde.
      const unidades = (detalle.rechazo?.descartadas ?? []) as RechazoDeCanal['descartadas'];

      setResultados((r) => ({
        ...r,
        [prueba]: { ok: !!data.ok, texto, ...(unidades.length > 0 ? { unidades } : {}) },
      }));
      if (!data.ok) toast.error(texto);
      else if (data.aviso) toast.error(String(data.aviso));
      else toast.success(prueba === 'reserva' ? 'Reserva de prueba verificada' : 'Prueba superada');
      await cargar(snapshot.propiedad.id);
    } catch (e) {
      const texto = e instanceof Error ? e.message : 'Error ejecutando la prueba';
      setResultados((r) => ({ ...r, [prueba]: { ok: false, texto } }));
      toast.error(texto);
    } finally {
      setBusy(null);
    }
  };

  // ── Paso 10: activar ──────────────────────────────────────────────────────
  const activar = async () => {
    if (!snapshot) return;
    setBusy('activar');
    try {
      const res = await fetch('/api/hospitality/onboarding/activar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: snapshot.propiedad.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(
          data?.faltantes?.length
            ? `Faltan: ${data.faltantes.join(', ')}`
            : data?.error || 'No se pudo activar la propiedad'
        );
      }
      toast.success('Propiedad conectada para producción');
      await cargar(snapshot.propiedad.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error activando la propiedad');
    } finally {
      setBusy(null);
    }
  };

  const roomsDisponibles = catalogo || [];
  const rateplansDe = (roomCode: string) =>
    roomsDisponibles.find((r) => r.roomCode === roomCode)?.rateplans || [];

  // Formulario del paso 1. Se usa tanto cuando ya hay una propiedad
  // seleccionada como cuando todavía no existe ninguna: el wizard debe poder
  // crear la PRIMERA propiedad o no sirve para empezar de cero.
  const formularioPropiedad = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Nombre de la propiedad *</Label>
        <Input
          value={nuevaPropiedad.nombre}
          onChange={(e) => setNuevaPropiedad({ ...nuevaPropiedad, nombre: e.target.value })}
          placeholder="Apartamentos Costa Azul"
        />
      </div>
      <div>
        <Label>Ciudad</Label>
        <Input
          value={nuevaPropiedad.ciudad}
          onChange={(e) => setNuevaPropiedad({ ...nuevaPropiedad, ciudad: e.target.value })}
          placeholder="Cancún"
        />
      </div>
      <div>
        <Label>País</Label>
        <SelectorPais
          value={paisASelector(nuevaPropiedad.pais)}
          ariaLabel="País de la propiedad"
          onChange={(codigo) =>
            setNuevaPropiedad((actual) => ({ ...actual, pais: selectorAPais(codigo, actual.pais) }))
          }
          placeholder="Selecciona un país"
        />
      </div>
      <div className="sm:col-span-2">
        <AccionHospitality capacidad="reservas.crear">
          <Button onClick={crearPropiedad} disabled={busy !== null}>
            {busy === 'propiedad' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Crear propiedad y continuar
          </Button>
        </AccionHospitality>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando puesta en marcha…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Puesta en marcha de la propiedad</h1>
          <p className="text-sm text-slate-600">
            Crea la propiedad, vincula sus unidades con los canales y comprueba disponibilidad, tarifas y
            reserva antes de conectarla.
          </p>
        </div>
        <Button variant="outline" onClick={() => cargar(propertyId || undefined)} disabled={busy !== null}>
          <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
        </Button>
      </div>

      {errorCarga && (
        <Alert variant="destructive">
          <AlertDescription>{errorCarga}</AlertDescription>
        </Alert>
      )}

      {/* Selección de propiedad */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-md">
            <Label>Propiedad</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una propiedad" />
              </SelectTrigger>
              <SelectContent>
                {propiedades.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre} · {p._count?.units ?? 0} unidad(es)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {snapshot && (
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Badge variant="outline" className={snapshot.propiedad.estado === 'conectada' ? ESTADO_PASO_UI.completado.clase : ESTADO_PASO_UI.pendiente.clase}>
                {snapshot.propiedad.estado === 'conectada' ? 'Conectada' : 'En configuración'}
              </Badge>
              <Link className="text-sm text-primary underline" href={`/dashboard/hospitality?tab=propiedades`}>
                Ver en Propiedades
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sin propiedad seleccionada todavía: el paso 1 es la puerta de entrada. */}
      {!snapshot && (
        <PasoCard
          paso={{
            clave: 'propiedad',
            orden: 1,
            titulo: 'Crear la propiedad',
            descripcion: 'Datos de la propiedad que se va a distribuir en los canales.',
            estado: 'pendiente',
            detalle:
              propiedades.length === 0
                ? 'Todavía no hay propiedades: crea la primera para empezar.'
                : 'Elige una propiedad arriba o crea una nueva.',
          }}
          icon={<Building2 className="h-4 w-4" />}
        >
          {formularioPropiedad}
        </PasoCard>
      )}

      {snapshot && (
        <div className="grid gap-4">
          {/* ── Paso 1 ── */}
          <PasoCard paso={paso('propiedad')} icon={<Building2 className="h-4 w-4" />}>
            {paso('propiedad')?.estado === 'completado' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  <strong>{snapshot.propiedad.nombre}</strong>
                  {snapshot.propiedad.ciudad ? ` · ${snapshot.propiedad.ciudad}` : ''}
                  {snapshot.propiedad.pais ? `, ${snapshot.propiedad.pais}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  ¿Necesitas dar de alta otra propiedad? Usa el formulario de abajo.
                </p>
                {formularioPropiedad}
              </div>
            ) : (
              formularioPropiedad
            )}
          </PasoCard>

          {/* ── Paso 2 ── */}
          <PasoCard paso={paso('unidades')} icon={<DoorOpen className="h-4 w-4" />}>
            <div className="space-y-4">
              {snapshot.unidades.length > 0 && (
                <div className="divide-y rounded-md border">
                  {snapshot.unidades.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-800">{u.nombre}</span>
                      <span className="text-slate-500">
                        {u.codigo ? `${u.codigo} · ` : ''}
                        {u.tipo} · {u.capacidad} huésped(es)
                        {u.tarifaBase != null ? ` · ${u.tarifaBase} ${u.moneda}` : ''}
                      </span>
                      <Badge variant="outline" className={u.vinculada ? ESTADO_PASO_UI.completado.clase : ESTADO_PASO_UI.pendiente.clase}>
                        {u.vinculada ? u.roomCode : 'sin vincular'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Nombre de la unidad *</Label>
                  <Input
                    value={nuevaUnidad.nombre}
                    onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, nombre: e.target.value })}
                    placeholder="Apartamento 1A"
                  />
                </div>
                <div>
                  <Label>Código</Label>
                  <Input
                    value={nuevaUnidad.codigo}
                    onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, codigo: e.target.value })}
                    placeholder="APT-1A"
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={nuevaUnidad.tipo} onValueChange={(v) => setNuevaUnidad({ ...nuevaUnidad, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_UNIDAD.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Capacidad</Label>
                  <Input
                    type="number"
                    min={1}
                    value={nuevaUnidad.capacidad}
                    onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, capacidad: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tarifa base por noche</Label>
                  <Input
                    type="number"
                    min={0}
                    value={nuevaUnidad.tarifaBase}
                    onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, tarifaBase: e.target.value })}
                    placeholder="1800"
                  />
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select
                    value={nuevaUnidad.moneda || monedaDeUnidadNueva}
                    onValueChange={(v) => setNuevaUnidad({ ...nuevaUnidad, moneda: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Divisa" /></SelectTrigger>
                    <SelectContent>
                      {MONEDAS_SELECCIONABLES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <AccionHospitality capacidad="reservas.crear">
                    <Button onClick={crearUnidad} disabled={busy !== null} variant="secondary">
                      {busy === 'unidad' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Añadir unidad
                    </Button>
                  </AccionHospitality>
                </div>
              </div>
            </div>
          </PasoCard>

          {/* ── Paso 3 ── */}
          <PasoCard paso={paso('datos_operativos')} icon={<DoorOpen className="h-4 w-4" />}>
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                Cada unidad necesita capacidad y precio: un plan de tarifa activo o una tarifa base. Los planes
                se gestionan en{' '}
                <Link className="text-primary underline" href="/dashboard/hospitality/tarifas">
                  Tarifas y disponibilidad
                </Link>
                .
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {snapshot.unidades.map((u) => {
                  const completa = u.capacidad > 0 && (u.planesActivos > 0 || u.tarifaBase != null);
                  return (
                    <li key={u.id} className={completa ? 'text-slate-600' : 'text-amber-700'}>
                      {u.nombre}: {u.capacidad} huésped(es),{' '}
                      {u.planesActivos > 0
                        ? `${u.planesActivos} plan(es) de tarifa activos`
                        : u.tarifaBase != null
                          ? `tarifa base ${u.tarifaBase} ${u.moneda}`
                          : 'sin precio configurado'}
                    </li>
                  );
                })}
              </ul>
            </div>
          </PasoCard>

          {/* ── Paso 4 ── */}
          <PasoCard paso={paso('conectividad')} icon={<Plug className="h-4 w-4" />}>
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                La conexión con los canales de distribución la configura la plataforma. Estado actual:{' '}
                <strong>{snapshot.conectividad.configurada ? 'conectividad configurada' : 'sin configurar'}</strong>
                {snapshot.conectividad.estado ? ` (${snapshot.conectividad.estado})` : ''}.
              </p>
              {!snapshot.conectividad.configurada && (
                <Alert>
                  <AlertDescription>
                    Un administrador de la plataforma debe cargar las credenciales de conectividad antes de poder
                    continuar con el mapping externo.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </PasoCard>

          {/* ── Paso 5 ── */}
          <PasoCard paso={paso('mapping_externo')} icon={<Link2 className="h-4 w-4" />}>
            <div className="space-y-3">
              {paso('mapping_externo')?.requisitoExterno && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{paso('mapping_externo')!.requisitoExterno!.titulo}</strong>
                    <span className="mt-1 block">
                      {paso('mapping_externo')!.requisitoExterno!.detalle}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Lo ejecuta: {paso('mapping_externo')!.requisitoExterno!.quien}.
                    </span>
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label>Código de propiedad del proveedor (hotelCode)</Label>
                  <Input
                    value={hotelCodeInput}
                    onChange={(e) => setHotelCodeInput(e.target.value)}
                    placeholder="El código que asigna el proveedor al onboarding"
                  />
                </div>
                {/* Leer el catálogo del proveedor exige `integraciones.ver` (no
                    `gestionar`): es una consulta, aunque se pida con POST. */}
                <AccionHospitality capacidad="integraciones.ver">
                  <Button onClick={() => cargarCatalogo(false)} disabled={busy !== null || !hotelCodeInput.trim()}>
                    {busy === 'catalogo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Obtener catálogo
                  </Button>
                </AccionHospitality>
              </div>

              {catalogoError && (
                <Alert variant="destructive">
                  <AlertDescription>{catalogoError}</AlertDescription>
                </Alert>
              )}

              {catalogo && catalogo.length === 0 && (
                <p className="text-sm text-slate-500">
                  El proveedor devolvió el catálogo vacío: revisa el código de propiedad.
                </p>
              )}

              {catalogo && catalogo.length > 0 && (
                <div className="divide-y rounded-md border">
                  {catalogo.map((r) => (
                    <div key={r.roomCode} className="px-3 py-2 text-sm">
                      <div className="font-medium text-slate-800">
                        {r.roomName} <span className="text-slate-400">({r.roomCode})</span>
                        {etiquetaOcupacion(r) && (
                          <span className="ml-2 text-xs text-slate-500">{etiquetaOcupacion(r)}</span>
                        )}
                      </div>
                      <div className="text-slate-500">
                        {r.rateplans.length > 0
                          ? r.rateplans.map((rp) => rp.rateplanName || rp.rateplanCode).join(' · ')
                          : 'sin planes de tarifa'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PasoCard>

          {/* ── Paso 6 ── */}
          <PasoCard paso={paso('vincular')} icon={<Link2 className="h-4 w-4" />}>
            <div className="space-y-3">
              {!catalogo || catalogo.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Obtén primero el catálogo externo (paso 5) para poder asignar habitaciones.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {snapshot.unidades.map((u) => (
                      <div key={u.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
                        <div className="text-sm">
                          <Label>{u.nombre}</Label>
                          <p className="text-slate-500">
                            {u.codigo || 'sin código'} · {u.capacidad} huésped(es)
                          </p>
                          {u.vinculoAutomatico && (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className="border-amber-200 bg-amber-100 text-amber-800"
                                title={`Vínculo creado por el sistema al recibir una reserva${
                                  u.vinculoMotivo ? ` (${u.vinculoMotivo})` : ''
                                }`}
                              >
                                Vínculo automático
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => {
                                  setUnidadADeshacer(u);
                                  setReservasDeshacer(null);
                                  void cargarReservasADeshacer(u);
                                }}
                                disabled={busy !== null}
                                title="Deshacer: deja la unidad libre y la habitación sin vínculo. No se volverá a crear solo."
                              >
                                {busy === `deshacer-${u.id}` ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <Undo2 className="mr-1 h-3 w-3" />
                                )}
                                Deshacer
                              </Button>
                            </div>
                          )}
                        </div>
                        <Select
                          value={asignaciones[u.id]?.roomCode || ''}
                          onValueChange={(v) =>
                            setAsignaciones((a) => ({ ...a, [u.id]: { roomCode: v, rateplanCode: '' } }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Habitación del proveedor" />
                          </SelectTrigger>
                          <SelectContent>
                            {catalogo.map((r) => (
                              <SelectItem key={r.roomCode} value={r.roomCode}>
                                {r.roomName} ({r.roomCode})
                                {etiquetaOcupacion(r) ? ` · ${etiquetaOcupacion(r)}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={asignaciones[u.id]?.rateplanCode || ''}
                          onValueChange={(v) =>
                            setAsignaciones((a) => ({
                              ...a,
                              [u.id]: { roomCode: a[u.id]?.roomCode || '', rateplanCode: v },
                            }))
                          }
                          disabled={!asignaciones[u.id]?.roomCode}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Plan de tarifa" />
                          </SelectTrigger>
                          <SelectContent>
                            {rateplansDe(asignaciones[u.id]?.roomCode || '').map((rp) => (
                              <SelectItem key={rp.rateplanCode} value={rp.rateplanCode}>
                                {rp.rateplanName} ({rp.rateplanCode})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <AccionHospitality capacidad="integraciones.gestionar">
                    <Button onClick={guardarMapping} disabled={busy !== null}>
                      {busy === 'mapping' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                      Guardar vínculos
                    </Button>
                  </AccionHospitality>
                </>
              )}

              <IncidenciasPanel
                incidencias={incidencias}
                resumen={resumenIncidencias}
                error={incidenciasError}
                cargando={cargandoIncidencias}
                reenviando={reenviando}
                autoVinculando={autoVinculando}
                onRefrescar={() => {
                  if (snapshot) cargarIncidencias(snapshot.propiedad.id);
                }}
                onReenviar={reenviarIncidencia}
                onAutoVincular={vincularAutomaticamente}
                onPartir={registrarPartida}
                partidaUnidades={partidaUnidades}
                setPartidaUnidades={setPartidaUnidades}
                partidaEnCurso={partidaEnCurso}
                noShows={noShowsCanal}
                noShowsResumen={resumenNoShows}
                vista={vistaIncidencias}
                onVista={setVistaIncidencias}
                unidades={snapshot?.unidades ?? []}
              />
            </div>
          </PasoCard>

          {/* ── Pasos 7 y 8 ── */}
          <PasoCard paso={paso('probar_disponibilidad')} icon={<RefreshCw className="h-4 w-4" />}>
            <PruebaBloque
              descripcion="Envía el inventario de la propiedad al proveedor y comprueba que lo acepta."
              boton="Probar disponibilidad"
              enCurso={busy === 'disponibilidad'}
              deshabilitado={busy !== null}
              resultado={resultados.disponibilidad}
              onEjecutar={() => ejecutarPrueba('disponibilidad')}
            />
          </PasoCard>

          <PasoCard paso={paso('probar_tarifas')} icon={<RefreshCw className="h-4 w-4" />}>
            <PruebaBloque
              descripcion="Envía precios y restricciones de venta y comprueba que el proveedor los acepta."
              boton="Probar tarifas"
              enCurso={busy === 'tarifas'}
              deshabilitado={busy !== null}
              resultado={resultados.tarifas}
              onEjecutar={() => ejecutarPrueba('tarifas')}
            />
          </PasoCard>

          {/* ── Paso 9 ── */}
          <PasoCard paso={paso('probar_reserva')} icon={<Send className="h-4 w-4" />}>
            <PruebaBloque
              descripcion="Registra una reserva de prueba por el mismo camino que las reales y la elimina después."
              boton="Probar reserva"
              enCurso={busy === 'reserva'}
              deshabilitado={busy !== null}
              resultado={resultados.reserva}
              onEjecutar={() => ejecutarPrueba('reserva')}
            />
          </PasoCard>

          {/* ── Paso 10 ── */}
          <PasoCard paso={paso('activar')} icon={<Rocket className="h-4 w-4" />}>
            <div className="space-y-3">
              {snapshot.puedeActivar.ok ? (
                <p className="text-sm text-slate-600">
                  Todos los requisitos están cumplidos. Activa la propiedad para dejarla lista para producción.
                </p>
              ) : (
                <div className="text-sm text-slate-600">
                  <p>Aún falta completar:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {snapshot.puedeActivar.faltantes.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {snapshot.propiedad.estado === 'conectada' ? (
                <Alert>
                  <AlertDescription className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Propiedad conectada. Ya recibe y sincroniza reservas.
                  </AlertDescription>
                </Alert>
              ) : (
                <AccionHospitality capacidad="integraciones.gestionar">
                  <Button onClick={activar} disabled={busy !== null || !snapshot.puedeActivar.ok}>
                    {busy === 'activar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                    Activar propiedad
                  </Button>
                </AccionHospitality>
              )}
            </div>
          </PasoCard>
        </div>
      )}

      {cargandoSnapshot && (
        <p className="text-sm text-slate-500">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Actualizando estado…
        </p>
      )}

      {/* Confirmación del deshacer: es un cambio de configuración, no un botón inocente. */}
      <AlertDialog
        open={unidadADeshacer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnidadADeshacer(null);
            setReservasDeshacer(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-destructive" />
              ¿Deshacer el vínculo de &quot;{unidadADeshacer?.nombre}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                {unidadADeshacer?.roomCode
                  ? `El sistema vinculó esta unidad con la habitación "${unidadADeshacer.roomCode}" del proveedor`
                  : 'El sistema creó este vínculo al recibir una reserva'}
                {unidadADeshacer?.vinculoMotivo ? ` (${unidadADeshacer.vinculoMotivo})` : ''}. Al
                deshacerlo:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  La unidad <strong>{unidadADeshacer?.nombre}</strong> queda libre para asignarla a
                  otra habitación.
                </li>
                <li>
                  El sistema <strong>no volverá a crearlo solo</strong> para esa habitación, ni
                  siquiera cuando llegue otra reserva. Si vuelve a hacer falta, tendrás que
                  asignarla a mano aquí.
                </li>
                <li>
                  Las reservas ya registradas <strong>siguen en esta unidad</strong>: se listan
                  debajo y podrás reasignarlas al terminar.
                </li>
              </ul>
              {cargandoReservasDeshacer ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Comprobando las reservas de la unidad…
                </p>
              ) : reservasDeshacer && reservasDeshacer.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs font-medium text-amber-800">
                    {reservasDeshacer.length} reserva(s) siguen en esta unidad:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
                    {reservasDeshacer.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium">{r.externalBookingId || r.id}</span>
                        {r.huesped ? ` · ${r.huesped}` : ''}
                        {r.checkIn ? ` · ${r.checkIn} → ${r.checkOut ?? ''}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : reservasDeshacer ? (
                <p className="text-xs text-emerald-700">
                  No queda ninguna reserva activa en esta unidad: puedes deshacer el vínculo sin
                  mover nada.
                </p>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AccionHospitality capacidad="integraciones.gestionar">
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const unidad = unidadADeshacer;
                  setUnidadADeshacer(null);
                  if (unidad) void deshacerVinculo(unidad);
                }}
              >
                Deshacer vínculo
              </AlertDialogAction>
            </AccionHospitality>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reservas que siguen en la unidad recién deshecha: el operador decide
          si las mueve (no se tocan solas: son noches facturadas). */}
      <AlertDialog
        open={deshacerReservas !== null}
        onOpenChange={(open) => {
          if (!open) setDeshacerReservas(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reservas que siguen en &quot;{deshacerReservas?.unitName}&quot;
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                El vínculo quedó deshecho
                {deshacerReservas?.roomCode ? ` (habitación "${deshacerReservas.roomCode}")` : ''}, pero
                estas reservas siguen asignadas a la unidad. Muévelas donde correspondan o déjalas
                como están: no se tocan solas.
              </p>
              <div className="divide-y rounded-md border border-slate-200">
                {deshacerReservas?.reservas.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="text-sm">
                      <p className="font-medium text-slate-800">
                        {r.externalBookingId || r.id}
                        {r.huesped ? ` · ${r.huesped}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.channel ? `${r.channel} · ` : ''}
                        {r.checkIn ? `${r.checkIn} → ${r.checkOut ?? ''}` : r.estado} ·{' '}
                        {r.huéspedes} huésped(es)
                      </p>
                    </div>
                    <Select
                      value=""
                      onValueChange={(v) => {
                        const destino = snapshot?.unidades.find((u) => u.id === v);
                        if (destino) {
                          void reasignarReserva(r.id, destino.id, destino.nombre);
                        }
                      }}
                      disabled={reasignando !== null}
                    >
                      <SelectTrigger className="h-8 w-[190px]">
                        <SelectValue placeholder="Mover a…" />
                      </SelectTrigger>
                      <SelectContent>
                        {snapshot?.unidades
                          .filter((u) => u.id !== deshacerReservas.unitId)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.nombre} · {u.capacidad} huésped(es)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Hecho</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PasoCard({
  paso,
  icon,
  children,
}: {
  paso: PasoOnboarding | null;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!paso) return null;
  const ui = ESTADO_PASO_UI[paso.estado];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {paso.orden}
          </span>
          <span className="flex items-center gap-2">
            {icon}
            {paso.titulo}
          </span>
          <Badge variant="outline" className={ui.clase}>
            {ui.label}
          </Badge>
        </CardTitle>
        <p className="text-sm text-slate-500">{paso.descripcion}</p>
        {paso.detalle && <p className="text-xs text-slate-500">{paso.detalle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Clave estable de una incidencia: hotelCode|roomCode|rateplanCode. */
function claveIncidencia(i: IncidenciaConectividad): string {
  return `${i.hotelCode}|${i.roomCode ?? ''}|${i.rateplanCode ?? ''}`;
}

/**
 * Incidencias del webhook para esta propiedad: habitaciones que recibieron
 * reservas sin tener vínculo con una unidad. Se muestran pegadas al paso 6
 * porque el arreglo es exactamente asignar esa habitación y guardar.
 *
 * Una vez guardado el vínculo, la incidencia se convierte en un reenvío: el
 * payload guardado se reenvía al Reservation Engine (idempotente por
 * bookingId) sin esperar a que el canal vuelva a enviar la reserva.
 */
function IncidenciasPanel({
  incidencias,
  resumen,
  error,
  cargando,
  reenviando,
  autoVinculando,
  onRefrescar,
  onReenviar,
  onAutoVincular,
  onPartir,
  partidaUnidades,
  setPartidaUnidades,
  partidaEnCurso,
  unidades,
  noShows,
  noShowsResumen,
  vista,
  onVista,
}: {
  incidencias: IncidenciaConectividad[] | null;
  resumen: ResumenIncidencias | null;
  error: string | null;
  cargando: boolean;
  reenviando: string | null;
  autoVinculando: boolean;
  onRefrescar: () => void;
  onReenviar: (incidencia: IncidenciaConectividad) => void;
  onAutoVincular: () => void;
  onPartir: (incidencia: IncidenciaConectividad) => void;
  partidaUnidades: Record<number, string>;
  setPartidaUnidades: (u: Record<number, string>) => void;
  partidaEnCurso: string | null;
  unidades: UnidadOnboarding[];
  noShows: NoShowCanal[] | null;
  noShowsResumen: ResumenNoShowsCanal | null;
  vista: 'vinculos' | 'noshow';
  onVista: (v: 'vinculos' | 'noshow') => void;
}) {
  const pendientes = incidencias?.filter((i) => !i.vinculo && i.eventoIds.length === 0).length ?? 0;
  const listas = incidencias?.filter((i) => i.eventoIds.length > 0).length ?? 0;
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <AlertTriangle className={`h-4 w-4 ${pendientes > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            {vista === 'vinculos' ? 'Reservas sin vínculo de unidad' : 'No-shows reportados por el canal'}
          </span>
          {pendientes > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
              {pendientes} habitación(es) por vincular
            </Badge>
          )}
          {listas > 0 && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-800">
              {listas} lista(s) para reenviar
            </Badge>
          )}
          {/* Filtro del panel: incidencias de vínculo vs no-shows que el canal
              reportó por el webhook (con el importe emitido de cada uno). */}
          <span className="ml-1 flex items-center gap-0.5 rounded-md border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => onVista('vinculos')}
              className={`rounded px-2 py-0.5 text-xs ${vista === 'vinculos' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Vínculos
            </button>
            <button
              type="button"
              onClick={() => onVista('noshow')}
              className={`rounded px-2 py-0.5 text-xs ${vista === 'noshow' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              No-shows{noShowsResumen && noShowsResumen.total > 0 ? ` (${noShowsResumen.total})` : ''}
            </button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vista === 'vinculos' && pendientes > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onAutoVincular}
              disabled={autoVinculando || cargando}
            >
              {autoVinculando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Vincular automáticamente
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefrescar} disabled={cargando}>
            {cargando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Revisar
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Reservas que el proveedor envió y el sistema no registró porque la habitación (roomCode) del payload no
        estaba vinculada a ninguna unidad. Asigna esa habitación en la tabla de arriba y guarda los vínculos; las
        que ya tengan vínculo se pueden reenviar al motor de reservas sin esperar al canal (nunca se duplican).
        La vinculación automática solo resuelve los casos inequívocos (el código o el nombre de la unidad coinciden,
        la ocupación de la habitación o los huéspedes de la reserva dejan una sola candidata, o queda una única
        unidad libre) y ya actúa al recibir la reserva; lo demás sigue necesitando tu decisión. Los bookings
        <strong>multi-habitación</strong> no se arreglan vinculando: hay que registrarlos por separado. Cada
        vínculo creado así guarda su motivo y queda registrado en el historial de sincronización, y <strong>guardar
        los vínculos los confirma como revisados</strong>: dejan de aparecer marcados y dejan de recordarse por
        notificación.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {vista === 'vinculos' && !error && incidencias && incidencias.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Sin incidencias pendientes.
          {resumen && resumen.resueltas > 0
            ? ` ${resumen.resueltas} habitación(es) ya tienen sus reservas registradas.`
            : ''}
        </p>
      )}

      {vista === 'vinculos' && !error && incidencias && incidencias.length > 0 && (
        <div className="divide-y rounded-md border">
          {incidencias.map((i) => {
            const clave = claveIncidencia(i);
            const enCurso = reenviando === clave;
            return (
              <div key={clave} className="space-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{i.roomCode || 'sin roomCode'}</span>
                  {i.rateplanCode && <span className="text-slate-400">· {i.rateplanCode}</span>}
                  {i.tipo === 'multi_habitacion' ? (
                    <Badge variant="destructive">Booking multi-habitación</Badge>
                  ) : i.vinculo ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-800">
                      Vínculo listo{i.vinculo.unit ? ` · ${i.vinculo.unit}` : ''}
                    </Badge>
                  ) : (
                    <Badge variant={i.tipo === 'propiedad_sin_mapping' ? 'destructive' : 'outline'}>
                      {i.tipo === 'propiedad_sin_mapping' ? 'Propiedad sin vincular' : 'Habitación sin vincular'}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    {i.property || i.hotelCode}
                    {i.property ? ` · ${i.hotelCode}` : ''}
                  </span>
                  <span>
                    último intento{' '}
                    {formatDistanceToNow(new Date(i.ultimaFecha), { addSuffix: true, locale: es })}
                  </span>
                  {i.ocupacion && (
                    <span>
                      {i.ocupacion.total} huésped(es)
                      {i.ocupacion.ninos > 0
                        ? ` (${i.ocupacion.adultos} adulto(s) + ${i.ocupacion.ninos} niño(s))`
                        : ''}
                    </span>
                  )}
                  {i.intentos > 1 && <span>{i.intentos} intentos</span>}
                  {i.canales.length > 0 && <span>{i.canales.join(', ')}</span>}
                  {i.bookingIds.length > 0 && <span>reservas: {i.bookingIds.join(', ')}</span>}
                  {i.registradas > 0 && (
                    <span className="text-emerald-700">
                      {i.registradas} de {i.registradas + i.eventoIds.length} ya registrada(s)
                    </span>
                  )}
                </div>
                {i.eventoIds.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onReenviar(i)}
                    disabled={reenviando !== null}
                  >
                    {enCurso ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Reenviar {i.eventoIds.length} reserva(s)
                  </Button>
                )}
                {!i.vinculo && i.tipo === 'propiedad_sin_mapping' && (
                  <p className="text-xs text-amber-700">
                    El código de propiedad {i.hotelCode} no tiene ningún vínculo guardado: revísalo en el paso 5.
                  </p>
                )}
                {i.tipo === 'multi_habitacion' && (
                  <p className="text-xs text-amber-700">
                    El booking trae varias habitaciones y este sistema registra una reserva por
                    booking: asígnale una unidad a cada habitación y regístralo partido. Reenviar
                    reproduciría el mismo rechazo y vincular unidades no resuelve este caso.
                  </p>
                )}
                {i.tipo === 'multi_habitacion' && (i.habitaciones?.length ?? 0) > 0 && (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                    {i.habitaciones!.map((h) => {
                      const registrada = h.registradas.length > 0;
                      return (
                        <div key={h.indice} className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm">
                            <p className="font-medium text-slate-800">
                              Habitación {h.indice + 1}
                              {h.roomCode ? ` · ${h.roomCode}` : ''}
                              {h.roomGuestName ? ` · ${h.roomGuestName}` : ''}
                            </p>
                            <p className="text-xs text-slate-500">
                              {h.ocupacion
                                ? `${h.ocupacion.adultos + h.ocupacion.ninos} huésped(es)${h.ocupacion.ninos > 0 ? ` (${h.ocupacion.adultos} adulto(s) + ${h.ocupacion.ninos} niño(s))` : ''}`
                                : 'ocupación no publicada'}
                              {registrada ? ` · ya registrada (${h.registradas.join(', ')})` : ''}
                            </p>
                          </div>
                          {registrada ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-100 text-emerald-800"
                            >
                              Registrada
                            </Badge>
                          ) : (
                            <Select
                              value={partidaUnidades[h.indice] ?? ''}
                              onValueChange={(v) => setPartidaUnidades({ ...partidaUnidades, [h.indice]: v })}
                              disabled={partidaEnCurso !== null}
                            >
                              <SelectTrigger className="h-8 w-[190px]">
                                <SelectValue placeholder="Unidad para esta habitación…" />
                              </SelectTrigger>
                              <SelectContent>
                                {unidades.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.nombre} · {u.capacidad} huésped(es)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                    {i.habitaciones!.some((h) => h.registradas.length === 0) && (
                      <Button
                        size="sm"
                        onClick={() => onPartir(i)}
                        disabled={partidaEnCurso !== null}
                      >
                        {partidaEnCurso === clave ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Registrar {i.habitaciones!.filter((h) => h.registradas.length === 0).length} reserva(s)
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {vista === 'vinculos' && resumen && resumen.eventosAnalizados > 0 && (
        <p className="text-xs text-slate-400">
          Últimos {resumen.eventosAnalizados} evento(s) sin mapping revisados
          {resumen.resueltas > 0 ? ` · ${resumen.resueltas} ya con su reserva registrada` : ''}.
        </p>
      )}

      {vista === 'noshow' && (
        <div className="space-y-2">
          {!error && noShows && noShows.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              El canal no ha reportado ningún no-show.
            </p>
          )}
          {!error && noShows && noShows.length > 0 && (
            <div className="divide-y rounded-md border">
              {noShows.map((n) => (
                <div key={n.reservationId} className="space-y-1 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{n.referencia}</span>
                    {n.unit && <span className="text-slate-500">· {n.unit}</span>}
                    {n.penalizacion ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
                        Penalización {formatearImporte(n.penalizacion.importe, n.penalizacion.moneda)}
                        {n.penalizacion.facturada ? ' · facturada' : ' · sin facturar'}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sin cargo (canal externo o política «ninguna»)</Badge>
                    )}
                    {n.estado !== 'no_show' && <Badge variant="outline">estado: {n.estado}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{n.property || n.hotelCode}</span>
                    {n.canal && <span>{n.canal}</span>}
                    {n.huesped && (
                      <span>
                        {n.huesped}
                        {n.email ? ` · ${n.email}` : ''}
                      </span>
                    )}
                    <span>
                      estancia {n.checkIn.slice(0, 10)} → {n.checkOut.slice(0, 10)}
                    </span>
                    <span>
                      reportado {formatDistanceToNow(new Date(n.reportadoEn), { addSuffix: true, locale: es })}
                    </span>
                    {n.intentos > 1 && <span>{n.intentos} evento(s)</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {noShowsResumen && noShowsResumen.total > 0 && (
            <p className="text-xs text-slate-400">
              {noShowsResumen.total} no-show(s) reportado(s) por el canal ·{' '}
              {noShowsResumen.conPenalizacion} con cargo emitido.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PruebaBloque({
  descripcion,
  boton,
  enCurso,
  deshabilitado,
  resultado,
  onEjecutar,
}: {
  descripcion: string;
  boton: string;
  enCurso: boolean;
  deshabilitado: boolean;
  resultado?: { ok: boolean; texto: string; unidades?: RechazoDeCanal['descartadas'] };
  onEjecutar: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{descripcion}</p>
      <Button onClick={onEjecutar} disabled={deshabilitado} variant="secondary">
        {enCurso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        {boton}
      </Button>
      {resultado && (
        <Alert variant={resultado.ok ? 'default' : 'destructive'}>
          <AlertDescription className="flex items-start gap-2">
            {resultado.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
            )}
            <div className="space-y-2">
              <p>{resultado.texto}</p>
              {resultado.unidades && resultado.unidades.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {resultado.unidades.map((u) => (
                    <li key={u.unitId}>
                      <span className="font-medium">{u.nombre}</span>
                      {u.roomCode ? ` · habitación ${u.roomCode}` : ''}
                      {u.codigosTarifa.length > 0 ? ` · tarifa ${u.codigosTarifa.join(', ')}` : ''}
                      {u.motivos[0] ? ` — ${u.motivos[0]}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!resultado && (
        <p className="flex items-center gap-1 text-xs text-slate-400">
          <XCircle className="h-3 w-3" /> Todavía no se ha ejecutado
        </p>
      )}
    </div>
  );
}
