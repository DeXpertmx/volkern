'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { monedaEfectiva, MONEDAS_SELECCIONABLES } from '@/lib/moneda';
import {
  Building2,
  DoorOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MapPin,
  Users,
  DollarSign,
  BedDouble,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Save,
  Search,
  ImageIcon,
  X,
  Rocket,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';

interface Property {
  id: string;
  nombre: string;
  descripcion: string | null;
  codigo: string | null;
  zona: string | null;
  direccion: string | null;
  ciudad: string | null;
  estadoProvincia: string | null;
  pais: string | null;
  cp: string | null;
  latitud: number | null;
  longitud: number | null;
  fotos: string[] | null;
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
  tarifaBase: number | null;
  moneda: string;
  descripcion: string | null;
  fotos: string[] | null;
  amenidades: string[] | null;
  estado: string;
  property?: { id: string; nombre: string };
}

const TIPOS_UNIDAD = ['apartamento', 'habitacion', 'casa', 'villa', 'estudio', 'loft', 'bungalow', 'otro'];
const AMENIDADES_DISPONIBLES = [
  'Wifi', 'Aire acondicionado', 'Alberca', 'Jacuzzi', 'Cocina completa', 'Lavadora',
  'Estacionamiento', 'TV cable', 'Vista al mar', 'Terraza', 'Parrilla', 'Gym',
  'Pet friendly', 'Cuna', 'Caja fuerte', 'Escritorio',
];

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
  conectada: 'Conectada',
  borrador: 'En configuración',
};

const ZONAS_HUSO = [
  'America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'America/Hermosillo',
  'Europe/Madrid', 'Europe/London', 'America/Bogota', 'America/Lima', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/New_York', 'America/Los_Angeles', 'UTC',
];

const EMPTY_PROPERTY_FORM = {
  nombre: '', descripcion: '', codigo: '', zona: '', direccion: '', ciudad: '',
  estadoProvincia: '', pais: '', cp: '', latitud: '', longitud: '',
  fotos: [] as string[], timezone: 'America/Mexico_City', estado: 'activa',
};

const EMPTY_UNIT_FORM = {
  propertyId: '', nombre: '', codigo: '', tipo: 'apartamento', capacidad: '2',
  // Vacío a propósito: lo rellena la divisa resuelta del tenant.
  tarifaBase: '', moneda: '', descripcion: '', fotos: [] as string[],
  amenidades: [] as string[], estado: 'available',
};

