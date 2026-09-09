'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  DoorOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MapPin,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Property {
  id: string;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  pais: string | null;
  timezone: string;
  estado: string;
  _count?: { units: number; reservations: number };
}

interface Unit {
  id: string;
  propertyId: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  capacidad: number;
  estado: string;
  property?: { id: string; nombre: string };
}

const TIPOS_UNIDAD = ['apartamento', 'habitacion', 'casa', 'villa', 'estudio', 'otro'];

const ESTADO_UNIDAD_LABEL: Record<string, string> = {
  available: 'Disponible',
  occupied: 'Ocupada',
  cleaning: 'Limpieza',
  dirty: 'Sucia',
  maintenance: 'Mantenimiento',
  out_of_service: 'Fuera de servicio',
};

const ESTADO_PROPIEDAD_LABEL: Record<string, string> = {
  activa: 'Activa',
  inactiva: 'Inactiva',
};

export default function HospitalityPage() {
  const [tab, setTab] = useState('propiedades');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  // Dialog propiedad
  const [propertyDialog, setPropertyDialog] = useState<{ open: boolean; editing: Property | null }>({ open: false, editing: null });
  const [propertyForm, setPropertyForm] = useState({ nombre: '', direccion: '', ciudad: '', pais: '', timezone: 'America/Mexico_City' });

  // Dialog unidad
  const [unitDialog, setUnitDialog] = useState<{ open: boolean; editing: Unit | null }>({ open: false, editing: null });
  const [unitForm, setUnitForm] = useState({ propertyId: '', nombre: '', codigo: '', tipo: 'apartamento', capacidad: '2', estado: 'available' });

  // Confirmación de borrado
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'property' | 'unit'; id: string; nombre: string } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [propRes, unitRes] = await Promise.all([
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
      ]);
      if (propRes.ok) {
        const data = await propRes.json();
        setProperties(data.properties || []);
      }
      if (unitRes.ok) {
        const data = await unitRes.json();
        setUnits(data.units || []);
      }
    } catch (error) {
      toast.error('Error al cargar datos de Hospitality');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveProperty = async () => {
    if (!propertyForm.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSaving(true);
    try {
      const url = propertyDialog.editing
        ? `/api/hospitality/properties/${propertyDialog.editing.id}`
        : '/api/hospitality/properties';
      const res = await fetch(url, {
        method: propertyDialog.editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyForm),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(propertyDialog.editing ? 'Propiedad actualizada' : 'Propiedad creada');
        setPropertyDialog({ open: false, editing: null });
        setPropertyForm({ nombre: '', direccion: '', ciudad: '', pais: '', timezone: 'America/Mexico_City' });
        await loadAll();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar propiedad');
    } finally {
      setSaving(false);
    }
  };

  const saveUnit = async () => {
    if (!unitForm.propertyId || !unitForm.nombre.trim()) {
      toast.error('Propiedad y nombre son requeridos');
      return;
    }
    setSaving(true);
    try {
      const url = unitDialog.editing
        ? `/api/hospitality/units/${unitDialog.editing.id}`
        : '/api/hospitality/units';
      const res = await fetch(url, {
        method: unitDialog.editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unitForm),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(unitDialog.editing ? 'Unidad actualizada' : 'Unidad creada');
        setUnitDialog({ open: false, editing: null });
        setUnitForm({ propertyId: properties[0]?.id || '', nombre: '', codigo: '', tipo: 'apartamento', capacidad: '2', estado: 'available' });
        await loadAll();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar unidad');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const base = deleteTarget.kind === 'property' ? 'properties' : 'units';
      const res = await fetch(`/api/hospitality/${base}/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`${deleteTarget.kind === 'property' ? 'Propiedad' : 'Unidad'} eliminada`);
        await loadAll();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al eliminar');
      }
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleteTarget(null);
    }
  };

  const openNewProperty = () => {
    setPropertyForm({ nombre: '', direccion: '', ciudad: '', pais: '', timezone: 'America/Mexico_City' });
    setPropertyDialog({ open: true, editing: null });
  };

  const openEditProperty = (p: Property) => {
    setPropertyForm({
      nombre: p.nombre,
      direccion: p.direccion || '',
      ciudad: p.ciudad || '',
      pais: p.pais || '',
      timezone: p.timezone,
    });
    setPropertyDialog({ open: true, editing: p });
  };

  const openNewUnit = () => {
    setUnitForm({ propertyId: properties[0]?.id || '', nombre: '', codigo: '', tipo: 'apartamento', capacidad: '2', estado: 'available' });
    setUnitDialog({ open: true, editing: null });
  };

  const openEditUnit = (u: Unit) => {
    setUnitForm({
      propertyId: u.propertyId,
      nombre: u.nombre,
      codigo: u.codigo || '',
      tipo: u.tipo,
      capacidad: String(u.capacidad),
      estado: u.estado,
    });
    setUnitDialog({ open: true, editing: u });
  };

  const filteredProperties = properties.filter((p) =>
    !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || (p.ciudad || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredUnits = units.filter((u) =>
    !search || u.nombre.toLowerCase().includes(search.toLowerCase()) || (u.codigo || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Hospitality
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona tus propiedades, unidades alojativas y reservas
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="propiedades" className="gap-2">
              <Building2 className="h-4 w-4" />
              Propiedades ({properties.length})
            </TabsTrigger>
            <TabsTrigger value="unidades" className="gap-2">
              <DoorOpen className="h-4 w-4" />
              Unidades ({units.length})
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-56"
              />
            </div>
            {tab === 'propiedades' ? (
              <Button onClick={openNewProperty}>
                <Plus className="h-4 w-4 mr-2" /> Nueva Propiedad
              </Button>
            ) : (
              <Button onClick={openNewUnit} disabled={properties.length === 0}>
                <Plus className="h-4 w-4 mr-2" /> Nueva Unidad
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="propiedades" className="mt-4 space-y-4">
          {properties.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-semibold">Sin propiedades</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Crea tu primera propiedad para empezar a gestionar unidades y reservas
                </p>
                <Button onClick={openNewProperty}>
                  <Plus className="h-4 w-4 mr-2" /> Nueva Propiedad
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProperties.map((p) => (
                <Card key={p.id} className="hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary shrink-0" />
                        <CardTitle className="text-lg">{p.nombre}</CardTitle>
                      </div>
                      <Badge variant={p.estado === 'activa' ? 'default' : 'secondary'}>
                        {ESTADO_PROPIEDAD_LABEL[p.estado] || p.estado}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground space-y-1">
                      {(p.direccion || p.ciudad) && (
                        <p className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />
                          {[p.direccion, p.ciudad, p.pais].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5">
                        <DoorOpen className="h-4 w-4 text-muted-foreground" />
                        {p._count?.units ?? 0} unidades
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {p._count?.reservations ?? 0} reservas
                      </span>
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => openEditProperty(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ kind: 'property', id: p.id, nombre: p.nombre })}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="unidades" className="mt-4 space-y-4">
          {units.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <DoorOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-semibold">Sin unidades</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {properties.length === 0
                    ? 'Primero crea una propiedad, luego añade unidades alojativas'
                    : 'Añade unidades alojativas a tus propiedades'}
                </p>
                <Button onClick={openNewUnit} disabled={properties.length === 0}>
                  <Plus className="h-4 w-4 mr-2" /> Nueva Unidad
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Unidad</th>
                        <th className="pb-3 pr-4 font-medium">Código</th>
                        <th className="pb-3 pr-4 font-medium">Propiedad</th>
                        <th className="pb-3 pr-4 font-medium">Tipo</th>
                        <th className="pb-3 pr-4 font-medium">Capacidad</th>
                        <th className="pb-3 pr-4 font-medium">Estado</th>
                        <th className="pb-3 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnits.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">{u.nombre}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{u.codigo || '—'}</td>
                          <td className="py-3 pr-4">{u.property?.nombre || '—'}</td>
                          <td className="py-3 pr-4 capitalize">{u.tipo}</td>
                          <td className="py-3 pr-4">{u.capacidad} pers.</td>
                          <td className="py-3 pr-4">
                            <Badge variant={u.estado === 'available' ? 'default' : u.estado === 'maintenance' ? 'destructive' : 'secondary'}>
                              {ESTADO_UNIDAD_LABEL[u.estado] || u.estado}
                            </Badge>
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" onClick={() => openEditUnit(u)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteTarget({ kind: 'unit', id: u.id, nombre: u.nombre })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Propiedad */}
      <Dialog open={propertyDialog.open} onOpenChange={(open) => setPropertyDialog({ open, editing: propertyDialog.editing })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{propertyDialog.editing ? 'Editar Propiedad' : 'Nueva Propiedad'}</DialogTitle>
            <DialogDescription>
              Datos de la propiedad física administrada por tu empresa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-nombre">Nombre *</Label>
              <Input id="p-nombre" value={propertyForm.nombre} onChange={(e) => setPropertyForm({ ...propertyForm, nombre: e.target.value })} placeholder="Ej: Residencial Las Palmas" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-direccion">Dirección</Label>
              <Input id="p-direccion" value={propertyForm.direccion} onChange={(e) => setPropertyForm({ ...propertyForm, direccion: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-ciudad">Ciudad</Label>
                <Input id="p-ciudad" value={propertyForm.ciudad} onChange={(e) => setPropertyForm({ ...propertyForm, ciudad: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-pais">País</Label>
                <Input id="p-pais" value={propertyForm.pais} onChange={(e) => setPropertyForm({ ...propertyForm, pais: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPropertyDialog({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={saveProperty} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Unidad */}
      <Dialog open={unitDialog.open} onOpenChange={(open) => setUnitDialog({ open, editing: unitDialog.editing })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{unitDialog.editing ? 'Editar Unidad' : 'Nueva Unidad'}</DialogTitle>
            <DialogDescription>
              Unidad alojativa reservable dentro de una propiedad
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u-propiedad">Propiedad *</Label>
              <Select value={unitForm.propertyId} onValueChange={(v) => setUnitForm({ ...unitForm, propertyId: v })}>
                <SelectTrigger id="u-propiedad"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-nombre">Nombre *</Label>
              <Input id="u-nombre" value={unitForm.nombre} onChange={(e) => setUnitForm({ ...unitForm, nombre: e.target.value })} placeholder="Ej: Suite 101" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="u-codigo">Código</Label>
                <Input id="u-codigo" value={unitForm.codigo} onChange={(e) => setUnitForm({ ...unitForm, codigo: e.target.value })} placeholder="Ej: suite-101" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-tipo">Tipo</Label>
                <Select value={unitForm.tipo} onValueChange={(v) => setUnitForm({ ...unitForm, tipo: v })}>
                  <SelectTrigger id="u-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_UNIDAD.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="u-capacidad">Capacidad</Label>
                <Input id="u-capacidad" type="number" min={1} value={unitForm.capacidad} onChange={(e) => setUnitForm({ ...unitForm, capacidad: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-estado">Estado</Label>
                <Select value={unitForm.estado} onValueChange={(v) => setUnitForm({ ...unitForm, estado: v })}>
                  <SelectTrigger id="u-estado"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_UNIDAD_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialog({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={saveUnit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              ¿Eliminar {deleteTarget?.kind === 'property' ? 'propiedad' : 'unidad'}?
            </DialogTitle>
            <DialogDescription>
              <p className="mb-2">
                Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
              </p>
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  Al eliminar {deleteTarget?.kind === 'property' ? 'una propiedad' : 'una unidad'} se eliminarán sus datos asociados.
                </AlertDescription>
              </Alert>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}