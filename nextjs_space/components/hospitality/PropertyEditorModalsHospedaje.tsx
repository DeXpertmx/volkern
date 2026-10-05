'use client';

/**
 * Volkern Hospitality — Vista global y modales de detalle del editor.
 *
 * Replica en hospedaje la pieza del editor de Real Estate: una primera sección
 * «Vista global» con tarjetas resumen (lápiz para saltar a su sección) y los
 * tres modales de detalle con contadores +/− y selector de servicios con
 * buscador, grupos acordeón y badges de portal (⌂ Airbnb / ⚡ Booking).
 *
 * «Guardar» aplica al borrador y dispara el autosave del editor; «Cancelar»
 * descarta los cambios locales del modal.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  HABITACIONES_GRUPOS_HOSPEDAJE,
  CAMAS_CATALOGO_HOSPEDAJE,
  SERVICIOS_GRUPOS_HOSPEDAJE,
  contarFotosHospedaje,
  detalleCamasHospedaje,
  detalleHabitacionesHospedaje,
  labelDeHabitacionHospedaje,
  portadaHospedaje,
  resumenFotosHospedaje,
  sumarContadores,
  type DetalleAlojamiento,
  type DraftHospedaje,
  type SeccionHospedaje,
  type UnidadWire,
} from '@/lib/hospitality/property-editor-config';
import { ChevronDown, ChevronRight, DoorOpen, Home, Image as ImageIcon, MapPin, Minus, Pencil, Plus, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TipoModalHospedaje = 'habitaciones' | 'camas' | 'servicios';

interface ModalDetalleHospedajeProps {
  tipo: TipoModalHospedaje;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  draft: DraftHospedaje;
  actualizar: (cambios: Partial<DraftHospedaje>) => void;
}

const TITULOS: Record<TipoModalHospedaje, { titulo: string; descripcion: string }> = {
  // Habitaciones y camas del COMPLEJO son de cada unidad: en la ficha de la
  // propiedad solo se muestran como AGREGADO (solo lectura) de lo declarado
  // en sus unidades. El modal no permite editarlas.
  habitaciones: {
    titulo: 'Habitaciones (todas las unidades)',
    descripcion:
      'Suma de la distribución declarada en cada unidad. Para cambiarla, edita la distribución de cada unidad desde «Unidades».',
  },
  camas: {
    titulo: 'Distribución de camas (todas las unidades)',
    descripcion:
      'Suma de las camas declaradas en cada unidad. Para cambiarla, edita la distribución de cada unidad desde «Unidades».',
  },
  servicios: {
    titulo: 'Áreas comunes e instalaciones del complejo',
    descripcion:
      'Marca lo que comparten todos los huéspedes del establecimiento (alberca, oficina, estacionamiento…).',
  },
};

/**
 * Fila de contador +/− compartida por los modales de habitaciones y camas.
 *
 * El callback recibe un DELTA (±1) y el padre lo aplica sobre su estado previo:
 * si se computara aquí `valor + 1`, dos clicks rápidos antes del re-render
 * leerían el mismo `valor` y sumarían 1 solo. Mismo patrón que en Real Estate.
 */
