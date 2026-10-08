'use client';

/**
 * Volkern Real Estate — Editor de propiedades por secciones.
 *
 * Vista guiada que sustituye al diálogo único de alta/edición: barra lateral
 * con selector de propiedad y estado de completado por sección, y panel
 * principal que pinta solo la sección activa. Los modales de habitaciones,
 * camas y equipamiento abren desde las tarjetas de «Descripción general».
 *
 * Autosave con debounce (1,2 s) sobre PATCH /api/real-estate/properties/[id];
 * el estado «Guardando…/Guardado» queda en la cabecera. Es la misma API que ya
 * usaba la ficha clásica, extendida con `roomsDetail`, `bedsDetail` y
 * `servicios`.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { formatearImporte } from '@/lib/moneda';
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers';
import {
  GRUPOS_EDITOR,
  SECCIONES_EDITOR,
  PRIMERA_SECCION,
  estadoSecciones,
  progresoGlobal,
  type SeccionId,
} from '@/lib/real-estate/property-editor-config';
import {
  borradorDesdeInmueble,
  payloadDesdeBorrador,
  estadoDesdeBorrador,
  type DraftInmueble,
  type FotoItem,
} from '@/lib/real-estate/property-editor-draft';
import {
  SeccionDescripcion,
  SeccionFotos,
  SeccionUbicacion,
  SeccionContacto,
  SeccionHabitaciones,
  SeccionEquipamiento,
  SeccionPrecios,
  SeccionDisponibilidad,
  SeccionCumplimiento,
} from './PropertyEditorSections';
import { ModalDetalle } from './PropertyEditorModals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Home,
  MapPin,
  Phone,
  BedDouble,
  Sofa,
  DollarSign,
  Calendar,
  ShieldCheck,
  Link2,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Loader2,
  ChevronLeft,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PropertyEditorProps {
  /** Id de la propiedad a editar (del listado). */
  propertyId: string;
  /** Vuelta al listado al cerrar. */
  onBack: () => void;
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

const ICONO_SECCION: Record<SeccionId, typeof Home> = {
  descripcion: Home,
  fotos: ImageIcon,
  ubicacion: MapPin,
  contacto: Phone,
  habitaciones: BedDouble,
  equipamiento: Sofa,
  precios: DollarSign,
  disponibilidad: Calendar,
  cumplimiento: ShieldCheck,
  sincronizacion: Link2,
};

