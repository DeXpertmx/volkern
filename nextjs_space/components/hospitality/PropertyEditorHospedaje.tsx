'use client';

/**
 * Volkern Hospitality — Editor de propiedades por secciones.
 *
 * Porta al vertical de hospedaje la experiencia del editor de Real Estate:
 * selector de propiedad con progreso, barra lateral con secciones y estado, y
 * panel principal por sección. Autosave con debounce (1,2 s) sobre el PATCH de
 * `/api/hospitality/properties/[id]`, que ya valida políticas y audita.
 *
 * Las unidades no se editan aquí (tienen sus propias pantallas); la sección
 * las lista y enlaza a la gestión.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '@/lib/api-client';
import { formatearImporte } from '@/lib/moneda';
import {
  SECCIONES_HOSPEDAJE,
  PRIMERA_SECCION_HOSPEDAJE,
  borradorDesdeProperty,
  payloadDesdeBorradorHospedaje,
  estadoSeccionesHospedaje,
  progresoHospedaje,
  hacerPortadaHospedaje,
  reordenarFotosHospedaje,
  ESTADOS_PROPERTY,
  POLITICAS_NO_SHOW,
  POLITICAS_SALIDA,
  type DraftHospedaje,
  type FotoHospedaje,
  type PropertyWire,
  type SeccionHospedaje,
  type SeccionHospedajeInfo,
} from '@/lib/hospitality/property-editor-config';
import {
  VistaGlobalHospedaje,
  ModalDetalleHospedaje,
  type TipoModalHospedaje,
} from './PropertyEditorModalsHospedaje';
import { ModalUnidadesHospedaje } from './ModalUnidadesHospedaje';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Home,
  MapPin,
  BedDouble,
  Settings2,
  ShieldCheck,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Loader2,
  ChevronLeft,
  Search,
  Upload,
  MoreHorizontal,
  X,
  Star,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FOTOS = 30;
const MIN_BYTES = 50 * 1024;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TITULO_FOTO = 100;

export interface PropertyEditorHospedajeProps {
  propertyId: string;
  onBack: () => void;
}

const ICONO_SECCION: Record<SeccionHospedaje, typeof Home> = {
  global: Home,
  descripcion: Home,
  fotos: ImageIcon,
  ubicacion: MapPin,
  unidades: BedDouble,
  operacion: Settings2,
  cumplimiento: ShieldCheck,
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

/**
 * Tarjeta de foto secundaria ordenable por drag & drop (@dnd-kit). Los
 * listeners de arrastre viven en la imagen: el input de título y el menú
 * quedan fuera del gesto de arrastre.
 */
function FotoOrdenable({
  id,
  foto,
  indiceReal,
  titulo,
  maxTitulo,
  onTitulo,
  onPortada,
  onQuitar,
}: {
  id: string;
  foto: FotoHospedaje;
  indiceReal: number;
  titulo: string;
  maxTitulo: number;
  onTitulo: (indice: number, titulo: string) => void;
  onPortada: (indice: number) => void;
  onQuitar: (indice: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="relative aspect-[16/10] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={foto.url}
          alt={titulo || `Foto ${indiceReal + 1}`}
          draggable={false}
          className={isDragging ? 'h-full w-full cursor-grabbing object-cover' : 'h-full w-full cursor-grab object-cover'}
          {...attributes}
          {...listeners}
        />
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 rounded-full bg-white/90 text-foreground shadow hover:bg-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPortada(indiceReal)}>
                <Star className="h-3.5 w-3.5 mr-2" /> Hacer portada
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onQuitar(indiceReal)}
              >
                <X className="h-3.5 w-3.5 mr-2" /> Quitar foto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <input
          value={titulo}
          onChange={(e) => onTitulo(indiceReal, e.target.value)}
          placeholder="Añadir un título"
          maxLength={maxTitulo}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {titulo.length}/{maxTitulo}
        </span>
      </div>
    </div>
  );
}

