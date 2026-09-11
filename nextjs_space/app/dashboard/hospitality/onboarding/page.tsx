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
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
}

type EstadoPaso = 'completado' | 'pendiente' | 'error' | 'bloqueado';

interface PasoOnboarding {
  clave: string;
  orden: number;
  titulo: string;
  descripcion: string;
  estado: EstadoPaso;
  detalle?: string;
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
  const [nuevaUnidad, setNuevaUnidad] = useState({
    nombre: '',
    codigo: '',
    tipo: 'apartamento',
    capacidad: '2',
    tarifaBase: '',
    moneda: 'MXN',
  });

  // Paso 5 — catálogo externo
  const [hotelCodeInput, setHotelCodeInput] = useState('');
  const [catalogo, setCatalogo] = useState<RoomCatalogo[] | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  // Paso 6 — asignaciones por unidad
  const [asignaciones, setAsignaciones] = useState<Record<string, { roomCode: string; rateplanCode: string }>>({});

  // Resultado detallado de la última prueba por paso
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; texto: string }>>({});

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
      setNuevaUnidad({ nombre: '', codigo: '', tipo: 'apartamento', capacidad: '2', tarifaBase: '', moneda: 'MXN' });
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error guardando el mapping');
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
      const texto = data.ok
        ? prueba === 'reserva'
          ? `Reserva recibida y eliminada · ${detalle.unidad || ''} ${detalle.roomCode || ''}`
          : `${detalle.pushCount ?? 0} envío(s) aceptados por el proveedor`
        : data.error || 'La prueba falló';

      setResultados((r) => ({ ...r, [prueba]: { ok: !!data.ok, texto } }));
      if (data.ok) toast.success(prueba === 'reserva' ? 'Reserva de prueba verificada' : 'Prueba superada');
      else toast.error(texto);
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
        <Input
          value={nuevaPropiedad.pais}
          onChange={(e) => setNuevaPropiedad({ ...nuevaPropiedad, pais: e.target.value })}
          placeholder="México"
        />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={crearPropiedad} disabled={busy !== null}>
          {busy === 'propiedad' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Crear propiedad y continuar
        </Button>
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
                  <Input
                    value={nuevaUnidad.moneda}
                    onChange={(e) => setNuevaUnidad({ ...nuevaUnidad, moneda: e.target.value })}
                    placeholder="MXN"
                  />
                </div>
                <div className="sm:col-span-3">
                  <Button onClick={crearUnidad} disabled={busy !== null} variant="secondary">
                    {busy === 'unidad' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Añadir unidad
                  </Button>
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
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label>Código de propiedad del proveedor (hotelCode)</Label>
                  <Input
                    value={hotelCodeInput}
                    onChange={(e) => setHotelCodeInput(e.target.value)}
                    placeholder="El código que asigna el proveedor al onboarding"
                  />
                </div>
                <Button onClick={() => cargarCatalogo(false)} disabled={busy !== null || !hotelCodeInput.trim()}>
                  {busy === 'catalogo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Obtener catálogo
                </Button>
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
                  <Button onClick={guardarMapping} disabled={busy !== null}>
                    {busy === 'mapping' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                    Guardar vínculos
                  </Button>
                </>
              )}
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
                <Button onClick={activar} disabled={busy !== null || !snapshot.puedeActivar.ok}>
                  {busy === 'activar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                  Activar propiedad
                </Button>
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
  resultado?: { ok: boolean; texto: string };
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
          <AlertDescription className="flex items-center gap-2">
            {resultado.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            {resultado.texto}
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
