'use client';

/**
 * Volkern Real Estate — Modales de detalle del editor de propiedades.
 *
 * Habitaciones (privadas/compartidas) y distribución de camas con contadores
 * +/−, y el selector de servicios con buscador, agrupados acordeón y el badge
 * de portales (Booking/Airbnb) que ya traía el diseño de referencia.
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
  HABITACIONES_GRUPOS,
  CAMAS_CATALOGO,
  SERVICIOS_GRUPOS,
} from '@/lib/real-estate/property-editor-config';
import type { DraftInmueble } from '@/lib/real-estate/property-editor-draft';
import { ChevronDown, Minus, Plus, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TipoModal = 'habitaciones' | 'camas' | 'servicios';

interface ModalDetalleProps {
  tipo: TipoModal;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  draft: DraftInmueble;
  actualizar: (cambios: Partial<DraftInmueble>) => void;
}

const TITULOS: Record<TipoModal, { titulo: string; descripcion: string }> = {
  habitaciones: {
    titulo: 'Habitaciones',
    descripcion:
      '¿Qué habitaciones tiene tu propiedad? Las habitaciones que selecciones aquí se mostrarán en tu sitio web.',
  },
  camas: {
    titulo: 'Distribución de camas',
    descripcion: 'Informa a tus huéspedes sobre la distribución de las camas.',
  },
  servicios: {
    titulo: 'Servicios y equipamiento del alojamiento',
    descripcion: 'Marca lo que tu propiedad ofrece.',
  },
};

/**
 * Fila de contador +/− compartida por los modales de habitaciones y camas.
 *
 * El callback recibe un DELTA (±1) y el padre lo aplica sobre su estado previo:
 * si se computara aquí `valor + 1`, dos clicks rápidos antes del re-render
 * leerían el mismo `valor` y sumarían 1 solo.
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

export function ModalDetalle({ tipo, abierto, onOpenChange, draft, actualizar }: ModalDetalleProps) {
  const meta = TITULOS[tipo];

  // Estado local del modal: se sincroniza con el borrador al abrir y solo se
  // aplica al borrador al guardar, para que «Cancelar» no deje cambios a medias.
  const [habitaciones, setHabitaciones] = useState<Record<string, number>>({});
  const [camas, setCamas] = useState<Record<string, number>>({});
  const [servicios, setServicios] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');

  // Solo se sincroniza al ABRIR: si dependiera de `draft`, cada autosave que
  // aterrice con el modal abierto machacaría los contadores que el usuario está
  // tocando. Se lee el borrador por referencia en ese instante.
  const draftRef = useRef(draft);
  useEffect(() => {
    if (!abierto) return;
    const actual = draftRef.current;
    if (tipo === 'habitaciones') setHabitaciones({ ...actual.roomsDetail });
    else if (tipo === 'camas') setCamas({ ...actual.bedsDetail });
    else setServicios([...actual.servicios]);
    setBusqueda('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tipo]);

  const guardar = () => {
    if (tipo === 'habitaciones') actualizar({ roomsDetail: habitaciones });
    else if (tipo === 'camas') actualizar({ bedsDetail: camas });
    else {
      // Los servicios con `boolKey` espejan el campo booleano clásico para que
      // las pantallas antiguas (listado, ficha previa) sigan leyendo igual.
      const conBool = new Map<string, boolean>();
      for (const s of SERVICIOS_GRUPOS) {
        for (const item of s.items) {
          if (item.boolKey) conBool.set(item.boolKey, servicios.includes(item.id));
        }
      }
      const booleanos = Object.fromEntries(conBool);
      actualizar({ servicios, ...booleanos });
    }
    onOpenChange(false);
  };

  const busquedaLimpia = busqueda.trim().toLowerCase();
  const gruposServiciosFiltrados = SERVICIOS_GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      busquedaLimpia ? i.label.toLowerCase().includes(busquedaLimpia) : true
    ),
  })).filter((g) => g.items.length > 0);

  // Grupos abiertos por defecto: «Popular» (y todos, cuando se busca). El
  // usuario puede plegar cualquiera; el estado vive mientras el modal esté
  // montado.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (abierto) setGruposAbiertos({});
  }, [abierto]);
  const grupoAbierto = (id: string, porDefecto: boolean) =>
    gruposAbiertos[id] ?? (busquedaLimpia.length > 0 ? true : porDefecto);

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="px-5 pb-3 pt-5 text-center">
          <DialogTitle>{meta.titulo}</DialogTitle>
          <DialogDescription className="mx-auto max-w-xs">{meta.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {/* ─── Habitaciones ─── */}
          {tipo === 'habitaciones' && (
            <div className="rounded-xl border">
              {HABITACIONES_GRUPOS.map((grupo, gi) => (
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
                        <FilaContador
                          key={h.id}
                          label={h.label}
                          valor={habitaciones[h.id] ?? 0}
                          onDelta={(delta) =>
                            setHabitaciones((prev) => ({
                              ...prev,
                              [h.id]: Math.max(0, (prev[h.id] ?? 0) + delta),
                            }))
                          }
                        />
                      ))}
                    </div>
                  </GrupoAcordeon>
                </div>
              ))}
            </div>
          )}

          {/* ─── Camas ─── */}
          {tipo === 'camas' && (
            <div className="rounded-xl border p-1">
              <div className="divide-y">
                {CAMAS_CATALOGO.map((cama) => (
                  <div key={cama.id} className="flex items-center gap-3 px-2 py-1.5">
                    <span className="flex-1 text-sm">{cama.label}</span>                      <div className="w-40 shrink-0">
                        <FilaContador
                          label=""
                          valor={camas[cama.id] ?? 0}
                          onDelta={(delta) =>
                            setCamas((prev) => ({
                              ...prev,
                              [cama.id]: Math.max(0, (prev[cama.id] ?? 0) + delta),
                            }))
                          }
                        />
                      </div>
                  </div>
                ))}
              </div>
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
                              {(item.id === 'aparcamiento' || item.id === 'mascotas') && (
                                <span title="Airbnb" className="text-rose-500">
                                  ⌂
                                </span>
                              )}
                              {(item.id === 'wifi' || item.id === 'aparcamiento') && (
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