function BadgeEstado({ completa }: { completa: boolean }) {
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

/** Barra de progreso fina usada en el selector de propiedad y en el menú. */
function BarraProgreso({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }}
      />
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function PropertyEditor({ propertyId, onBack }: PropertyEditorProps) {
  const router = useRouter();

  const [propiedad, setPropiedad] = useState<InmuebleParsed | null>(null);
  const [cargando, setCargando] = useState(true);
  const [seccion, setSeccion] = useState<SeccionId>(PRIMERA_SECCION);
  const [guardando, setGuardando] = useState(false);
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  // Lista para el selector de propiedad (barra lateral).
  const [lista, setLista] = useState<InmuebleParsed[]>([]);
  const [busquedaLista, setBusquedaLista] = useState('');

  // ── Borrador + autosave ──
  const [draft, setDraft] = useState<DraftInmueble | null>(null);
  const draftRef = useRef<DraftInmueble | null>(null);
  draftRef.current = draft;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sucioRef = useRef(false);

  // ── Modales de detalle ──
  const [modalHabitaciones, setModalHabitaciones] = useState(false);
  const [modalCamas, setModalCamas] = useState(false);
  const [modalServicios, setModalServicios] = useState(false);

  // ─── Carga ─────────────────────────────────────────────────────────────────

  const cargarPropiedad = useCallback(async () => {
    setCargando(true);
    try {
      const res = await apiFetch(`/api/real-estate/properties/${propertyId}`);
      if (!res.ok) {
        toast.error('No se pudo cargar la propiedad');
        onBack();
        return;
      }
      const data: InmuebleParsed = await res.json();
      setPropiedad(data);
      setDraft(borradorDesdeInmueble(data));
    } catch {
      toast.error('Error de conexión');
      onBack();
    } finally {
      setCargando(false);
    }
  }, [propertyId, onBack]);

  const cargarLista = useCallback(async () => {
    try {
      const res = await apiFetch('/api/real-estate/properties?limit=100');
      if (res.ok) {
        const data = await res.json();
        setLista(data.properties || []);
      }
    } catch {
      // El selector es secundario: sin lista la ficha sigue editable.
    }
  }, []);

  useEffect(() => {
    cargarPropiedad();
    cargarLista();
  }, [cargarPropiedad, cargarLista]);

  // ─── Autosave ──────────────────────────────────────────────────────────────

  const guardar = useCallback(async () => {
    const actual = draftRef.current;
    if (!actual || !sucioRef.current) return;
    sucioRef.current = false;
    setGuardando(true);
    try {
      const res = await apiFetch(`/api/real-estate/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadDesdeBorrador(actual)),
      });
      if (!res.ok) {
        sucioRef.current = true;
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Error al guardar');
        return;
      }
      const actualizada: InmuebleParsed = await res.json();
      setPropiedad(actualizada);
      // Refresco el borrador con lo persistido, preservando lo que el usuario
      // haya tecleado mientras se guardaba.
      setDraft((prev) => {
        const limpio = borradorDesdeInmueble(actualizada);
        return prev && draftRef.current !== prev ? prev : limpio;
      });
    } catch {
      sucioRef.current = true;
      toast.error('Error de conexión al guardar');
    } finally {
      setGuardando(false);
    }
  }, [propertyId]);

  const programarGuardado = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(guardar, 1200);
  }, [guardar]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const actualizar = useCallback(
    (cambios: Partial<DraftInmueble>) => {
      sucioRef.current = true;
      setDraft((prev) => (prev ? { ...prev, ...cambios } : prev));
      programarGuardado();
    },
    [programarGuardado]
  );

  const actualizarMedia = useCallback(
    (fotos: FotoItem[]) => actualizar({ media: fotos }),
    [actualizar]
  );

  // ─── Estado de completado (memoizado sobre el borrador) ───────────────────

  const estado = useMemo(
    () => (draft ? estadoSecciones(estadoDesdeBorrador(draft)) : null),
    [draft]
  );
  const progreso = useMemo(
    () => (draft ? progresoGlobal(estadoDesdeBorrador(draft)) : 0),
    [draft]
  );

  // ─── Modales de detalle ────────────────────────────────────────────────────

  const abrirModal = (cual: 'habitaciones' | 'camas' | 'servicios') => {
    if (cual === 'habitaciones') setModalHabitaciones(true);
    else if (cual === 'camas') setModalCamas(true);
    else setModalServicios(true);
  };

  // ─── Render: carga ─────────────────────────────────────────────────────────

  if (cargando || !draft || !propiedad || !estado) {
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

  const listaFiltrada = lista.filter((p) =>
    p.nombre.toLowerCase().includes(busquedaLista.toLowerCase())
  );

  const seccionesPorGrupo = GRUPOS_EDITOR.map((grupo) => ({
    grupo,
    items: SECCIONES_EDITOR.filter((s) => s.grupo === grupo.id),
  }));

  const propsSeccion = { draft, actualizar, abrirModal };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6">
      {/* Cabecera: volver + nombre + estado de guardado */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        </div>
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
          {/* Selector de propiedad */}
          <div className="relative mb-5">
            <button
              type="button"
              onClick={() => setSelectorAbierto((v) => !v)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {draft.media[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.media[0].url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Home className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{draft.nombre || 'Sin título'}</p>
                <div className="mt-1 flex items-center gap-2">
                  <BarraProgreso porcentaje={progreso} />
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
                    placeholder="Buscar propiedad…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto pb-1">
                  {listaFiltrada.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Sin resultados</p>
                  )}
                  {listaFiltrada.map((p) => {
                    const activo = p.id === propertyId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectorAbierto(false);
                          if (!activo) router.push(`?edit=${p.id}`, { scroll: false });
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
                          activo && 'bg-accent'
                        )}
                      >
                        <div className="h-8 w-11 shrink-0 overflow-hidden rounded bg-muted">
                          {Array.isArray(p.media) && p.media.length > 0 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={(p.media[0] as any)?.url || p.media[0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Home className="h-3 w-3 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                        {activo && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Grupos y secciones */}
          <nav aria-label="Secciones del editor" className="space-y-5">
            {seccionesPorGrupo.map(({ grupo, items }) => (
              <div key={grupo.id}>
                <h3 className="mb-2 px-2 text-[13px] font-semibold text-foreground">
                  {grupo.label}
                </h3>
                <ul className="space-y-0.5">
                  {items.map((s) => {
                    const activa = s.id === seccion;
                    const Icon = ICONO_SECCION[s.id];
                    // «Sincronizar ajustes» no tiene estado de completado.
                    const completa =
                      s.id in estado ? estado[s.id as keyof typeof estado] : true;
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
                          {completa && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          )}
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
              {SECCIONES_EDITOR.find((s) => s.id === seccion)?.label}
            </h1>
            {seccion !== 'sincronizacion' && (
              <BadgeEstado completa={estado[seccion as keyof typeof estado]} />
            )}
          </div>

          <div className="mt-4">
            {seccion === 'descripcion' && <SeccionDescripcion {...propsSeccion} />}
            {seccion === 'fotos' && (
              <SeccionFotos {...propsSeccion} media={draft.media} onChange={actualizarMedia} />
            )}
            {seccion === 'ubicacion' && <SeccionUbicacion {...propsSeccion} />}
            {seccion === 'contacto' && <SeccionContacto {...propsSeccion} />}
            {seccion === 'habitaciones' && <SeccionHabitaciones {...propsSeccion} />}
            {seccion === 'equipamiento' && <SeccionEquipamiento {...propsSeccion} />}
            {seccion === 'precios' && (
              <SeccionPrecios
                {...propsSeccion}
                nombre={propiedad.nombre}
                formatear={(n) => formatearImporte(n, draft.moneda, 0)}
              />
            )}
            {seccion === 'disponibilidad' && <SeccionDisponibilidad {...propsSeccion} />}
            {seccion === 'cumplimiento' && <SeccionCumplimiento {...propsSeccion} />}
            {seccion === 'sincronizacion' && (
              <div className="rounded-xl border bg-card p-8 text-center">
                <Link2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <h3 className="font-medium">Sincronizar con canales</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Aquí podrás conectar la ficha con portales y canales de distribución. Sección
                  preparada para la integración con canales.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modales de detalle */}
      <ModalDetalle
        tipo="habitaciones"
        abierto={modalHabitaciones}
        onOpenChange={setModalHabitaciones}
        draft={draft}
        actualizar={actualizar}
      />
      <ModalDetalle
        tipo="camas"
        abierto={modalCamas}
        onOpenChange={setModalCamas}
        draft={draft}
        actualizar={actualizar}
      />
      <ModalDetalle
        tipo="servicios"
        abierto={modalServicios}
        onOpenChange={setModalServicios}
        draft={draft}
        actualizar={actualizar}
      />
    </div>
  );
}