export function PropertyEditorHospedaje({ propertyId, onBack }: PropertyEditorHospedajeProps) {
  const [propiedad, setPropiedad] = useState<PropertyWire | null>(null);
  const [lista, setLista] = useState<PropertyWire[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seccion, setSeccion] = useState<SeccionHospedaje>(PRIMERA_SECCION_HOSPEDAJE);
  const [guardando, setGuardando] = useState(false);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busquedaLista, setBusquedaLista] = useState('');
  const [subiendo, setSubiendo] = useState(0);
  const [modal, setModal] = useState<TipoModalHospedaje | null>(null);
  const [modalUnidades, setModalUnidades] = useState(false);

  const [draft, setDraft] = useState<DraftHospedaje | null>(null);
  const draftRef = useRef<DraftHospedaje | null>(null);
  draftRef.current = draft;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sucioRef = useRef(false);

  // Sensores de drag & drop de fotos (hooks antes de cualquier early return).
  const sensoresFoto = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ─── Carga ─────────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await apiFetch(`/api/hospitality/properties/${propertyId}?includeUnits=true`);
      if (!res.ok) {
        toast.error('No se pudo cargar la propiedad');
        onBack();
        return;
      }
      const data = await res.json();
      const p: PropertyWire = data.property;
      setPropiedad(p);
      setDraft(borradorDesdeProperty(p));
    } catch {
      toast.error('Error de conexión');
      onBack();
    } finally {
      setCargando(false);
    }
  }, [propertyId, onBack]);

  const cargarLista = useCallback(async () => {
    try {
      const res = await apiFetch('/api/hospitality/properties');
      if (res.ok) {
        const data = await res.json();
        setLista(data.properties || []);
      }
    } catch {
      // El selector es secundario.
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarLista();
  }, [cargar, cargarLista]);

  // ─── Autosave ──────────────────────────────────────────────────────────────

  const guardar = useCallback(async () => {
    const actual = draftRef.current;
    if (!actual || !sucioRef.current) return;
    sucioRef.current = false;
    setGuardando(true);
    try {
      const res = await apiFetch(`/api/hospitality/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadDesdeBorradorHospedaje(actual)),
      });
      if (!res.ok) {
        sucioRef.current = true;
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Error al guardar');
        return;
      }
      const data = await res.json();
      const p: PropertyWire = data.property;
      setPropiedad(p);
      setDraft((prev) => (prev && draftRef.current !== prev ? prev : borradorDesdeProperty(p)));
    } catch {
      sucioRef.current = true;
      toast.error('Error de conexión al guardar');
    } finally {
      setGuardando(false);
    }
  }, [propertyId]);

  const actualizar = useCallback(
    (cambios: Partial<DraftHospedaje>) => {
      sucioRef.current = true;
      setDraft((prev) => (prev ? { ...prev, ...cambios } : prev));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(guardar, 1200);
    },
    [guardar]
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // ─── Fotos: subir / portada / quitar / titular ─────────────────────────────

  const subirFotos = useCallback(
    async (files: FileList | File[]) => {
      if (!draft) return;
      const listaArchivos = Array.from(files);
      const slot = MAX_FOTOS - draft.fotos.length;
      if (slot <= 0) {
        toast.error(`Máximo ${MAX_FOTOS} fotos`);
        return;
      }
      const aceptadas = listaArchivos.slice(0, slot);
      let galeria = draft.fotos;
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
          galeria = [...galeria, { url: data.url }];
          actualizar({ fotos: galeria });
          subidas++;
        }
        if (subidas > 0) toast.success(`${subidas} foto(s) subida(s)`);
      } finally {
        setSubiendo(0);
      }
    },
    [draft, actualizar]
  );

  // ─── Estado memoizado ──────────────────────────────────────────────────────

  const estado = useMemo(() => (draft ? estadoSeccionesHospedaje(draft) : null), [draft]);
  const progreso = useMemo(() => (draft ? progresoHospedaje(draft) : 0), [draft]);

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
    p.nombre?.toLowerCase().includes(busquedaLista.toLowerCase())
  );

  const tituloDe = (f: FotoHospedaje) => f.titulo ?? '';
  const cambiarTitulo = (indice: number, titulo: string) => {
    const copia = draft.fotos.map((f, i) =>
      i === indice
        ? { url: f.url, ...(titulo ? { titulo: titulo.slice(0, MAX_TITULO_FOTO) } : {}) }
        : f
    );
    actualizar({ fotos: copia });
  };

  const alSoltarFoto = (evento: DragEndEvent) => {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;
    // Los ids son «foto-<índice real>»: inmunes a URLs duplicadas.
    const desde = Number(String(active.id).replace('foto-', ''));
    const hasta = Number(String(over.id).replace('foto-', ''));
    if (!Number.isInteger(desde) || !Number.isInteger(hasta)) return;
    actualizar({ fotos: reordenarFotosHospedaje(draft.fotos, desde, hasta) });
  };

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
                  <img src={draft.fotos[0].url} alt="" className="h-full w-full object-cover" />
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
                          if (!activo) onBack(); // el cambio de propiedad lo gestiona la página (?property=)
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
                          activo && 'bg-accent'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                        {activo && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <nav aria-label="Secciones del editor de hospedaje" className="space-y-5">
            {Object.entries(
              SECCIONES_HOSPEDAJE.reduce<Record<string, SeccionHospedajeInfo[]>>((acc, s) => {
                (acc[s.grupo] ||= []).push(s);
                return acc;
              }, {})
            ).map(([grupo, items]) => (
              <div key={grupo}>
                <h3 className="mb-2 px-2 text-[13px] font-semibold text-foreground">{grupo}</h3>
                <ul className="space-y-0.5">
                  {items.map((s) => {
                    const activa = s.id === seccion;
                    const Icon = ICONO_SECCION[s.id];
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
              {SECCIONES_HOSPEDAJE.find((s) => s.id === seccion)?.label}
            </h1>
            <BadgeEstado completa={estado[seccion]} />
          </div>

          <div className="mt-4 space-y-4">
            {/* ─── Vista global ─── */}
            {seccion === 'global' && (
              <VistaGlobalHospedaje
                draft={draft}
                onIrSeccion={setSeccion}
                abrirModal={(cual) => setModal(cual)}
                onGestionarUnidades={() => setModalUnidades(true)}
              />
            )}

            {/* ─── Descripción ─── */}
            {seccion === 'descripcion' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="hp-nombre">Nombre del establecimiento</Label>
                  <Input
                    id="hp-nombre"
                    value={draft.nombre}
                    onChange={(e) => actualizar({ nombre: e.target.value })}
                    placeholder="Casa Marfil"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hp-codigo">Código interno</Label>
                  <Input
                    id="hp-codigo"
                    value={draft.codigo}
                    onChange={(e) => actualizar({ codigo: e.target.value })}
                    placeholder="CASA-MARFIL"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hp-desc">Descripción</Label>
                  <Textarea
                    id="hp-desc"
                    value={draft.descripcion}
                    onChange={(e) => actualizar({ descripcion: e.target.value })}
                    placeholder="Describe el establecimiento, la zona y qué lo hace especial"
                    rows={6}
                  />
                </div>
              </>
            )}

            {/* ─── Fotos ─── */}
            {seccion === 'fotos' && (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Subir fotos"
                  onClick={() => document.getElementById('hp-foto-input')?.click()}
                  onKeyDown={(e) =>
                    (e.key === 'Enter' || e.key === ' ') &&
                    document.getElementById('hp-foto-input')?.click()
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
                  id="hp-foto-input"
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
                  Asegúrate de que tus fotos estén en formato JPEG o PNG, con un tamaño entre 50 KB y 20 MB.
                </p>

                {draft.fotos.length === 0 ? (
                  <div className="rounded-xl border bg-card p-8 text-center">
                    <Home className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Aún no hay fotos. Sube la primera para completar la sección.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="relative overflow-hidden rounded-xl border bg-card">
                      <Badge className="absolute left-3 top-3 z-10 border-0 bg-indigo-600 text-white">
                        Portada
                      </Badge>
                      <div className="aspect-[16/7] w-full bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.fotos[0].url}
                          alt={tituloDe(draft.fotos[0]) || 'Portada'}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex items-center gap-2 border-t px-3 py-2.5">
                        <input
                          value={tituloDe(draft.fotos[0])}
                          onChange={(e) => cambiarTitulo(0, e.target.value)}
                          placeholder="Añadir un título"
                          maxLength={MAX_TITULO_FOTO}
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {tituloDe(draft.fotos[0]).length}/{MAX_TITULO_FOTO}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => actualizar({ fotos: draft.fotos.slice(1) })}
                            >
                              <X className="h-3.5 w-3.5 mr-2" /> Quitar foto
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {draft.fotos.length > 1 && (
                      <DndContext
                        sensors={sensoresFoto}
                        collisionDetection={closestCenter}
                        onDragEnd={alSoltarFoto}
                      >
                        <SortableContext
                          items={draft.fotos.slice(1).map((_, i) => `foto-${i + 1}`)}
                          strategy={rectSortingStrategy}
                        >
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {draft.fotos.slice(1).map((foto, i) => {
                              const indiceReal = i + 1;
                              return (
                                <FotoOrdenable
                                  key={foto.url + i}
                                  id={`foto-${indiceReal}`}
                                  foto={foto}
                                  indiceReal={indiceReal}
                                  titulo={tituloDe(foto)}
                                  maxTitulo={MAX_TITULO_FOTO}
                                  onTitulo={cambiarTitulo}
                                  onPortada={(indice) =>
                                    actualizar({ fotos: hacerPortadaHospedaje(draft.fotos, indice) })
                                  }
                                  onQuitar={(indice) =>
                                    actualizar({
                                      fotos: draft.fotos.filter((_, j) => j !== indice),
                                    })
                                  }
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    {draft.fotos.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Arrastra una foto para reordenar la galería. La portada se cambia con «Hacer portada».
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            {/* ─── Ubicación ─── */}
            {seccion === 'ubicacion' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['hp-direccion', 'Dirección', 'direccion'],
                    ['hp-ciudad', 'Ciudad', 'ciudad'],
                    ['hp-estado', 'Estado / Provincia', 'estadoProvincia'],
                    ['hp-pais', 'País', 'pais'],
                    ['hp-cp', 'Código postal', 'cp'],
                    ['hp-zona', 'Zona', 'zona'],
                    ['hp-lat', 'Latitud', 'lat'],
                    ['hp-lng', 'Longitud', 'lng'],
                  ] as const
                ).map(([id, label, campo]) => (
                  <div key={id} className="space-y-2">
                    <Label htmlFor={id}>{label}</Label>
                    <Input
                      id={id}
                      value={draft[campo]}
                      onChange={(e) => actualizar({ [campo]: e.target.value } as Partial<DraftHospedaje>)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ─── Unidades ─── */}
            {seccion === 'unidades' && (
              <>
                {draft.units.length === 0 ? (
                  <div className="rounded-xl border bg-card p-8 text-center">
                    <BedDouble className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Aún no hay unidades. Créalas desde la gestión de unidades.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draft.units.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {u.nombre}
                            {u.codigo ? <span className="ml-2 text-xs text-muted-foreground">{u.codigo}</span> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Capacidad {u.capacidad ?? '—'}
                            {u.tarifaBase != null
                              ? ` · ${formatearImporte(u.tarifaBase, u.moneda || '', 0)}/noche`
                              : ''}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={onBack}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Gestionar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ─── Operación ─── */}
            {seccion === 'operacion' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Estado de la propiedad</Label>
                  <Select
                    value={draft.estado}
                    onValueChange={(v) => actualizar({ estado: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_PROPERTY.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hp-timezone">Zona horaria</Label>
                  <Input
                    id="hp-timezone"
                    value={draft.timezone}
                    onChange={(e) => actualizar({ timezone: e.target.value })}
                    placeholder="America/Mexico_City"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Política de no-show</Label>
                  <Select
                    value={draft.politicaNoShow}
                    onValueChange={(v) => actualizar({ politicaNoShow: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLITICAS_NO_SHOW.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Salida anticipada</Label>
                  <Select
                    value={draft.politicaSalidaAnticipada}
                    onValueChange={(v) => actualizar({ politicaSalidaAnticipada: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLITICAS_SALIDA.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hp-holds">Horas de retención de holds</Label>
                  <Input
                    id="hp-holds"
                    type="number"
                    min={0}
                    max={720}
                    value={draft.holdHoras}
                    onChange={(e) => actualizar({ holdHoras: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Entre 0 (sin caducidad) y 720.</p>
                </div>
              </div>
            )}

            {/* ─── Cumplimiento SES.HOSPEDAJES ─── */}
            {seccion === 'cumplimiento' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hp-ses-codigo">Código de establecimiento (MIR)</Label>
                  <Input
                    id="hp-ses-codigo"
                    value={draft.sesCodigo}
                    onChange={(e) => actualizar({ sesCodigo: e.target.value })}
                    placeholder="Código del Ministerio"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hp-ses-municipio">Municipio INE</Label>
                  <Input
                    id="hp-ses-municipio"
                    value={draft.sesMunicipio}
                    onChange={(e) => actualizar({ sesMunicipio: e.target.value })}
                    placeholder="Código INE del municipio"
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Datos que el alta de partes de viajeros envía a SES.HOSPEDAJES. Déjalos vacíos si
                  la propiedad todavía no está registrada.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modales de detalle de la Vista global. */}
      <ModalDetalleHospedaje
        tipo="habitaciones"
        abierto={modal === 'habitaciones'}
        onOpenChange={(abierto) => setModal(abierto ? 'habitaciones' : null)}
        draft={draft}
        actualizar={actualizar}
      />
      <ModalDetalleHospedaje
        tipo="camas"
        abierto={modal === 'camas'}
        onOpenChange={(abierto) => setModal(abierto ? 'camas' : null)}
        draft={draft}
        actualizar={actualizar}
      />
      <ModalDetalleHospedaje
        tipo="servicios"
        abierto={modal === 'servicios'}
        onOpenChange={(abierto) => setModal(abierto ? 'servicios' : null)}
        draft={draft}
        actualizar={actualizar}
      />

      {/* Gestión de unidades desde la Vista global: al cerrar con cambios,
          recarga la propiedad para que resumen y sección de unidades
          reflejen el inventario real. */}
      <ModalUnidadesHospedaje
        abierto={modalUnidades}
        onOpenChange={setModalUnidades}
        propertyId={propertyId}
        unidades={draft.units}
        onCambio={cargar}
      />
    </div>
  );
}