export default function HospitalityPage() {
  const [tab, setTab] = useState('propiedades');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Pestaña inicial por query (?tab=unidades) para poder enlazar desde el menú.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'propiedades' || t === 'unidades') setTab(t);
  }, []);

  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  // Moneda de reporte del tenant: respaldo cuando aún no hay inventario.
  const [monedaTenant, setMonedaTenant] = useState('');

  // La moneda por defecto de una unidad nueva sale de las que ya existen y, si no
  // hay ninguna, de la moneda del tenant. El valor por defecto del esquema ('MXN')
  // no participa: metía pesos en el inventario de un tenant que trabaja en euros.
  const monedaUnidades = useMemo(
    () => monedaEfectiva(units.map((u) => u.moneda), monedaTenant),
    [units, monedaTenant]
  );

  // Dialog propiedad
  const [propertyDialog, setPropertyDialog] = useState<{ open: boolean; editing: Property | null }>({ open: false, editing: null });
  const [propertyForm, setPropertyForm] = useState<typeof EMPTY_PROPERTY_FORM>({ ...EMPTY_PROPERTY_FORM });
  const [fotoUrl, setFotoUrl] = useState('');
  const [unidadesIniciales, setUnidadesIniciales] = useState<Array<{ nombre: string; codigo: string; tipo: string; capacidad: string; tarifaBase: string }>>([]);

  // Dialog unidad
  const [unitDialog, setUnitDialog] = useState<{ open: boolean; editing: Unit | null }>({ open: false, editing: null });
  const [unitForm, setUnitForm] = useState<typeof EMPTY_UNIT_FORM>({ ...EMPTY_UNIT_FORM, moneda: monedaUnidades });
  const [unitFotoUrl, setUnitFotoUrl] = useState('');

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
        if (data.moneda) setMonedaTenant(data.moneda);
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
      const body: any = { ...propertyForm };
      if (!propertyDialog.editing && unidadesIniciales.length > 0) {
        body.unidades = unidadesIniciales
          .filter((u) => u.nombre.trim())
          .map((u) => ({ ...u, capacidad: Number(u.capacidad) || 2, tarifaBase: u.tarifaBase || null }));
      }
      const res = await fetch(url, {
        method: propertyDialog.editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(propertyDialog.editing ? 'Propiedad actualizada' : 'Propiedad creada');
        setPropertyDialog({ open: false, editing: null });
        setPropertyForm({ ...EMPTY_PROPERTY_FORM });
        setUnidadesIniciales([]);
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
        body: JSON.stringify({
          ...unitForm,
          capacidad: Number(unitForm.capacidad) || 2,
          tarifaBase: unitForm.tarifaBase || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(unitDialog.editing ? 'Unidad actualizada' : 'Unidad creada');
        setUnitDialog({ open: false, editing: null });
        setUnitForm({ ...EMPTY_UNIT_FORM, propertyId: properties[0]?.id || '', moneda: monedaUnidades });
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
    setPropertyForm({ ...EMPTY_PROPERTY_FORM });
    setUnidadesIniciales([]);
    setPropertyDialog({ open: true, editing: null });
  };

  const openEditProperty = (p: Property) => {
    setPropertyForm({
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      codigo: p.codigo || '',
      zona: p.zona || '',
      direccion: p.direccion || '',
      ciudad: p.ciudad || '',
      estadoProvincia: p.estadoProvincia || '',
      pais: p.pais || '',
      cp: p.cp || '',
      latitud: p.latitud != null ? String(p.latitud) : '',
      longitud: p.longitud != null ? String(p.longitud) : '',
      fotos: p.fotos || [],
      timezone: p.timezone,
      estado: p.estado,
    });
    setUnidadesIniciales([]);
    setPropertyDialog({ open: true, editing: p });
  };

  const openNewUnit = () => {
    setUnitForm({ ...EMPTY_UNIT_FORM, propertyId: properties[0]?.id || '', moneda: monedaUnidades });
    setUnitDialog({ open: true, editing: null });
  };

  const openEditUnit = (u: Unit) => {
    setUnitForm({
      propertyId: u.propertyId,
      nombre: u.nombre,
      codigo: u.codigo || '',
      tipo: u.tipo,
      capacidad: String(u.capacidad),
      tarifaBase: u.tarifaBase != null ? String(u.tarifaBase) : '',
      moneda: u.moneda,
      descripcion: u.descripcion || '',
      fotos: u.fotos || [],
      amenidades: u.amenidades || [],
      estado: u.estado,
    });
    setUnitDialog({ open: true, editing: u });
  };

  const addFoto = (target: 'property' | 'unit') => {
    const url = (target === 'property' ? fotoUrl : unitFotoUrl).trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error('La URL de la foto debe empezar por http(s)://');
      return;
    }
    if (target === 'property') {
      setPropertyForm((f) => ({ ...f, fotos: [...f.fotos, url].slice(0, 10) }));
      setFotoUrl('');
    } else {
      setUnitForm((f) => ({ ...f, fotos: [...f.fotos, url].slice(0, 10) }));
      setUnitFotoUrl('');
    }
  };

  const removeFoto = (target: 'property' | 'unit', idx: number) => {
    if (target === 'property') {
      setPropertyForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== idx) }));
    } else {
      setUnitForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== idx) }));
    }
  };

  const toggleAmenidad = (a: string) => {
    setUnitForm((f) => ({
      ...f,
      amenidades: f.amenidades.includes(a) ? f.amenidades.filter((x) => x !== a) : [...f.amenidades, a],
    }));
  };

  const addUnidadInicial = () => {
    if (unidadesIniciales.length >= 5) return;
    setUnidadesIniciales((arr) => [...arr, { nombre: '', codigo: '', tipo: 'apartamento', capacidad: '2', tarifaBase: '' }]);
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
    <div id="propiedades" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Propiedades
          </h1>
          <p className="text-muted-foreground mt-1">
            Propiedades y unidades alojativas de tu empresa
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
              <AccionHospitality capacidad="reservas.crear">
                <AccionHospitality capacidad="reservas.crear">
                  <Button onClick={openNewProperty}>
                    <Plus className="h-4 w-4 mr-2" /> Nueva Propiedad
                  </Button>
                </AccionHospitality>
              </AccionHospitality>
            ) : (
              <AccionHospitality capacidad="reservas.crear">
                <AccionHospitality capacidad="reservas.crear">
                  <Button onClick={openNewUnit} disabled={properties.length === 0}>
                    <Plus className="h-4 w-4 mr-2" /> Nueva Unidad
                  </Button>
                </AccionHospitality>
              </AccionHospitality>
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
                <AccionHospitality capacidad="reservas.crear">
                  <Button onClick={openNewProperty}>
                    <Plus className="h-4 w-4 mr-2" /> Nueva Propiedad
                  </Button>
                </AccionHospitality>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProperties.map((p) => (
                <Card key={p.id} className="hover:shadow-md transition-all overflow-hidden">
                  {/* Foto de portada */}
                  <div className="h-36 bg-muted relative">
                    {p.fotos && p.fotos.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotos[0]} alt={p.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                    <Badge variant={p.estado === 'inactiva' ? 'secondary' : 'default'} className="absolute top-2 right-2">
                      {ESTADO_PROPIEDAD_LABEL[p.estado] || p.estado}
                    </Badge>
                  </div>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{p.nombre}</CardTitle>
                        {p.codigo && <p className="text-xs text-muted-foreground">Código: {p.codigo}</p>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(p.direccion || p.ciudad || p.zona) && (
                      <p className="text-sm text-muted-foreground flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="truncate">
                          {[p.direccion, p.ciudad, p.estadoProvincia, p.pais].filter(Boolean).join(', ')}
                          {p.zona ? ` · ${p.zona}` : ''}
                        </span>
                      </p>
                    )}
                    {p.descripcion && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>
                    )}
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
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      <AccionHospitality capacidad="reservas.editar">
                        <Button variant="outline" size="sm" onClick={() => openEditProperty(p)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      </AccionHospitality>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/hospitality/onboarding?propertyId=${p.id}`}>
                          <Rocket className="h-3.5 w-3.5 mr-1" /> Puesta en marcha
                        </Link>
                      </Button>
                      <AccionHospitality capacidad="reservas.editar">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ kind: 'property', id: p.id, nombre: p.nombre })}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                        </Button>
                      </AccionHospitality>
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
                <AccionHospitality capacidad="reservas.crear">
                  <Button onClick={openNewUnit} disabled={properties.length === 0}>
                    <Plus className="h-4 w-4 mr-2" /> Nueva Unidad
                  </Button>
                </AccionHospitality>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUnits.map((u) => (
                <Card key={u.id} className="hover:shadow-md transition-all overflow-hidden">
                  <div className="h-32 bg-muted relative">
                    {u.fotos && u.fotos.length > 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.fotos[0]} alt={u.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BedDouble className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                    <Badge variant={u.estado === 'available' ? 'default' : u.estado === 'maintenance' ? 'destructive' : 'secondary'} className="absolute top-2 right-2">
                      {ESTADO_UNIDAD_LABEL[u.estado] || u.estado}
                    </Badge>
                  </div>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{u.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.codigo || 'Sin código'} · {u.property?.nombre || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="capitalize">{u.tipo}</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {u.capacidad} pers.
                      </span>
                      {u.tarifaBase != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {u.tarifaBase} {u.moneda}
                        </span>
                      )}
                    </div>
                    {u.descripcion && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{u.descripcion}</p>
                    )}
                    {(u.amenidades?.length || 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {u.amenidades!.slice(0, 4).map((a) => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))}
                        {u.amenidades!.length > 4 && (
                          <Badge variant="outline" className="text-[10px]">+{u.amenidades!.length - 4}</Badge>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 pt-2 border-t">
                      <AccionHospitality capacidad="reservas.editar">
                        <Button variant="outline" size="sm" onClick={() => openEditUnit(u)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      </AccionHospitality>
                      <AccionHospitality capacidad="reservas.editar">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ kind: 'unit', id: u.id, nombre: u.nombre })}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                        </Button>
                      </AccionHospitality>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Propiedad */}
      <Dialog open={propertyDialog.open} onOpenChange={(open) => setPropertyDialog({ open, editing: propertyDialog.editing })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{propertyDialog.editing ? 'Editar Propiedad' : 'Nueva Propiedad'}</DialogTitle>
            <DialogDescription>
              Datos de la propiedad física administrada por tu empresa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-nombre">Nombre *</Label>
                <Input id="p-nombre" value={propertyForm.nombre} onChange={(e) => setPropertyForm({ ...propertyForm, nombre: e.target.value })} placeholder="Ej: Villa Mar Azul" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="p-codigo">Código</Label>
                  <Input id="p-codigo" value={propertyForm.codigo} onChange={(e) => setPropertyForm({ ...propertyForm, codigo: e.target.value })} placeholder="Ej: VMA-01" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-zona">Zona / Barrio</Label>
                  <Input id="p-zona" value={propertyForm.zona} onChange={(e) => setPropertyForm({ ...propertyForm, zona: e.target.value })} placeholder="Ej: Zona Hotelera" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-descripcion">Descripción</Label>
              <Textarea
                id="p-descripcion"
                value={propertyForm.descripcion}
                onChange={(e) => setPropertyForm({ ...propertyForm, descripcion: e.target.value })}
                placeholder="Describe la propiedad: estilo, ambiente, puntos destacados para el huésped..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="p-direccion">Dirección</Label>
                <Input id="p-direccion" value={propertyForm.direccion} onChange={(e) => setPropertyForm({ ...propertyForm, direccion: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-ciudad">Ciudad</Label>
                <Input id="p-ciudad" value={propertyForm.ciudad} onChange={(e) => setPropertyForm({ ...propertyForm, ciudad: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-estadoProvincia">Estado / Provincia</Label>
                <Input id="p-estadoProvincia" value={propertyForm.estadoProvincia} onChange={(e) => setPropertyForm({ ...propertyForm, estadoProvincia: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-pais">País</Label>
                <Input id="p-pais" value={propertyForm.pais} onChange={(e) => setPropertyForm({ ...propertyForm, pais: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-cp">Código Postal</Label>
                <Input id="p-cp" value={propertyForm.cp} onChange={(e) => setPropertyForm({ ...propertyForm, cp: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-latitud">Latitud</Label>
                <Input id="p-latitud" value={propertyForm.latitud} onChange={(e) => setPropertyForm({ ...propertyForm, latitud: e.target.value })} placeholder="20.6296" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-longitud">Longitud</Label>
                <Input id="p-longitud" value={propertyForm.longitud} onChange={(e) => setPropertyForm({ ...propertyForm, longitud: e.target.value })} placeholder="-87.0739" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-timezone">Zona horaria</Label>
                <Select value={propertyForm.timezone} onValueChange={(v) => setPropertyForm({ ...propertyForm, timezone: v })}>
                  <SelectTrigger id="p-timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONAS_HUSO.map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-estado">Estado</Label>
                <Select value={propertyForm.estado} onValueChange={(v) => setPropertyForm({ ...propertyForm, estado: v })}>
                  <SelectTrigger id="p-estado"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_PROPIEDAD_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fotos */}
            <div className="space-y-2">
              <Label>Fotos (URLs, máx. 10)</Label>
              {propertyForm.fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {propertyForm.fotos.map((f, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f} alt={`foto ${i + 1}`} className="h-16 w-24 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => removeFoto('property', i)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={fotoUrl}
                  onChange={(e) => setFotoUrl(e.target.value)}
                  placeholder="https://... (foto de la propiedad)"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFoto('property'); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addFoto('property')}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Unidades iniciales (solo en creación) */}
            {!propertyDialog.editing && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>Unidades iniciales (opcional)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addUnidadInicial} disabled={unidadesIniciales.length >= 5}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Añadir unidad
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Puedes crear la propiedad junto con sus primeras unidades (hasta 5) en un solo paso.
                </p>
                {unidadesIniciales.map((u, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
                    <Input
                      value={u.nombre}
                      onChange={(e) => setUnidadesIniciales((arr) => arr.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                      placeholder={`Nombre unidad ${i + 1}`}
                    />
                    <Input
                      value={u.codigo}
                      onChange={(e) => setUnidadesIniciales((arr) => arr.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))}
                      placeholder="Código"
                    />
                    <Select value={u.tipo} onValueChange={(v) => setUnidadesIniciales((arr) => arr.map((x, j) => (j === i ? { ...x, tipo: v } : x)))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_UNIDAD.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      value={u.capacidad}
                      onChange={(e) => setUnidadesIniciales((arr) => arr.map((x, j) => (j === i ? { ...x, capacidad: e.target.value } : x)))}
                      placeholder="Cap."
                    />
                    <Input
                      type="number"
                      min={0}
                      value={u.tarifaBase}
                      onChange={(e) => setUnidadesIniciales((arr) => arr.map((x, j) => (j === i ? { ...x, tarifaBase: e.target.value } : x)))}
                      placeholder="Tarifa base"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPropertyDialog({ open: false, editing: null })}>Cancelar</Button>
            <AccionHospitality capacidad={propertyDialog.editing ? 'reservas.editar' : 'reservas.crear'}>
            <Button onClick={saveProperty} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Unidad */}
      <Dialog open={unitDialog.open} onOpenChange={(open) => setUnitDialog({ open, editing: unitDialog.editing })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{unitDialog.editing ? 'Editar Unidad' : 'Nueva Unidad'}</DialogTitle>
            <DialogDescription>
              Unidad alojativa reservable dentro de una propiedad
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Input id="u-nombre" value={unitForm.nombre} onChange={(e) => setUnitForm({ ...unitForm, nombre: e.target.value })} placeholder="Ej: Suite Océano 101" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label htmlFor="u-codigo">Código</Label>
                <Input id="u-codigo" value={unitForm.codigo} onChange={(e) => setUnitForm({ ...unitForm, codigo: e.target.value })} placeholder="Ej: SUI-101" />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="u-tarifa">Tarifa base ({unitForm.moneda})</Label>
                <Input id="u-tarifa" type="number" min={0} value={unitForm.tarifaBase} onChange={(e) => setUnitForm({ ...unitForm, tarifaBase: e.target.value })} placeholder="Ej: 2500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-moneda">Moneda</Label>
                <Select value={unitForm.moneda} onValueChange={(v) => setUnitForm({ ...unitForm, moneda: v })}>
                  <SelectTrigger id="u-moneda"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONEDAS_SELECCIONABLES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-descripcion">Descripción</Label>
              <Textarea
                id="u-descripcion"
                value={unitForm.descripcion}
                onChange={(e) => setUnitForm({ ...unitForm, descripcion: e.target.value })}
                placeholder="Describe la unidad: distribución, camas, vista, detalles..."
                rows={3}
              />
            </div>
            {/* Amenidades */}
            <div className="space-y-2">
              <Label>Amenidades</Label>
              <div className="flex flex-wrap gap-1.5">
                {AMENIDADES_DISPONIBLES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenidad(a)}
                    className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                      unitForm.amenidades.includes(a)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            {/* Fotos */}
            <div className="space-y-2">
              <Label>Fotos (URLs, máx. 10)</Label>
              {unitForm.fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {unitForm.fotos.map((f, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f} alt={`foto ${i + 1}`} className="h-16 w-24 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => removeFoto('unit', i)}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={unitFotoUrl}
                  onChange={(e) => setUnitFotoUrl(e.target.value)}
                  placeholder="https://... (foto de la unidad)"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFoto('unit'); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addFoto('unit')}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialog({ open: false, editing: null })}>Cancelar</Button>
            <AccionHospitality capacidad={unitDialog.editing ? 'reservas.editar' : 'reservas.crear'}>
            <Button onClick={saveUnit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
            </AccionHospitality>
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
            <AccionHospitality capacidad="reservas.editar">
              <Button variant="destructive" onClick={confirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Sí, eliminar
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
