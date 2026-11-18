'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { formatearImporte, MONEDAS_SELECCIONABLES } from '@/lib/moneda';
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { etiquetaClaseEnergetica } from '@/lib/real-estate/energia';
import { formatearPrecioInmueble } from '@/lib/real-estate/operation-labels';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { toast } from 'sonner';
import {
  Home,
  Plus,
  Search,
  Filter,
  X,
  Loader2,
  MapPin,
  DollarSign,
  Star,
  Eye,
  Edit2,
  Trash2,
  MoreHorizontal,
  Building2,
  RefreshCw,
  TrendingUp,
  Calendar,
  BedDouble,
  Maximize,
  User,
  FileSignature,
  Globe,
} from 'lucide-react';
import Link from 'next/link';
import { OwnerCard, OwnerBadge } from '@/components/real-estate/OwnerCard';
import { RealEstateModuleNav } from '@/components/real-estate/RealEstateModuleNav';
import { PropertyEditor } from '@/components/real-estate/PropertyEditor';
import { EmbedSnippetCard } from '@/components/real-estate/EmbedSnippetCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Filters {
  search: string;
  operationType: string;
  propertyType: string;
  city: string;
  status: string;
  featured: string;
  minPrice: string;
  maxPrice: string;
  minBedrooms: string;
  minArea: string;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  operationType: '',
  propertyType: '',
  city: '',
  status: '',
  featured: '',
  minPrice: '',
  maxPrice: '',
  minBedrooms: '',
  minArea: '',
};

/**
 * Estado inicial del formulario de alta. La divisa por defecto es la del
 * tenant: estaba fija a 'EUR', así que un inmueble nuevo de un tenant con la
 * moneda en pesos nacía en euros.
 */
const formularioInicial = (moneda: string) => ({
  nombre: '',
  descripcion: '',
  precioBase: '',
  moneda,
  operationType: '',
  propertyType: '',
  city: '',
  address: '',
  areaM2: '',
  bedrooms: '',
  bathrooms: '',
  status: 'disponible',
  energyCert: '',
  energyCertConsumption: '',
  energyCertEmission: '',
  energyCertBody: '',
  energyCertDate: '',
  energyCertExpiry: '',
  energyCertUrl: '',
});

type FormData = ReturnType<typeof formularioInicial>;

// ─── Constants ────────────────────────────────────────────────────────────────

const OPERATION_TYPES = [
  { value: 'venta', label: 'Venta' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'traspaso', label: 'Traspaso' },
];

const PROPERTY_TYPES = [
  { value: 'casa', label: 'Casa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'local_comercial', label: 'Local Comercial' },
  { value: 'terreno', label: 'Terreno' },
  { value: 'bodega', label: 'Bodega' },
  { value: 'nave_industrial', label: 'Nave Industrial' },
  { value: 'edificio', label: 'Edificio' },
];

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'Disponible', color: 'bg-blue-500' },
  { value: 'reservada', label: 'Reservada', color: 'bg-amber-500' },
  { value: 'vendida', label: 'Vendida', color: 'bg-emerald-500' },
  { value: 'alquilada', label: 'Alquilada', color: 'bg-indigo-500' },
];

const getStatusBadge = (status: string | null) => {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  if (!opt) return <Badge variant="outline">{status || '—'}</Badge>;
  return (
    <Badge
      className={`${opt.color} text-white border-0`}
    >
      {opt.label}
    </Badge>
  );
};

