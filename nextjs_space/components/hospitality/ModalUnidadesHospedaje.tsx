'use client';

/**
 * Volkern Hospitality — Modal de unidades desde la Vista global.
 *
 * La línea de resumen de unidades de la Vista global es clicable: este dialog
 * lista las unidades de la propiedad y permite crearlas, editarlas y borrarlas
 * sin salir del editor, sobre las APIs que ya existen
 * (/api/hospitality/units y /api/hospitality/units/[id], las mismas que usa la
 * portada). Al cerrar con cambios, `onCambio` refresca la propiedad del editor
 * para que el resumen y la sección de unidades se actualicen.
 *
 * La ficha es deliberadamente mínima (nombre, código, tipo, capacidad y
 * estado): la edición completa de una unidad (fotos, amenidades, tarifas) vive
 * en la portada de Propiedades, que es donde enlaza «Gestionar».
 */

import { useState, useEffect, useCallback } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ESTADOS_UNIDAD_HOSPEDAJE,
  TIPOS_UNIDAD_HOSPEDAJE,
  FORM_UNIDAD_VACIO,
  payloadUnidadHospedaje,
  type FormUnidadHospedaje,
  type UnidadWire,
} from '@/lib/hospitality/property-editor-config';

export interface ModalUnidadesHospedajeProps {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  propertyId: string;
  /** Unidades actuales de la propiedad (las del draft del editor). */
  unidades: UnidadWire[];
  /** Avisar al editor de que cambió el inventario (refresca la propiedad). */
  onCambio: () => void;
}

export function ModalUnidadesHospedaje({
  abierto,
  onOpenChange,
  propertyId,
  unidades,
  onCambio,
}: ModalUnidadesHospedajeProps) {
  const [editando, setEditando] = useState<UnidadWire | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<FormUnidadHospedaje>({ ...FORM_UNIDAD_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  // Al abrir el modal, siempre arranca en modo lista: los contadores viven en
  // el draft del editor y no se machacan mientras el modal esté abierto.
  useEffect(() => {
    if (abierto) {
      setCreando(false);
      setEditando(null);
      setForm({ ...FORM_UNIDAD_VACIO });
    }
  }, [abierto]);

  const cancelarFormulario = useCallback(() => {
    setCreando(false);
    setEditando(null);
    setForm({ ...FORM_UNIDAD_VACIO });
  }, []);

  const abrirCrear = useCallback(() => {
    setEditando(null);
    setCreando(true);
    setForm({ ...FORM_UNIDAD_VACIO });
  }, []);

  const abrirEditar = useCallback((u: UnidadWire) => {
    setCreando(false);
    setEditando(u);
    setForm({
      nombre: u.nombre,
      codigo: u.codigo ?? '',
      tipo: u.tipo ?? 'apartamento',
      capacidad: u.capacidad != null ? String(u.capacidad) : '2',
      estado: u.estado ?? 'available',
    });
  }, []);

  const guardar = useCallback(async () => {
    const payload = payloadUnidadHospedaje(form, propertyId);
    if (!payload) {
      toast.error('El nombre de la unidad es requerido');
      return;
    }
    setGuardando(true);
    try {
      const url = editando ? `/api/hospitality/units/${editando.id}` : '/api/hospitality/units';
      const res = await apiFetch(url, {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar la unidad');
        return;
      }
      toast.success(editando ? 'Unidad actualizada' : 'Unidad creada');
      cancelarFormulario();
      onCambio();
    } catch {
      toast.error('Error de conexión');
    } finally {
      setGuardando(false);
    }
  }, [form, editando, propertyId, cancelarFormulario, onCambio]);

  const borrar = useCallback(
    async (u: UnidadWire) => {
      setBorrandoId(u.id);
      try {
        const res = await apiFetch(`/api/hospitality/units/${u.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || 'Error al eliminar la unidad');
          return;
        }
        toast.success('Unidad eliminada');
        if (editando?.id === u.id) cancelarFormulario();
        onCambio();
      } catch {
        toast.error('Error de conexión');
      } finally {
        setBorrandoId(null);
      }
    },
    [editando, cancelarFormulario, onCambio]
  );

  const formularioActivo = creando || editando !== null;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pb-3 pt-5 text-left">
          <DialogTitle>Unidades</DialogTitle>
          <DialogDescription>
            Crea y gestiona las unidades de esta propiedad sin salir del editor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {unidades.length === 0 && !formularioActivo && (
            <div className="rounded-xl border bg-muted/30 p-6 text-center">
              <p className="text-sm font-medium">Sin unidades</p>
              <p className="mb-3 text-sm text-muted-foreground">
                Crea la primera unidad para poder vender la propiedad.
              </p>
              <Button size="sm" onClick={abrirCrear}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear unidad
              </Button>
            </div>
          )}

          {unidades.length > 0 && (
            <div className="space-y-2">
              {unidades.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {u.nombre}
                      {u.codigo ? (
                        <span className="ml-2 text-xs text-muted-foreground">{u.codigo}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        u.tipo,
                        u.capacidad != null ? `Capacidad ${u.capacidad}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Editar ${u.nombre}`}
                      onClick={() => abrirEditar(u)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      aria-label={`Eliminar ${u.nombre}`}
                      disabled={borrandoId === u.id}
                      onClick={() => borrar(u)}
                    >
                      {borrandoId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
              {!formularioActivo && (
                <Button variant="outline" size="sm" className="w-full" onClick={abrirCrear}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Añadir unidad
                </Button>
              )}
            </div>
          )}

          {formularioActivo && (
            <div className="mt-2 space-y-3 rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-medium">
                {editando ? `Editando «${editando.nombre}»` : 'Nueva unidad'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="un-nombre">Nombre</Label>
                  <Input
                    id="un-nombre"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Suite Marfil"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="un-codigo">Código</Label>
                  <Input
                    id="un-codigo"
                    value={form.codigo}
                    onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                    placeholder="SUITE-1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="un-capacidad">Capacidad</Label>
                  <Input
                    id="un-capacidad"
                    type="number"
                    min={1}
                    max={50}
                    value={form.capacidad}
                    onChange={(e) => setForm((f) => ({ ...f, capacidad: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={form.estado}
                    onValueChange={(v) => setForm((f) => ({ ...f, estado: v }))}
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
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={cancelarFormulario} disabled={guardando}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={guardar} disabled={guardando}>
                  {guardando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  {editando ? 'Guardar unidad' : 'Crear unidad'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
