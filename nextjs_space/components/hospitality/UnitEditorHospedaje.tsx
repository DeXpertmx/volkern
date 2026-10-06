'use client';

/**
 * Volkern Hospitality — Editor de unidad por secciones.
 *
 * Porta a la UNIDAD la misma experiencia guiada que ya tiene la propiedad
 * (PropertyEditorHospedaje): barra lateral con selector de unidad, progreso y
 * estado por sección; panel principal por sección y una «Vista global» con
 * tarjetas resumen que saltan a su sección. Autosave con debounce (1,2 s)
 * sobre el PATCH de `/api/hospitality/units/[id]`, que normaliza el detalle y
 * audita.
 *
 * Diferencia con la propiedad: la unidad no tiene ubicación ni políticas
 * (hereda del complejo); su ficha es identidad (nombre, tipo, capacidad),
 * distribución (habitaciones y camas, el reencuadre del commit 45c8ef07),
 * amenidades, fotos y tarifa.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  BedDouble,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  LayoutGrid,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Search,
  Sofa,
  Sparkles,
  User,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AMENIDADES_UNIDAD_CATALOGO,
  CAMAS_CATALOGO_HOSPEDAJE,
  ESTADOS_UNIDAD_HOSPEDAJE,
  HABITACIONES_GRUPOS_HOSPEDAJE,
  MONEDAS_UNIDAD_CATALOGO,
  PRIMERA_SECCION_UNIDAD,
  SECCIONES_UNIDAD_HOSPEDAJE,
  TIPOS_UNIDAD_HOSPEDAJE,
  borradorDesdeUnidad,
  estadoSeccionesUnidadHospedaje,
  payloadDesdeBorradorUnidad,
  progresoUnidadHospedaje,
  resumenAmenidadesUnidad,
  resumenCamasUnidad,
  resumenHabitacionesUnidad,
  resumenTarifaUnidad,
  labelDeHabitacionHospedaje,
  type DraftUnidadHospedaje,
  type SeccionUnidadHospedaje,
  type SeccionUnidadHospedajeInfo,
  type UnitWireFull,
} from '@/lib/hospitality/property-editor-config';

const MAX_FOTOS_UNIDAD = 30;
const MIN_BYTES = 50 * 1024;
const MAX_BYTES = 20 * 1024 * 1024;

const ICONO_SECCION_UNIDAD: Record<SeccionUnidadHospedaje, typeof BedDouble> = {
  general: LayoutGrid,
  basico: User,
  espacio: BedDouble,
  amenidades: Sparkles,
  fotos: Upload,
  tarifas: CircleDollarSign,
};

function BadgeEstadoUnidad({ completa }: { completa: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-medium',
        completa
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
      )}
    >
      {completa ? 'Completado' : 'Pendiente'}
    </Badge>
  );
}

function BarraProgresoUnidad({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }}
      />
    </div>
  );
}

/** Tarjeta resumen de la Vista global (idéntica a la de la propiedad). */
function TarjetaResumenUnidad({
  icono,
  titulo,
  resumen,
  detalle,
  onClick,
}: {
  icono: React.ReactNode;
  titulo: string;
  resumen: string;
  /** Chips «2 × Cama doble» bajo el resumen (opcional). */
  detalle?: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block truncate text-sm text-muted-foreground">{resumen}</span>
        {detalle && detalle.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {detalle.map((d) => (
              <span
                key={d}
                className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {d}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Chip «2 × Dormitorio» a partir de los pares [id, n] del catálogo. */
function chipsPorTipoUnidad(pares: Array<readonly [string, number]> | null): string[] {
  if (!pares) return [];
  return pares.map(([id, n]) => `${n} × ${labelDeHabitacionHospedaje(id)}`);
}

/**
 * Fila de contador +/− de la sección «Habitaciones y camas». El callback
 * recibe un DELTA (±1) y el padre lo aplica sobre su estado previo: si se
 * computara aquí `valor + 1`, dos clicks rápidos antes del re-render leerían
 * el mismo `valor` y sumarían 1 solo. Mismo patrón que en Real Estate.
 */
function FilaContadorUnidad({
  label,
  valor,
  onDelta,
}: {
  label: string;
  valor: number;
  onDelta: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Quitar ${label}`}
          disabled={valor <= 0}
          onClick={() => onDelta(-1)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
            valor > 0
              ? 'border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10'
              : 'border-muted bg-muted text-muted-foreground/40'
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-5 text-center text-sm font-medium tabular-nums">{valor}</span>
        <button
          type="button"
          aria-label={`Añadir ${label}`}
          onClick={() => onDelta(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/5 text-foreground transition-colors hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export interface UnitEditorHospedajeProps {
  unitId: string;
  onBack: () => void;
}

export function UnitEditorHospedaje({ unitId, onBack }: UnitEditorHospedajeProps) {
  const router = useRouter();
  const [unidad, setUnidad] = useState<UnitWireFull | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [seccion, setSeccion] = useState<SeccionUnidadHospedaje>(PRIMERA_SECCION_UNIDAD);
  const [subiendo, setSubiendo] = useState(0);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busquedaLista, setBusquedaLista] = useState('');
  const [hermanas, setHermanas] = useState<UnitWireFull[]>([]);

  const [draft, setDraft] = useState<DraftUnidadHospedaje | null>(null);
  const draftRef = useRef<DraftUnidadHospedaje | null>(null);
  draftRef.current = draft;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sucioRef = useRef(false);

  // ─── Carga ───────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await apiFetch(`/api/hospitality/units/${unitId}`);
      if (!res.ok) {
        toast.error('No se pudo cargar la unidad');
        onBack();
        return;
      }
      const data = await res.json();
      const u: UnitWireFull = data.unit;
      setUnidad(u);
      setDraft(borradorDesdeUnidad(u));
      // Lista de la propiedad para el selector: mismo endpoint que la portada.
      const resLista = await apiFetch(`/api/hospitality/units?propertyId=${u.propertyId}`);
      if (resLista.ok) {
        const dataLista = await resLista.json();
        setHermanas((dataLista.units || []) as UnitWireFull[]);
      }
    } catch {
      toast.error('Error de conexión');
      onBack();
    } finally {
      setCargando(false);
    }
  }, [unitId, onBack]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ─── Autosave (debounce 1,2 s, igual que el editor de propiedad) ─────────
  const guardar = useCallback(async () => {
    const actual = draftRef.current;
    if (!actual || !sucioRef.current) return;
    if (!actual.nombre.trim()) return; // sin nombre no hay PATCH: espera a que lo rellenen
    sucioRef.current = false;
    setGuardando(true);
    try {
      const res = await apiFetch(`/api/hospitality/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadDesdeBorradorUnidad(actual)),
      });
      if (!res.ok) {
        sucioRef.current = true;
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Error al guardar');
        return;
      }
      const data = await res.json();
      const u: UnitWireFull = data.unit;
      setUnidad(u);
      setDraft((prev) => (prev && draftRef.current !== prev ? prev : borradorDesdeUnidad(u)));
    } catch {
      sucioRef.current = true;
      toast.error('Error de conexión al guardar');
    } finally {
      setGuardando(false);
    }
  }, [unitId]);

  const actualizar = useCallback(
    (cambios: Partial<DraftUnidadHospedaje>) => {
      sucioRef.current = true;
      setDraft((prev) => (prev ? { ...prev, ...cambios } : prev));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(guardar, 1200);
    },
    [guardar]
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  // ─── Distribución: delta ±1 sobre contadores (anti double-click) ─────────
  const deltaEspacio = useCallback(
    (grupo: 'habitaciones' | 'camas', id: string, delta: number) => {
      const d = draftRef.current;
      if (!d) return;
      const mapa = { ...d[grupo] };
      const n = (mapa[id] ?? 0) + delta;
      if (n <= 0) delete mapa[id];
      else mapa[id] = n;
      actualizar({ [grupo]: mapa } as Partial<DraftUnidadHospedaje>);
    },
    [actualizar]
  );

  // ─── Fotos: subir / quitar (mismo endpoint de catálogo que la propiedad) ──
  const subirFotos = useCallback(
    async (files: FileList | File[]) => {
      const d = draftRef.current;
      if (!d) return;
      const listaArchivos = Array.from(files);
      const slot = MAX_FOTOS_UNIDAD - d.fotos.length;
      if (slot <= 0) {
        toast.error(`Máximo ${MAX_FOTOS_UNIDAD} fotos`);
        return;
      }
      const aceptadas = listaArchivos.slice(0, slot);
      let galeria = d.fotos;
      let subidas = 0;
      setSubiendo(aceptadas.length);
      try {
        for (const file of aceptadas) {
          if (file.type && !['image/jpeg', 'image/png'].includes(file.type)) {
            toast.error(`${file.name}: solo JPEG o PNG`);
            continue;
          }
          if (file.size < MIN_BYTES || file.size > MAX_BYTES) {
            toast.error(`${file.name}: entre 50 KB y 20 MB`);
            continue;
          }
          const formData = new FormData();
          formData.append('file', file);
          const res = await apiFetch('/api/upload/catalogo', { method: 'POST', body: formData });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            toast.error(err.error || `Error al subir ${file.name}`);
            continue;
          }
          const data = await res.json();
          galeria = [...galeria, data.url];
          actualizar({ fotos: galeria });
          subidas++;
        }
        if (subidas > 0) toast.success(`${subidas} foto(s) subida(s)`);
      } finally {
        setSubiendo(0);
      }
    },
    [actualizar]
  );

  // ─── Estado memoizado ────────────────────────────────────────────────────
  const estado = useMemo(
    () => (draft ? estadoSeccionesUnidadHospedaje(draft) : null),
    [draft]
  );
  const progreso = useMemo(() => (draft ? progresoUnidadHospedaje(draft) : 0), [draft]);

  if (cargando || !draft || !unidad || !estado) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-6">
          <div className="hidden w-72 space-y-3 md:block">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="flex-1 space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const listaFiltrada = hermanas.filter((u) =>
    u.nombre?.toLowerCase().includes(busquedaLista.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6">
      {/* Cabecera */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {guardando ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              Guardado
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ─── Barra lateral ─── */}
        <aside className="w-full shrink-0 lg:w-72">
          <div className="relative mb-5">
            <button
              type="button"
              onClick={() => setSelectorAbierto((v) => !v)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {draft.fotos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.fotos[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <BedDouble className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{draft.nombre || 'Sin título'}</p>
                <div className="mt-1 flex items-center gap-2">
                  <BarraProgresoUnidad porcentaje={progreso} />
                  <span className="shrink-0 text-[10px] text-muted-foreground">{progreso}%</span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>

            {selectorAbierto && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-card shadow-lg">
                <div className="relative p-2">
                  <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={busquedaLista}
                    onChange={(e) => setBusquedaLista(e.target.value)}
                    placeholder="Buscar unidad…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto pb-1">
                  {listaFiltrada.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados</p>
                  )}
                  {listaFiltrada.map((u) => {
                    const activo = u.id === unitId;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectorAbierto(false);
                          if (!activo) {
                            // El cambio de unidad lo gestiona la página (?unit=):
                            // navegar a la ficha de la otra unidad sin salir.
                            router.push(`/dashboard/hospitality?unit=${u.id}`, {
                              scroll: false,
                            });
                          }
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
                          activo && 'bg-accent'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{u.nombre}</span>
                        {activo && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <nav aria-label="Secciones del editor de unidad" className="space-y-5">
            {Object.entries(
              SECCIONES_UNIDAD_HOSPEDAJE.reduce<Record<string, SeccionUnidadHospedajeInfo[]>>(
                (acc, s) => {
                  (acc[s.grupo] ||= []).push(s);
                  return acc;
                },
                {}
              )
            ).map(([grupo, items]) => (
              <div key={grupo}>
                <h3 className="mb-2 px-2 text-[13px] font-semibold text-foreground">{grupo}</h3>
                <ul className="space-y-0.5">
                  {items.map((s) => {
                    const activa = s.id === seccion;
                    const Icon = ICONO_SECCION_UNIDAD[s.id];
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setSeccion(s.id)}
                          aria-current={activa ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors',
                            activa
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate text-left">{s.label}</span>
                          {estado[s.id] && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* ─── Panel principal ─── */}
        <main className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {SECCIONES_UNIDAD_HOSPEDAJE.find((s) => s.id === seccion)?.label}
            </h1>
            <BadgeEstadoUnidad completa={estado[seccion]} />
          </div>

          <div className="mt-4 space-y-4">
            {/* ─── Vista global ─── */}
            {seccion === 'general' && (
              <div className="space-y-2" data-testid="vista-global-unidad">
                <TarjetaResumenUnidad
                  icono={<User className="h-5 w-5 text-muted-foreground" />}
                  titulo="Nombre y descripción"
                  resumen={draft.descripcion ? draft.descripcion.slice(0, 80) : 'Sin descripción'}
                  onClick={() => setSeccion('basico')}
                />
                <TarjetaResumenUnidad
                  icono={<Sofa className="h-5 w-5 text-muted-foreground" />}
                  titulo="Habitaciones"
                  resumen={resumenHabitacionesUnidad(draft)}
                  detalle={chipsPorTipoUnidad(
                    Object.entries(draft.habitaciones).map(
                      ([id, n]) => [id, n] as const
                    )
                  )}
                  onClick={() => setSeccion('espacio')}
                />
                <TarjetaResumenUnidad
                  icono={<BedDouble className="h-5 w-5 text-muted-foreground" />}
                  titulo="Distribución de las camas"
                  resumen={resumenCamasUnidad(draft)}
                  detalle={chipsPorTipoUnidad(
                    Object.entries(draft.camas).map(([id, n]) => [id, n] as const)
                  )}
                  onClick={() => setSeccion('espacio')}
                />
                <TarjetaResumenUnidad
                  icono={<Sparkles className="h-5 w-5 text-muted-foreground" />}
                  titulo="Amenidades"
                  resumen={resumenAmenidadesUnidad(draft)}
                  onClick={() => setSeccion('amenidades')}
                />
                <TarjetaResumenUnidad
                  icono={
                    draft.fotos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.fotos[0]}
                        alt=""
                        className="h-full w-full rounded-lg object-cover"
                      />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )
                  }
                  titulo="Fotos"
                  resumen={
                    draft.fotos.length > 0
                      ? `${draft.fotos.length} ${draft.fotos.length === 1 ? 'foto' : 'fotos'}`
                      : 'Sin fotos'
                  }
                  onClick={() => setSeccion('fotos')}
                />
                <TarjetaResumenUnidad
                  icono={<CircleDollarSign className="h-5 w-5 text-muted-foreground" />}
                  titulo="Tarifa y estado"
                  resumen={resumenTarifaUnidad(draft)}
                  onClick={() => setSeccion('tarifas')}
                />
              </div>
            )}

            {/* ─── Nombre y descripción ─── */}
            {seccion === 'basico' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="hu-nombre">Nombre de la unidad</Label>
                  <Input
                    id="hu-nombre"
                    value={draft.nombre}
                    onChange={(e) => actualizar({ nombre: e.target.value })}
                    placeholder="Suite Océano 101"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hu-codigo">Código interno</Label>
                    <Input
                      id="hu-codigo"
                      value={draft.codigo}
                      onChange={(e) => actualizar({ codigo: e.target.value })}
                      placeholder="SUI-101"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={draft.tipo}
                      onValueChange={(v) => actualizar({ tipo: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_UNIDAD_HOSPEDAJE.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hu-descripcion">Descripción</Label>
                  <Textarea
                    id="hu-descripcion"
                    value={draft.descripcion}
                    onChange={(e) => actualizar({ descripcion: e.target.value })}
                    placeholder="Describe la unidad: vista, ambiente, detalles…"
                    rows={6}
                  />
                </div>
              </>
            )}

            {/* ─── Habitaciones y camas (distribución de ESTA unidad) ─── */}
            {seccion === 'espacio' && (
              <>
                {HABITACIONES_GRUPOS_HOSPEDAJE.map((grupo) => (
                  <div key={grupo.titulo} className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">{grupo.titulo}</p>
                    <div className="mt-1 divide-y">
                      {grupo.items.map((h) => (
                        <FilaContadorUnidad
                          key={h.id}
                          label={h.label}
                          valor={draft.habitaciones[h.id] ?? 0}
                          onDelta={(delta) => deltaEspacio('habitaciones', h.id, delta)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-sm font-medium">Distribución de las camas</p>
                  <div className="mt-1 divide-y">
                    {CAMAS_CATALOGO_HOSPEDAJE.map((c) => (
                      <FilaContadorUnidad
                        key={c.id}
                        label={c.label}
                        valor={draft.camas[c.id] ?? 0}
                        onDelta={(delta) => deltaEspacio('camas', c.id, delta)}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta distribución alimenta los agregados de la propiedad y la ficha pública de
                  reserva. Se guarda sola.
                </p>
              </>
            )}

            {/* ─── Amenidades ─── */}
            {seccion === 'amenidades' && (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap gap-1.5">
                  {AMENIDADES_UNIDAD_CATALOGO.map((a) => {
                    const marcada = draft.amenidades.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          actualizar({
                            amenidades: marcada
                              ? draft.amenidades.filter((x) => x !== a)
                              : [...draft.amenidades, a],
                          })
                        }
                        className={cn(
                          'text-xs rounded-full px-2.5 py-1 border transition-colors',
                          marcada
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Fotos (subida real, igual que la propiedad) ─── */}
            {seccion === 'fotos' && (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Subir fotos"
                  onClick={() => document.getElementById('hu-foto-input')?.click()}
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') &&
                    document.getElementById('hu-foto-input')?.click()
                  }
                  className="flex h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50"
                >
                  {subiendo > 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Subiendo {subiendo} foto(s)…
                    </div>
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <input
                  id="hu-foto-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) subirFotos(e.target.files);
                    e.target.value = '';
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Asegúrate de que tus fotos estén en formato JPEG o PNG, con un tamaño entre 50 KB
                  y 20 MB.
                </p>
                {draft.fotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {draft.fotos.map((url, i) => (
                      <div key={`${url}-${i}`} className="overflow-hidden rounded-xl border bg-card">
                        <div className="relative aspect-[16/10] bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute right-2 top-2">
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-7 w-7 rounded-full bg-white/90 text-foreground shadow hover:bg-white"
                              aria-label={`Quitar foto ${i + 1}`}
                              onClick={() =>
                                actualizar({ fotos: draft.fotos.filter((_, j) => j !== i) })
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ─── Tarifa y estado ─── */}
            {seccion === 'tarifas' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hu-tarifa">Tarifa base (por noche)</Label>
                    <Input
                      id="hu-tarifa"
                      type="number"
                      min={0}
                      value={draft.tarifaBase}
                      onChange={(e) => actualizar({ tarifaBase: e.target.value })}
                      placeholder="Ej: 2500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select
                      value={draft.moneda}
                      onValueChange={(v) => actualizar({ moneda: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONEDAS_UNIDAD_CATALOGO.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hu-capacidad">Capacidad (huéspedes)</Label>
                  <Input
                    id="hu-capacidad"
                    type="number"
                    min={1}
                    max={50}
                    value={draft.capacidad}
                    onChange={(e) => actualizar({ capacidad: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado operativo</Label>
                  <Select
                    value={draft.estado}
                    onValueChange={(v) => actualizar({ estado: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_UNIDAD_HOSPEDAJE.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Un cambio de estado empuja disponibilidad a los canales conectados.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