const getOperationBadge = (type: string | null) => {
  const opt = OPERATION_TYPES.find((t) => t.value === type);
  return (
    <Badge variant="outline" className="text-xs">
      {opt?.label || type || '—'}
    </Badge>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstatePropertiesPage() {
  // `useSearchParams` exige un límite de Suspense en el prerender de la página.
  return (
    <Suspense fallback={null}>
      <RealEstatePropertiesInner />
    </Suspense>
  );
}

function RealEstatePropertiesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  // Data
  const [properties, setProperties] = useState<InmuebleParsed[]>([]);
  const [loading, setLoading] = useState(true);
  // Selección múltiple para la acción masiva de portales.
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    reserved: 0,
    sold: 0,
    rented: 0,
  });

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<{ owner: InmuebleParsed['owner']; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>(() => formularioInicial(''));
  const [monedaTenant, setMonedaTenant] = useState('');

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchProperties = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pagination.limit));
      params.set('offset', String((page - 1) * pagination.limit));

      if (filters.search) params.set('search', filters.search);
      if (filters.operationType) params.set('operationType', filters.operationType);
      if (filters.propertyType) params.set('propertyType', filters.propertyType);
      if (filters.city) params.set('city', filters.city);
      if (filters.status) params.set('status', filters.status);
      if (filters.featured) params.set('featured', filters.featured === 'true' ? 'true' : 'false');
      if (filters.minPrice) params.set('minPrice', filters.minPrice);
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
      if (filters.minBedrooms) params.set('minBedrooms', filters.minBedrooms);
      if (filters.minArea) params.set('minArea', filters.minArea);

      const res = await apiFetch(`/api/real-estate/properties?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProperties(data.properties || []);
        setPagination((prev) => ({
          ...prev,
          page,
          total: data.pagination?.total || 0,
          totalPages: data.pagination?.totalPages || 0,
        }));
      }
    } catch (error) {
      console.error('[PropertiesList] Error fetching:', error);
      toast.error('Error al cargar propiedades');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/real-estate/dashboard-stats');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) {
          setStats(data.stats);
        }
        // La API informa la divisa de reporte del tenant: es la que debe nacer
        // marcada en el formulario de alta.
        if (typeof data.moneda === 'string') {
          setMonedaTenant(data.moneda);
        }
      }
    } catch (error) {
      console.error('[PropertiesList] Error fetching stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchProperties(1);
    fetchStats();
  }, []);

  // Fetch on filter change (debounced search)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProperties(1);
    }, filters.search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [filters.operationType, filters.propertyType, filters.city, filters.status, filters.featured, filters.minPrice, filters.maxPrice, filters.minBedrooms, filters.minArea]);

  const { data: session } = useSession() || {};

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSearch = () => {
    fetchProperties(1);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    fetchProperties(1);
  };

  const handleToggleFeatured = async (property: InmuebleParsed) => {
    try {
      const res = await apiFetch(`/api/real-estate/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destacado: !property.destacado,
          featured: !property.featured,
        }),
      });
      if (res.ok) {
        toast.success(property.destacado ? 'Quitada de destacadas' : 'Marcada como destacada');
        fetchProperties(pagination.page);
        fetchStats();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al actualizar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  /**
   * Interruptor de portales del listado. Se pinta al instante y se revierte si
   * el PATCH falla, para que el comercial no crea que quedó guardado.
   */
  const handleTogglePublicable = async (property: InmuebleParsed) => {
    const nuevo = !property.publicableEnPortales;
    setProperties((prev) =>
      prev.map((p) => (p.id === property.id ? { ...p, publicableEnPortales: nuevo } : p))
    );
    try {
      const res = await apiFetch(`/api/real-estate/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicableEnPortales: nuevo }),
      });
      if (!res.ok) throw new Error('PATCH falló');
      toast.success(
        nuevo ? 'Se enviará a portales' : 'Dejará de enviarse a portales'
      );
    } catch {
      setProperties((prev) =>
        prev.map((p) =>
          p.id === property.id ? { ...p, publicableEnPortales: !nuevo } : p
        )
      );
      toast.error('No se pudo cambiar la publicación en portales');
    }
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const todasSeleccionadas =
    properties.length > 0 && properties.every((p) => seleccionadas.has(p.id));

  const toggleTodas = () => {
    setSeleccionadas((prev) => {
      if (properties.every((p) => prev.has(p.id))) return new Set();
      return new Set(properties.map((p) => p.id));
    });
  };

  /** Acción masiva: una sola petición para todas las fichas seleccionadas. */
  const handleBulkPublicable = async (publicable: boolean) => {
    const ids = Array.from(seleccionadas);
    if (ids.length === 0) return;
    setGuardandoLote(true);
    try {
      const res = await apiFetch('/api/real-estate/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, publicableEnPortales: publicable }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al actualizar');
      }
      const seleccion = new Set(ids);
      setProperties((prev) =>
        prev.map((p) =>
          seleccion.has(p.id) ? { ...p, publicableEnPortales: publicable } : p
        )
      );
      toast.success(
        publicable
          ? `${ids.length} ${ids.length === 1 ? 'ficha se enviará' : 'fichas se enviarán'} a portales`
          : `${ids.length} ${ids.length === 1 ? 'ficha deja' : 'fichas dejan'} de enviarse a portales`
      );
      setSeleccionadas(new Set());
    } catch (error: any) {
      toast.error(error?.message || 'No se pudieron actualizar las fichas');
    } finally {
      setGuardandoLote(false);
    }
  };

  const handleDelete = async (property: InmuebleParsed) => {
    if (!confirm(`¿Estás seguro de eliminar "${property.nombre}"?`)) return;
    try {
      const res = await apiFetch(`/api/real-estate/properties/${property.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Propiedad eliminada');
        fetchProperties(pagination.page);
        fetchStats();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleCreateProperty = async () => {
    if (!form.nombre || !form.precioBase) {
      toast.error('Nombre y precio son requeridos');
      return;
    }
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        precioBase: parseFloat(form.precioBase),
        moneda: form.moneda,
        operationType: form.operationType || undefined,
        propertyType: form.propertyType || undefined,
        city: form.city || undefined,
        address: form.address || undefined,
        areaM2: form.areaM2 ? parseInt(form.areaM2) : undefined,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseInt(form.bathrooms) : undefined,
        status: form.status,
        energyCert: form.energyCert || undefined,
        energyCertConsumption: form.energyCertConsumption ? parseFloat(form.energyCertConsumption) : undefined,
        energyCertEmission: form.energyCertEmission ? parseFloat(form.energyCertEmission) : undefined,
        energyCertBody: form.energyCertBody || undefined,
        energyCertDate: form.energyCertDate || undefined,
        energyCertExpiry: form.energyCertExpiry || undefined,
        energyCertUrl: form.energyCertUrl || undefined,
      };

      const res = await apiFetch('/api/real-estate/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const creada = await res.json();
        toast.success('Propiedad creada correctamente');
        setDialogOpen(false);
        setForm(formularioInicial(monedaTenant));
        fetchProperties(1);
        fetchStats();
        // Abrir el nuevo editor por secciones con la propiedad recién creada.
        if (creada?.id) {
          router.push(`/dashboard/real-estate/properties?edit=${creada.id}`);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al crear');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  // ─── Pagination Helpers ─────────────────────────────────────────────────────

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const { totalPages, page } = pagination;
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Editor por secciones (estilo Airbnb): sustituye por completo el listado
  // mientras `?edit=<id>` está en la URL. «Volver» limpia el parámetro.
  if (editId) {
    return (
      <div className="space-y-0 p-4 md:p-8 pt-6">
        <RealEstateModuleNav />
        <PropertyEditor
          propertyId={editId}
          onBack={() => router.push('/dashboard/real-estate/properties', { scroll: false })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8 pt-6">
      <RealEstateModuleNav />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Propiedades
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona tu portafolio inmobiliario
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { fetchProperties(pagination.page); fetchStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button onClick={() => { setForm(formularioInicial(monedaTenant)); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Propiedad
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/real-estate/captaciones">
              <FileSignature className="h-4 w-4 mr-2" />
              Captaciones
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/catalogo?tipo=inmueble">
              <Edit2 className="h-4 w-4 mr-2" />
              Catálogo completo
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        {[
          { label: 'Total', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Disponibles', value: stats.available, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Reservadas', value: stats.reserved, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Vendidas', value: stats.sold, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'Alquiladas', value: stats.rented, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
        ].map((item) => (
          <Card key={item.label} className="border-l-4 border-l-current" style={{ borderLeftColor: 'var(--border)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
              {item.label === 'Total' && (
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total > 0
                    ? `${((stats.available / stats.total) * 100).toFixed(0)}% disponibles`
                    : 'Sin datos'}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o descripción..."
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>

              {/* Quick filters */}
              <Select
                value={filters.operationType}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, operationType: v }))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Operación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {OPERATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, status: v }))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filtros
              </Button>
              {(filters.search || filters.operationType || filters.propertyType || filters.city || filters.status || filters.featured || filters.minPrice || filters.maxPrice || filters.minBedrooms || filters.minArea) && (
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <Label className="text-xs">Tipo Inmueble</Label>
                <Select
                  value={filters.propertyType}
                  onValueChange={(v) => setFilters((prev) => ({ ...prev, propertyType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Ciudad/Zona</Label>
                <Input
                  placeholder="Ej: Madrid"
                  value={filters.city}
                  onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs">Precio Mín.</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filters.minPrice}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs">Precio Máx.</Label>
                <Input
                  type="number"
                  placeholder="999999"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs">Habitaciones mín.</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filters.minBedrooms}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minBedrooms: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs">Área mín. (m²)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filters.minArea}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minArea: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs">Destacadas</Label>
                <Select
                  value={filters.featured}
                  onValueChange={(v) => setFilters((prev) => ({ ...prev, featured: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="true">Solo destacadas</SelectItem>
                    <SelectItem value="false">No destacadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Acción masiva de portales: aparece al seleccionar fichas */}
      {seleccionadas.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
          <span className="px-1 text-sm font-medium">
            {seleccionadas.size} {seleccionadas.size === 1 ? 'ficha seleccionada' : 'fichas seleccionadas'}
          </span>
          <Button
            size="sm"
            onClick={() => handleBulkPublicable(true)}
            disabled={guardandoLote}
          >
            {guardandoLote ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Globe className="mr-1.5 h-4 w-4" />
            )}
            Marcar para portales
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkPublicable(false)}
            disabled={guardandoLote}
          >
            Quitar de portales
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSeleccionadas(new Set())}
            disabled={guardandoLote}
          >
            Limpiar selección
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Cargando propiedades...</p>
              </div>
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-16">
              <Home className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <h3 className="text-lg font-medium mb-2">No hay propiedades</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {filters.search || filters.operationType || filters.status
                  ? 'No se encontraron propiedades con los filtros seleccionados. Intenta ajustar los criterios de búsqueda.'
                  : 'Comienza añadiendo tu primera propiedad inmobiliaria.'}
              </p>
              {!filters.search && !filters.operationType && !filters.status && (
                <Button onClick={() => { setForm(formularioInicial(monedaTenant)); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir Primera Propiedad
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Escritorio: tabla. En móvil la tabla ni se pinta: con diez
                  columnas obligaba a desplazar en horizontal para ver el precio. */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={todasSeleccionadas}
                          onCheckedChange={toggleTodas}
                          aria-label="Seleccionar todas las propiedades de esta página"
                        />
                      </TableHead>
                      <TableHead className="w-[300px]">Propiedad</TableHead>
                      <TableHead>Operación</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Energía</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-center">Habs</TableHead>
                      <TableHead className="text-center">Área</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-center">Portales</TableHead>
                      <TableHead className="text-right w-[100px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {properties.map((property) => (
                      <TableRow
                        key={property.id}
                        className="group cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/dashboard/real-estate/properties?edit=${property.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={seleccionadas.has(property.id)}
                            onCheckedChange={() => toggleSeleccion(property.id)}
                            aria-label={`Seleccionar ${property.nombre}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                              {Array.isArray(property.media) && property.media.length > 0 ? (
                                <img
                                  src={(property.media[0] as any)?.url || property.media[0] as string}
                                  alt={property.nombre}
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).parentElement!.classList.add('flex', 'items-center', 'justify-center');
                                  }}
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <Home className="w-5 h-5 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {property.destacado && (
                                  <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                                )}
                                <span className="font-medium truncate block max-w-[180px]">
                                  {property.nombre}
                                </span>
                              </div>
                              {property.descripcion && (
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {property.descripcion}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getOperationBadge(property.operationType)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs font-normal">
                            {property.propertyType
                              ? PROPERTY_TYPES.find((t) => t.value === property.propertyType)?.label ||
                                property.propertyType
                              : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const energia = etiquetaClaseEnergetica(property.energyCert);
                            if (!energia) return <span className="text-muted-foreground">—</span>;
                            return (
                              <span
                                className="inline-flex min-w-[2rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold"
                                style={{
                                  backgroundColor: energia.color,
                                  color: energia.textoOscuro ? '#1f2937' : '#ffffff',
                                }}
                                title={`Clase energética ${property.energyCert}`}
                              >
                                {energia.texto}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate max-w-[120px]">
                              {property.city || property.address || '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <span className="text-primary">
                            {formatearPrecioInmueble(property.precioBase, property.moneda)}
                          </span>
                          {property.areaM2 && property.areaM2 > 0 && property.precioBase > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              {formatearImporte(property.precioBase / property.areaM2, property.moneda, 0)} / m²
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {property.bedrooms ? (
                            <span className="flex items-center justify-center gap-1 text-sm">
                              <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                              {property.bedrooms}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {property.areaM2 ? (
                            <span className="flex items-center justify-center gap-1 text-sm">
                              <Maximize className="h-3.5 w-3.5 text-muted-foreground" />
                              {property.areaM2}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(property.status)}
                        </TableCell>
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            checked={property.publicableEnPortales}
                            onCheckedChange={() => handleTogglePublicable(property)}
                            aria-label={`Publicar ${property.nombre} en portales`}
                            title={
                              property.publicableEnPortales
                                ? 'Se envía a portales'
                                : 'No se envía a portales'
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Ver propietario"
                              onClick={() => {
                                setSelectedOwner({ owner: property.owner, name: property.nombre });
                                setOwnerDialogOpen(true);
                              }}
                            >
                              <User className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={property.destacado ? 'Quitar destacada' : 'Marcar como destacada'}
                              onClick={() => handleToggleFeatured(property)}
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  property.destacado
                                    ? 'text-yellow-500 fill-yellow-500'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Editar"
                              asChild
                            >
                              <Link href={`/dashboard/real-estate/properties?edit=${property.id}`}>
                                <Edit2 className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="Eliminar"
                              onClick={() => handleDelete(property)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Móvil: una tarjeta por inmueble, con los datos que en la tabla
                  quedaban fuera de pantalla y las acciones siempre visibles
                  (en táctil no hay hover que las revele). */}
              <ul className="md:hidden">
                {properties.map((property) => {
                  const energia = etiquetaClaseEnergetica(property.energyCert);
                  const tipoEtiqueta = property.propertyType
                    ? PROPERTY_TYPES.find((t) => t.value === property.propertyType)?.label ||
                      property.propertyType
                    : '—';
                  const abrir = () => router.push(`/dashboard/real-estate/properties?edit=${property.id}`);

                  return (
                    <li key={property.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={abrir}
                        className="flex w-full items-start gap-3 p-3 text-left transition-colors active:bg-muted/60"
                      >
                        <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                          {Array.isArray(property.media) && property.media.length > 0 ? (
                            <img
                              src={(property.media[0] as any)?.url || (property.media[0] as string)}
                              alt={property.nombre}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.classList.add('flex', 'items-center', 'justify-center');
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Home className="h-6 w-6 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            {property.destacado && (
                              <Star className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 fill-yellow-500 text-yellow-500" />
                            )}
                            <span className="line-clamp-2 font-medium leading-snug">{property.nombre}</span>
                          </div>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{property.city || property.address || 'Sin ubicación'}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {getStatusBadge(property.status)}
                            {getOperationBadge(property.operationType)}
                            <Badge variant="secondary" className="text-xs font-normal">
                              {tipoEtiqueta}
                            </Badge>
                            {energia && (
                              <span
                                className="inline-flex min-w-[1.75rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold"
                                style={{
                                  backgroundColor: energia.color,
                                  color: energia.textoOscuro ? '#1f2937' : '#ffffff',
                                }}
                                title={`Clase energética ${property.energyCert}`}
                              >
                                {energia.texto}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="font-semibold text-primary">
                              {formatearPrecioInmueble(property.precioBase, property.moneda)}
                            </span>
                            <span className="flex items-center gap-3 text-xs text-muted-foreground">
                              {property.bedrooms ? (
                                <span className="flex items-center gap-1">
                                  <BedDouble className="h-3.5 w-3.5" />
                                  {property.bedrooms}
                                </span>
                              ) : null}
                              {property.areaM2 ? (
                                <span className="flex items-center gap-1">
                                  <Maximize className="h-3.5 w-3.5" />
                                  {property.areaM2} m²
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center justify-end gap-1 px-2 pb-2">
                        <div className="mr-auto flex items-center gap-3 pl-2">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox
                              checked={seleccionadas.has(property.id)}
                              onCheckedChange={() => toggleSeleccion(property.id)}
                              aria-label={`Seleccionar ${property.nombre}`}
                            />
                            Seleccionar
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Switch
                              checked={property.publicableEnPortales}
                              onCheckedChange={() => handleTogglePublicable(property)}
                              aria-label={`Publicar ${property.nombre} en portales`}
                            />
                            Portales
                          </label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          title="Ver propietario"
                          onClick={() => {
                            setSelectedOwner({ owner: property.owner, name: property.nombre });
                            setOwnerDialogOpen(true);
                          }}
                        >
                          <User className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          title={property.destacado ? 'Quitar destacada' : 'Marcar como destacada'}
                          onClick={() => handleToggleFeatured(property)}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              property.destacado ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'
                            }`}
                          />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title="Editar" asChild>
                          <Link href={`/dashboard/real-estate/properties?edit=${property.id}`}>
                            <Edit2 className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          title="Eliminar"
                          onClick={() => handleDelete(property)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Pagination info */}
              <div className="flex flex-col gap-3 border-t px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                <p className="text-sm text-muted-foreground">
                  Mostrando {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} de{' '}
                  <span className="font-medium">{pagination.total}</span> propiedades
                </p>

                {pagination.totalPages > 1 && (
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (pagination.page > 1) fetchProperties(pagination.page - 1);
                          }}
                          className={pagination.page <= 1 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>

                      {getPageNumbers().map((pageNum, idx) =>
                        pageNum === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${idx}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              href="#"
                              isActive={pageNum === pagination.page}
                              onClick={(e) => {
                                e.preventDefault();
                                fetchProperties(pageNum);
                              }}
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (pagination.page < pagination.totalPages) fetchProperties(pagination.page + 1);
                          }}
                          className={
                            pagination.page >= pagination.totalPages ? 'pointer-events-none opacity-50' : ''
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick-create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              Nueva Propiedad
            </DialogTitle>
            <DialogDescription>
              Añade una nueva propiedad inmobiliaria. Los campos con * son obligatorios.
              Para campos avanzados usa el catálogo completo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nombre */}
            <div>
              <Label>
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Piso en el centro de Madrid"
              />
            </div>

            {/* Descripción */}
            <div>
              <Label>Descripción</Label>
              <Input
                value={form.descripcion}
                onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Breve descripción de la propiedad"
              />
            </div>

            {/* Precio + Moneda */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>
                  Precio Base <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  value={form.precioBase}
                  onChange={(e) => setForm((prev) => ({ ...prev, precioBase: e.target.value }))}
                  placeholder="250000"
                />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select
                  value={form.moneda}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, moneda: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONEDAS_SELECCIONABLES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Operación + Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Operación</Label>
                <Select
                  value={form.operationType}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, operationType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Inmueble</Label>
                <Select
                  value={form.propertyType}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, propertyType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ciudad + Dirección */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ciudad / Zona</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="Madrid"
                />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Calle Mayor, 1"
                />
              </div>
            </div>

            {/* Área + Habitaciones + Baños */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Área (m²)</Label>
                <Input
                  type="number"
                  value={form.areaM2}
                  onChange={(e) => setForm((prev) => ({ ...prev, areaM2: e.target.value }))}
                  placeholder="100"
                />
              </div>
              <div>
                <Label>Habitaciones</Label>
                <Input
                  type="number"
                  value={form.bedrooms}
                  onChange={(e) => setForm((prev) => ({ ...prev, bedrooms: e.target.value }))}
                  placeholder="3"
                />
              </div>
              <div>
                <Label>Baños</Label>
                <Input
                  type="number"
                  value={form.bathrooms}
                  onChange={(e) => setForm((prev) => ({ ...prev, bathrooms: e.target.value }))}
                  placeholder="2"
                />
              </div>
            </div>

            {/* Estado */}
            <div>
              <Label>Estado</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((prev) => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Certificación Energética */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                ⚡ Certificación Energética
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Clasificación</Label>
                  <Select
                    value={form.energyCert}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, energyCert: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'En trámite'].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Consumo Energético</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.energyCertConsumption}
                    onChange={(e) => setForm((prev) => ({ ...prev, energyCertConsumption: e.target.value }))}
                    placeholder="kWh/m²/año"
                  />
                </div>
                <div>
                  <Label>Emisiones CO₂</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.energyCertEmission}
                    onChange={(e) => setForm((prev) => ({ ...prev, energyCertEmission: e.target.value }))}
                    placeholder="kg CO₂/m²/año"
                  />
                </div>
                <div>
                  <Label>Organismo Certificador</Label>
                  <Input
                    value={form.energyCertBody}
                    onChange={(e) => setForm((prev) => ({ ...prev, energyCertBody: e.target.value }))}
                    placeholder="Ej: IDAE, ICAEN..."
                  />
                </div>
                <div>
                  <Label>Fecha del Certificado</Label>
                  <Input
                    type="date"
                    value={form.energyCertDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, energyCertDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Caducidad</Label>
                  <Input
                    type="date"
                    value={form.energyCertExpiry}
                    onChange={(e) => setForm((prev) => ({ ...prev, energyCertExpiry: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Documento (URL)</Label>
                  <Input
                    value={form.energyCertUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, energyCertUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateProperty} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Propiedad
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OwnerCard Dialog */}
      <Dialog open={ownerDialogOpen} onOpenChange={setOwnerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Propietario / Vendedor
            </DialogTitle>
            <DialogDescription>
              {selectedOwner?.name
                ? `Datos del propietario de "${selectedOwner.name}"`
                : 'Datos de contacto del propietario de la propiedad'}
            </DialogDescription>
          </DialogHeader>
          {selectedOwner && (
            <OwnerCard
              owner={selectedOwner.owner}
              propertyName={selectedOwner.name}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmbedSnippetCard tenantId={session?.user?.tenantId} className="border-l-4 border-l-primary" />
    </div>
  );
}