function FilaContador({
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

/** Acordeón con cabecera uniforme para grupos del modal de servicios. */
function GrupoAcordeon({
  icono,
  titulo,
  abierto,
  onToggle,
  children,
}: {
  icono?: React.ReactNode;
  titulo: string;
  abierto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={abierto} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 border-t py-3 text-left">
        <span className="flex items-center gap-2.5 text-sm font-medium">
          {icono}
          {titulo}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', abierto && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function ModalDetalleHospedaje({
  tipo,
  abierto,
  onOpenChange,
  draft,
  actualizar,
}: ModalDetalleHospedajeProps) {
  const meta = TITULOS[tipo];

  // Estado local del modal: se sincroniza con el borrador al abrir y solo se
  // aplica al borrador al guardar, para que «Cancelar» no deje cambios a medias.
  // Habitaciones y camas ya no se editan aquí (agregado de unidades): solo los
  // servicios del complejo mantienen estado local.
  const [servicios, setServicios] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');

  // Solo se sincroniza al ABRIR: si dependiera de `draft`, cada autosave que
  // aterrice con el modal abierto machacaría la selección que el usuario está
  // tocando. Se lee el borrador por referencia en ese instante.
  const draftRef = useRef(draft);
  useEffect(() => {
    if (!abierto) return;
    const actual = draftRef.current.detalle;
    // Habitaciones y camas son de cada unidad: aquí solo se editan los
    // servicios del complejo (los otros dos modales son ahora solo lectura).
    if (tipo === 'servicios') setServicios([...actual.servicios]);
    setBusqueda('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tipo]);

  const guardar = () => {
    if (tipo !== 'servicios') return; // solo lectura (agregado de unidades)
    const detalle: DetalleAlojamiento = { servicios };
    actualizar({ detalle });
    onOpenChange(false);
  };

  const busquedaLimpia = busqueda.trim().toLowerCase();
  const gruposServiciosFiltrados = SERVICIOS_GRUPOS_HOSPEDAJE.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      busquedaLimpia ? i.label.toLowerCase().includes(busquedaLimpia) : true
    ),
  })).filter((g) => g.items.length > 0);

  // Grupos abiertos por defecto: el primero («Popular»; y todos, cuando se
  // busca). El usuario puede plegar cualquiera; el estado vive mientras el
  // modal esté montado.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (abierto) setGruposAbiertos({});
  }, [abierto]);
  const grupoAbierto = (id: string, porDefecto: boolean) =>
    gruposAbiertos[id] ?? (busquedaLimpia.length > 0 ? true : porDefecto);

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="px-5 pb-3 pt-5 text-center">
          <DialogTitle>{meta.titulo}</DialogTitle>
          <DialogDescription className="mx-auto max-w-xs">{meta.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {/* ─── Habitaciones (SOLO LECTURA: agregado de las unidades) ─── */}
          {tipo === 'habitaciones' && (
            <div className="rounded-xl border">
              {HABITACIONES_GRUPOS_HOSPEDAJE.map((grupo, gi) => (
                <div key={grupo.titulo} className={cn(gi > 0 && 'border-t')}>
                  <GrupoAcordeon
                    icono={<User className="h-4 w-4" />}
                    titulo={grupo.titulo}
                    abierto={grupoAbierto(grupo.titulo, true)}
                    onToggle={() =>
                      setGruposAbiertos((prev) => ({
                        ...prev,
                        [grupo.titulo]: !grupoAbierto(grupo.titulo, true),
                      }))
                    }
                  >
                    <div className="divide-y">
                      {grupo.items.map((h) => (
                        <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>{h.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            ×{(draft.agregadoUnidades?.habitaciones ?? {})[h.id] ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </GrupoAcordeon>
                </div>
              ))}
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Editable desde cada unidad (sección «Unidades» / portada de Propiedades).
              </p>
            </div>
          )}

          {/* ─── Camas (SOLO LECTURA: agregado de las unidades) ─── */}
          {tipo === 'camas' && (
            <div className="rounded-xl border p-1">
              <div className="divide-y">
                {CAMAS_CATALOGO_HOSPEDAJE.map((cama) => (
                  <div key={cama.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{cama.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      ×{(draft.agregadoUnidades?.camas ?? {})[cama.id] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Editable desde cada unidad (sección «Unidades» / portada de Propiedades).
              </p>
            </div>
          )}

          {/* ─── Servicios ─── */}
          {tipo === 'servicios' && (
            <>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar servicios y equipamiento…"
                  className="pl-9"
                />
              </div>
              <div className="pb-2">
                {gruposServiciosFiltrados.map((grupo, gi) => (
                  <GrupoAcordeon
                    key={grupo.id}
                    titulo={grupo.titulo}
                    abierto={grupoAbierto(grupo.id, gi === 0)}
                    onToggle={() =>
                      setGruposAbiertos((prev) => ({
                        ...prev,
                        [grupo.id]: !grupoAbierto(grupo.id, gi === 0),
                      }))
                    }
                  >
                    <div className="space-y-1">
                      {grupo.items.map((item) => {
                        const marcado = servicios.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2 hover:bg-accent/40"
                          >
                            <span className="flex items-center gap-3">
                              <Checkbox
                                checked={marcado}
                                onCheckedChange={(v) =>
                                  setServicios((prev) =>
                                    v ? [...prev, item.id] : prev.filter((s) => s !== item.id)
                                  )
                                }
                              />
                              <span className="text-sm">{item.label}</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              {item.airbnb && (
                                <span title="Airbnb" className="text-rose-500">
                                  ⌂
                                </span>
                              )}
                              {item.booking && (
                                <span title="Booking.com" className="text-blue-500">
                                  ⚡
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </GrupoAcordeon>
                ))}
                {gruposServiciosFiltrados.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Sin resultados para «{busqueda}»
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-3 border-t px-5 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vista global ────────────────────────────────────────────────────────────

interface VistaGlobalProps {
  draft: DraftHospedaje;
  onIrSeccion: (seccion: SeccionHospedaje) => void;
  abrirModal: (cual: TipoModalHospedaje) => void;
  /** Abre el modal de gestión de unidades (crear/editar sin salir). */
  onGestionarUnidades: () => void;
}

/** Tarjeta resumen con lápiz, como en el diseño de referencia. */
function TarjetaResumen({
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
              <ChipResumen key={d}>{d}</ChipResumen>
            ))}
          </span>
        ) : null}
      </span>
      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * Tarjeta de fotos de la Vista global: la portada como fondo de la tarjeta con
 * overlay para la legibilidad; sin fotos, cae al diseño genérico con icono.
 * Ambos estados navegan a la sección de Fotos.
 */
function TarjetaFotosGlobal({
  fotos,
  onClick,
}: {
  fotos: DraftHospedaje['fotos'];
  onClick: () => void;
}) {
  const portada = portadaHospedaje(fotos);
  const resumen = resumenFotosHospedaje(fotos);

  if (!portada) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Ir a la sección de fotos"
        data-testid="tarjeta-fotos-global"
        className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Fotos</span>
          <span className="block truncate text-sm text-muted-foreground">{resumen}</span>
        </span>
        <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  const extra = Math.max(0, contarFotosHospedaje(fotos) - 1);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ir a la sección de fotos"
      data-testid="tarjeta-fotos-global"
      className="relative flex h-24 w-full items-end overflow-hidden rounded-xl border text-left transition-[filter] hover:brightness-110 sm:h-28"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={portada.url}
        alt={portada.titulo || 'Portada de la propiedad'}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      {extra > 0 ? (
        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          +{extra}
        </span>
      ) : null}
      <span className="relative flex w-full items-end justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white drop-shadow">Fotos</span>
          <span className="block truncate text-xs text-white/85">{resumen}</span>
        </span>
        <Pencil className="h-4 w-4 shrink-0 text-white/90" />
      </span>
    </button>
  );
}

/** Chip «2 × Cama doble» del detalle por tipo. */
function ChipResumen({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

/** Etiquetas «2 × Cama doble» a partir de los pares [id, n] del catálogo. */
function chipsPorTipo(pares: Array<readonly [string, number]> | null): string[] {
  if (!pares) return [];
  return pares.map(([id, n]) => `${n} × ${labelDeHabitacionHospedaje(id)}`);
}

function resumenHabitacionesHospedaje(d: DraftHospedaje): string {
  // Agregado de las unidades: la propiedad ya no declara las suyas.
  const total = sumarContadores(d.agregadoUnidades?.habitaciones ?? null);
  if (total === 0) return 'Sin configurar en las unidades';
  return `${total} habitación(es) entre las unidades`;
}

function resumenCamasHospedaje(d: DraftHospedaje): string {
  const camas = d.agregadoUnidades?.camas ?? {};
  const total = sumarContadores(camas);
  if (total === 0) return 'Sin configurar en las unidades';
  const partes = CAMAS_CATALOGO_HOSPEDAJE.filter((c) => (camas[c.id] ?? 0) > 0).map(
    (c) => `${camas[c.id]} ${c.label.toLowerCase()}`
  );
  return partes.length > 0 ? partes.join(', ') : `${total} cama(s)`;
}

function resumenServiciosHospedaje(d: DraftHospedaje): string {
  const total = d.detalle.servicios.length;
  if (total === 0) return 'Sin configurar';
  return `${total} servicio(s) seleccionado(s)`;
}

function resumenUnidades(units: UnidadWire[]): string {
  const huespedes = units.reduce((acc, u) => acc + (u.capacidad ?? 0), 0);
  const bases: string[] = [];
  if (units.length > 0) bases.push(`${units.length} ${units.length === 1 ? 'unidad' : 'unidades'}`);
  if (huespedes > 0) bases.push(`${huespedes} ${huespedes === 1 ? 'huésped' : 'huéspedes'}`);
  return bases.length > 0 ? bases.join(' · ') : 'Sin unidades';
}

/**
 * Primera sección del editor: el resumen del alojamiento con tarjetas que
 * saltan a su sección o abren el modal de detalle correspondiente.
 */
export function VistaGlobalHospedaje({
  draft,
  onIrSeccion,
  abrirModal,
  onGestionarUnidades,
}: VistaGlobalProps) {
  const ubicacion =
    [draft.direccion, draft.ciudad, draft.pais]
      .map((t) => t.trim())
      .filter(Boolean)
      .join(', ') || 'Sin configurar';

  return (
    <div className="space-y-6" data-testid="vista-global-hospedaje">
      <div className="space-y-2">
        <TarjetaResumen
          icono={<Home className="h-5 w-5 text-muted-foreground" />}
          titulo="Nombre y descripción"
          resumen={draft.descripcion ? draft.descripcion.slice(0, 80) : 'Sin descripción'}
          onClick={() => onIrSeccion('descripcion')}
        />
        <TarjetaResumen
          icono={<MapPin className="h-5 w-5 text-muted-foreground" />}
          titulo="Informaciones del alojamiento"
          resumen={ubicacion}
          onClick={() => onIrSeccion('ubicacion')}
        />
        <TarjetaFotosGlobal
          fotos={draft.fotos}
          onClick={() => onIrSeccion('fotos')}
        />
        <TarjetaResumen
          icono={<User className="h-5 w-5 text-muted-foreground" />}
          titulo="Habitaciones"
          resumen={resumenHabitacionesHospedaje(draft)}
          detalle={chipsPorTipo(detalleHabitacionesHospedaje(draft.agregadoUnidades))}
          onClick={() => abrirModal('habitaciones')}
        />
        <TarjetaResumen
          icono={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
          titulo="Distribución de las camas"
          resumen={resumenCamasHospedaje(draft)}
          detalle={chipsPorTipo(detalleCamasHospedaje(draft.agregadoUnidades))}
          onClick={() => abrirModal('camas')}
        />
        <TarjetaResumen
          icono={<Search className="h-5 w-5 text-muted-foreground" />}
          titulo="Áreas comunes e instalaciones"
          resumen={resumenServiciosHospedaje(draft)}
          onClick={() => abrirModal('servicios')}
        />
      </div>

      {/* Resumen de unidades: clicable para crear/gestionar sin salir. */}
      <button
        type="button"
        onClick={onGestionarUnidades}
        aria-label="Gestionar unidades de la propiedad"
        data-testid="gestionar-unidades"
        className="flex w-full items-center gap-3 rounded-xl border bg-muted/30 p-4 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/40"
      >
        <DoorOpen className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">
          {resumenUnidades(draft.units)}
          {draft.fotos[0] ? (
            <span> · {draft.fotos.length} foto(s)</span>
          ) : (
            <span> · sin fotos todavía</span>
          )}
        </span>
        <Pencil className="h-4 w-4 shrink-0" />
      </button>
    </div>
  );
}
