'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useFiscalConfig } from '@/hooks/use-fiscal-config';
import {
  Plus, Search, Package, Briefcase, Calendar, GraduationCap, Edit2, Trash2,
  Star, Clock, Euro, DollarSign, Tag, Filter, Loader2, Image as ImageIcon,
  Video, FileText, X, Percent, Layers, Settings2, Upload
} from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';

// ============== TIPOS ==============
// Definición global de campo (del tenant)
interface FieldDefinition {
  id: string;
  fieldKey: string;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  orden: number;
  categoria: string | null;
  placeholder: string | null;
  unidad: string | null;
  valorDefecto: string | null;
  activo: boolean;
}

// Valores de campos personalizados (por item)
type CustomFieldValues = Record<string, string | number | boolean | null>;

interface MediaData {
  imagenes: string[];
  video_tour?: string;
  documento_tecnico?: string;
  tour_360?: string;
}

interface PricingDiscount {
  tipo: string;
  min?: number;
  descuento: number;
}

interface PricingData {
  tipo: 'unico' | 'recurrente' | 'por_hora';
  descuentos: PricingDiscount[];
  impuestos: {
    iva: number;
    incluido: boolean;
  };
}

interface CatalogoItem {
  id: string;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  tipo: string;
  precioBase: number;
  moneda: string;
  categoriaFiscal: string;
  tasaImpuestoId: string | null;
  duracionMinutos: number | null;
  modalidad: string | null;
  unidad: string;
  activo: boolean;
  destacado: boolean;
  // Nuevos campos Fase 1
  customFieldValues: CustomFieldValues | null;
  categorias: string[];
  etiquetas: string[];
  metadata: Record<string, any> | null;
  media: MediaData | null;
  pricing: PricingData | null;
  tasaImpuesto?: {
    id: string;
    nombre: string;
    codigo: string;
    porcentaje: number;
    tipo: string;
  } | null;
}

interface TasaImpuesto {
  id: string;
  nombre: string;
  codigo: string;
  porcentaje: number;
}

// ============== CONSTANTES ==============
const TIPOS_ITEM = [
  { value: 'producto', label: 'Producto', icon: Package },
  { value: 'servicio', label: 'Servicio', icon: Briefcase },
  { value: 'cita', label: 'Cita', icon: Calendar },
  { value: 'academia', label: 'Academia', icon: GraduationCap },
];

const CATEGORIAS_FISCALES = [
  { value: 'general', label: 'General' },
  { value: 'reducido', label: 'Reducido' },
  { value: 'superreducido', label: 'Super Reducido' },
  { value: 'exento', label: 'Exento' },
];

const UNIDADES = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'hora', label: 'Hora' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'mes', label: 'Mes' },
  { value: 'sesion', label: 'Sesión' },
  { value: 'paquete', label: 'Paquete' },
];

const MODALIDADES = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'hibrido', label: 'Híbrido' },
];

const TIPOS_PRECIO = [
  { value: 'unico', label: 'Pago Único' },
  { value: 'recurrente', label: 'Recurrente (suscripción)' },
  { value: 'por_hora', label: 'Por Hora' },
];

// ============== COMPONENTE PRINCIPAL ==============
export default function CatalogoPage() {
  const { config: fiscalConfig, loading: loadingFiscal } = useFiscalConfig();
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [tasas, setTasas] = useState<TasaImpuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('');
  const [filterActivo, setFilterActivo] = useState<string>('');
  const [filterCategoria, setFilterCategoria] = useState<string>('');
  const [filterEtiqueta, setFilterEtiqueta] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogoItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basico');
  
  // Filtros disponibles del backend
  const [availableCategorias, setAvailableCategorias] = useState<string[]>([]);
  const [availableEtiquetas, setAvailableEtiquetas] = useState<string[]>([]);

  // Estado del formulario básico
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    sku: '',
    tipo: 'servicio',
    precioBase: '',
    moneda: '',
    categoriaFiscal: 'general',
    tasaImpuestoId: '',
    duracionMinutos: '',
    modalidad: '',
    unidad: 'unidad',
    activo: true,
    destacado: false,
  });

  // Estados para nuevos campos
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValues>({});
  const [categorias, setCategorias] = useState<string[]>([]);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [newCategoria, setNewCategoria] = useState('');
  const [newEtiqueta, setNewEtiqueta] = useState('');
  const [media, setMedia] = useState<MediaData>({ imagenes: [] });
  const [pricing, setPricing] = useState<PricingData>({
    tipo: 'unico',
    descuentos: [],
    impuestos: { iva: 0.21, incluido: false },
  });
  const [metadata, setMetadata] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchItems();
    fetchTasas();
    fetchFieldDefinitions();
  }, [filterTipo, filterActivo, filterCategoria, filterEtiqueta]);

  const fetchFieldDefinitions = async () => {
    try {
      const res = await fetch('/api/catalogo/field-definitions');
      if (res.ok) {
        const data = await res.json();
        setFieldDefinitions(data.fieldDefinitions || []);
      }
    } catch (error) {
      console.error('Error loading field definitions:', error);
    }
  };

  useEffect(() => {
    if (!loadingFiscal && fiscalConfig && !form.moneda) {
      setForm(prev => ({ ...prev, moneda: fiscalConfig.currencyCode }));
    }
  }, [fiscalConfig, loadingFiscal, form.moneda]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterTipo && filterTipo !== 'all') params.set('tipo', filterTipo);
      if (filterActivo && filterActivo !== 'all') params.set('activo', filterActivo);
      if (filterCategoria && filterCategoria !== 'all') params.set('categoria', filterCategoria);
      if (filterEtiqueta && filterEtiqueta !== 'all') params.set('etiqueta', filterEtiqueta);
      if (search) params.set('search', search);

      const res = await fetch(`/api/catalogo?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setAvailableCategorias(data.filtros?.categorias || []);
        setAvailableEtiquetas(data.filtros?.etiquetas || []);
      }
    } catch (error) {
      console.error('Error loading catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasas = async () => {
    try {
      const res = await fetch('/api/configuracion/fiscal/tasas?activo=true');
      if (res.ok) {
        const data = await res.json();
        setTasas(data.tasas || []);
      }
    } catch (error) {
      console.error('Error loading tax rates:', error);
    }
  };

  const handleSearch = () => {
    fetchItems();
  };

  const resetFormState = () => {
    setCustomFieldValues({});
    setCategorias([]);
    setEtiquetas([]);
    setMedia({ imagenes: [] });
    setPricing({ tipo: 'unico', descuentos: [], impuestos: { iva: 0.21, incluido: false } });
    setMetadata({});
    setActiveTab('basico');
  };

  const handleEdit = (item: CatalogoItem) => {
    setEditing(item);
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      sku: item.sku || '',
      tipo: item.tipo,
      precioBase: item.precioBase.toString(),
      moneda: item.moneda,
      categoriaFiscal: item.categoriaFiscal,
      tasaImpuestoId: item.tasaImpuestoId || '',
      duracionMinutos: item.duracionMinutos?.toString() || '',
      modalidad: item.modalidad || '',
      unidad: item.unidad,
      activo: item.activo,
      destacado: item.destacado,
    });
    // Cargar nuevos campos
    setCustomFieldValues(item.customFieldValues || {});
    setCategorias(item.categorias || []);
    setEtiquetas(item.etiquetas || []);
    setMedia(item.media || { imagenes: [] });
    setPricing(item.pricing || { tipo: 'unico', descuentos: [], impuestos: { iva: 0.21, incluido: false } });
    setMetadata(item.metadata || {});
    setActiveTab('basico');
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setForm({
      nombre: '',
      descripcion: '',
      sku: '',
      tipo: 'servicio',
      precioBase: '',
      moneda: fiscalConfig?.currencyCode || 'EUR',
      categoriaFiscal: 'general',
      tasaImpuestoId: '',
      duracionMinutos: '',
      modalidad: '',
      unidad: 'unidad',
      activo: true,
      destacado: false,
    });
    resetFormState();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !form.precioBase) {
      toast.error('Nombre y precio son requeridos');
      return;
    }

    setSaving(true);
    try {
      const url = editing ? `/api/catalogo/${editing.id}` : '/api/catalogo';
      const method = editing ? 'PATCH' : 'POST';

      const payload = {
        ...form,
        precioBase: parseFloat(form.precioBase),
        duracionMinutos: form.duracionMinutos ? parseInt(form.duracionMinutos) : null,
        tasaImpuestoId: form.tasaImpuestoId || null,
        modalidad: form.modalidad || null,
        // Nuevos campos
        customFieldValues: Object.keys(customFieldValues).length > 0 ? customFieldValues : null,
        categorias,
        etiquetas,
        media: media.imagenes.length > 0 || media.video_tour || media.documento_tecnico || media.tour_360 ? media : null,
        pricing: pricing.tipo !== 'unico' || pricing.descuentos.length > 0 ? pricing : null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editing ? 'Ítem actualizado' : 'Ítem creado');
        setDialogOpen(false);
        fetchItems();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CatalogoItem) => {
    if (!confirm(`¿Eliminar "${item.nombre}"?`)) return;

    try {
      const res = await fetch(`/api/catalogo/${item.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Ítem eliminado');
        fetchItems();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  // ============== HANDLER PARA CUSTOM FIELD VALUES ==============
  const updateCustomFieldValue = (fieldKey: string, value: string | number | boolean | null) => {
    setCustomFieldValues(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  // Filtrar campos según la categoría del producto actual (si aplica)
  const getApplicableFields = () => {
    const currentCategorias = categorias.map(c => c.toLowerCase());
    return fieldDefinitions.filter(field => {
      // Si el campo no tiene categoría específica, aplica a todos
      if (!field.categoria) return true;
      // Si tiene categoría, verificar si el producto actual tiene esa categoría
      return currentCategorias.includes(field.categoria.toLowerCase());
    });
  };

  // ============== HANDLERS PARA CATEGORIAS/ETIQUETAS ==============
  const addCategoria = () => {
    if (newCategoria && !categorias.includes(newCategoria)) {
      setCategorias([...categorias, newCategoria]);
      setNewCategoria('');
    }
  };

  const removeCategoria = (cat: string) => {
    setCategorias(categorias.filter(c => c !== cat));
  };

  const addEtiqueta = () => {
    if (newEtiqueta && !etiquetas.includes(newEtiqueta)) {
      setEtiquetas([...etiquetas, newEtiqueta]);
      setNewEtiqueta('');
    }
  };

  const removeEtiqueta = (tag: string) => {
    setEtiquetas(etiquetas.filter(t => t !== tag));
  };

  // ============== HANDLERS PARA PRICING ==============
  const addDiscount = () => {
    setPricing({
      ...pricing,
      descuentos: [...pricing.descuentos, { tipo: 'volumen', min: 1, descuento: 0 }],
    });
  };

  const updateDiscount = (index: number, field: Partial<PricingDiscount>) => {
    const updated = [...pricing.descuentos];
    updated[index] = { ...updated[index], ...field };
    setPricing({ ...pricing, descuentos: updated });
  };

  const removeDiscount = (index: number) => {
    setPricing({
      ...pricing,
      descuentos: pricing.descuentos.filter((_, i) => i !== index),
    });
  };

  // ============== HELPERS ==============
  const getTipoIcon = (tipo: string) => {
    const found = TIPOS_ITEM.find(t => t.value === tipo);
    return found ? found.icon : Package;
  };

  const getTipoLabel = (tipo: string) => {
    return TIPOS_ITEM.find(t => t.value === tipo)?.label || tipo;
  };

  const formatPrice = (price: number, currency: string) => {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    return `${symbol}${price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
  };

  const showDuracion = form.tipo === 'cita' || form.tipo === 'servicio';
  const showModalidad = form.tipo === 'cita' || form.tipo === 'servicio';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Productos y Servicios</h1>
          <p className="text-muted-foreground">
            Gestiona tu catálogo centralizado con precios flexibles y campos personalizados
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Ítem
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TIPOS_ITEM.map(tipo => {
          const Icon = tipo.icon;
          const count = items.filter(i => i.tipo === tipo.value).length;
          return (
            <Card key={tipo.value}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{tipo.label}s</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, descripción o SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-[130px]">
              <Label>Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {TIPOS_ITEM.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[130px]">
              <Label>Estado</Label>
              <Select value={filterActivo} onValueChange={setFilterActivo}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Activos</SelectItem>
                  <SelectItem value="false">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {availableCategorias.length > 0 && (
              <div className="w-[150px]">
                <Label>Categoría</Label>
                <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {availableCategorias.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {availableEtiquetas.length > 0 && (
              <div className="w-[150px]">
                <Label>Etiqueta</Label>
                <Select value={filterEtiqueta} onValueChange={setFilterEtiqueta}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {availableEtiquetas.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" onClick={handleSearch}>
              <Filter className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay ítems en el catálogo. Crea el primero.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Categorías</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const Icon = getTipoIcon(item.tipo);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.destacado && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                          <span className="font-medium">{item.nombre}</span>
                        </div>
                        {item.descripcion && (
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {item.descripcion}
                          </p>
                        )}
                        {item.etiquetas && item.etiquetas.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {item.etiquetas.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                            {item.etiquetas.length > 3 && (
                              <Badge variant="outline" className="text-[10px]">+{item.etiquetas.length - 3}</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <Icon className="h-3 w-3" />
                          {getTipoLabel(item.tipo)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.sku ? (
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">{item.sku}</code>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(item.precioBase, item.moneda)}
                        {item.duracionMinutos && (
                          <span className="text-xs text-muted-foreground ml-1">
                            / {item.duracionMinutos}min
                          </span>
                        )}
                        {item.pricing?.tipo && item.pricing.tipo !== 'unico' && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {item.pricing.tipo === 'recurrente' ? 'Recurrente' : 'Por hora'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.categorias && item.categorias.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.categorias.slice(0, 2).map(cat => (
                              <Badge key={cat} variant="secondary" className="text-[10px]">
                                {cat}
                              </Badge>
                            ))}
                            {item.categorias.length > 2 && (
                              <Badge variant="secondary" className="text-[10px]">+{item.categorias.length - 2}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.activo ? 'default' : 'secondary'}>
                          {item.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog con Tabs */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar Ítem' : 'Nuevo Ítem del Catálogo'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Modifica los datos del ítem' : 'Añade un nuevo producto o servicio al catálogo'}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basico" className="text-xs">Básico</TabsTrigger>
              <TabsTrigger value="campos" className="text-xs">Campos</TabsTrigger>
              <TabsTrigger value="categorias" className="text-xs">Categorías</TabsTrigger>
              <TabsTrigger value="media" className="text-xs">Media</TabsTrigger>
              <TabsTrigger value="precios" className="text-xs">Precios</TabsTrigger>
            </TabsList>

            {/* Tab Básico */}
            <TabsContent value="basico" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Nombre del producto o servicio"
                  />
                </div>

                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ITEM.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <t.icon className="h-4 w-4" />
                            {t.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>SKU / Código</Label>
                  <Input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="Código interno"
                  />
                </div>

                <div>
                  <Label>Precio Base *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.precioBase}
                    onChange={(e) => setForm({ ...form, precioBase: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label>Moneda</Label>
                  <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="USD">USD - Dólar</SelectItem>
                      <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                      <SelectItem value="GBP">GBP - Libra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Unidad</Label>
                  <Select value={form.unidad} onValueChange={(v) => setForm({ ...form, unidad: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Categoría Fiscal</Label>
                  <Select value={form.categoriaFiscal} onValueChange={(v) => setForm({ ...form, categoriaFiscal: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS_FISCALES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {tasas.length > 0 && (
                  <div>
                    <Label>Tasa de Impuesto</Label>
                    <Select value={form.tasaImpuestoId} onValueChange={(v) => setForm({ ...form, tasaImpuestoId: v === 'none' ? '' : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tasa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin tasa específica</SelectItem>
                        {tasas.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nombre} ({t.porcentaje}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {showDuracion && (
                  <div>
                    <Label>Duración (minutos)</Label>
                    <Input
                      type="number"
                      value={form.duracionMinutos}
                      onChange={(e) => setForm({ ...form, duracionMinutos: e.target.value })}
                      placeholder="60"
                    />
                  </div>
                )}

                {showModalidad && (
                  <div>
                    <Label>Modalidad</Label>
                    <Select value={form.modalidad} onValueChange={(v) => setForm({ ...form, modalidad: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {MODALIDADES.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="col-span-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Descripción detallada para documentos"
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.activo}
                      onCheckedChange={(v) => setForm({ ...form, activo: v })}
                    />
                    <Label>Activo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.destacado}
                      onCheckedChange={(v) => setForm({ ...form, destacado: v })}
                    />
                    <Label>Destacado</Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab Campos Personalizados */}
            <TabsContent value="campos" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Campos Personalizados</h4>
                  <p className="text-sm text-muted-foreground">
                    Completa los campos definidos para tu catálogo
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open('/dashboard/catalogo/campos', '_blank')}
                >
                  <Settings2 className="h-4 w-4 mr-1" /> Configurar Campos
                </Button>
              </div>

              {getApplicableFields().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No hay campos personalizados definidos</p>
                  <p className="text-sm mt-1">
                    <Button 
                      variant="link" 
                      className="p-0 h-auto text-sm"
                      onClick={() => window.open('/dashboard/catalogo/campos', '_blank')}
                    >
                      Configurar campos globales
                    </Button>
                    {' '}para tu catálogo (ej: superficie, habitaciones, marca)
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {getApplicableFields().map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-destructive">*</span>}
                        {field.unidad && <span className="text-muted-foreground text-xs">({field.unidad})</span>}
                      </Label>
                      
                      {field.type === 'boolean' ? (
                        <Select 
                          value={customFieldValues[field.fieldKey]?.toString() || field.valorDefecto || 'false'} 
                          onValueChange={(v) => updateCustomFieldValue(field.fieldKey, v === 'true')}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Sí</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : field.type === 'select' && field.options ? (
                        <Select 
                          value={customFieldValues[field.fieldKey]?.toString() || field.valorDefecto || ''} 
                          onValueChange={(v) => updateCustomFieldValue(field.fieldKey, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={field.placeholder || 'Seleccionar...'} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.type === 'textarea' ? (
                        <Textarea
                          value={customFieldValues[field.fieldKey]?.toString() || field.valorDefecto || ''}
                          onChange={(e) => updateCustomFieldValue(field.fieldKey, e.target.value)}
                          placeholder={field.placeholder || ''}
                          rows={3}
                        />
                      ) : field.type === 'date' ? (
                        <Input
                          type="date"
                          value={customFieldValues[field.fieldKey]?.toString() || field.valorDefecto || ''}
                          onChange={(e) => updateCustomFieldValue(field.fieldKey, e.target.value)}
                        />
                      ) : (
                        <Input
                          type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                          value={customFieldValues[field.fieldKey]?.toString() || field.valorDefecto || ''}
                          onChange={(e) => updateCustomFieldValue(
                            field.fieldKey, 
                            field.type === 'number' ? (parseFloat(e.target.value) || null) : e.target.value
                          )}
                          placeholder={field.placeholder || ''}
                        />
                      )}
                      
                      {field.categoria && (
                        <p className="text-xs text-muted-foreground">
                          Solo para: {field.categoria}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Tab Categorías y Etiquetas */}
            <TabsContent value="categorias" className="space-y-6 mt-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Categorías</h4>
                    <p className="text-sm text-muted-foreground">Organiza jerárquicamente (ej: Inmuebles › Oficina › Lujo)</p>
                  </div>
                </div>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newCategoria}
                    onChange={(e) => setNewCategoria(e.target.value)}
                    placeholder="Nueva categoría..."
                    onKeyDown={(e) => e.key === 'Enter' && addCategoria()}
                  />
                  <Button variant="outline" onClick={addCategoria}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categorias.map(cat => (
                    <Badge key={cat} variant="secondary" className="gap-1 pr-1">
                      <Layers className="h-3 w-3" />
                      {cat}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() => removeCategoria(cat)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                  {categorias.length === 0 && (
                    <span className="text-sm text-muted-foreground">Sin categorías asignadas</span>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Etiquetas</h4>
                    <p className="text-sm text-muted-foreground">Tags para filtrado rápido (ej: vip, oportunidad, nuevo)</p>
                  </div>
                </div>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newEtiqueta}
                    onChange={(e) => setNewEtiqueta(e.target.value)}
                    placeholder="Nueva etiqueta..."
                    onKeyDown={(e) => e.key === 'Enter' && addEtiqueta()}
                  />
                  <Button variant="outline" onClick={addEtiqueta}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {etiquetas.map(tag => (
                    <Badge key={tag} variant="outline" className="gap-1 pr-1">
                      <Tag className="h-3 w-3" />
                      {tag}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() => removeEtiqueta(tag)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                  {etiquetas.length === 0 && (
                    <span className="text-sm text-muted-foreground">Sin etiquetas asignadas</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Metadata Adicional</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Industria</Label>
                    <Input
                      value={metadata.industria || ''}
                      onChange={(e) => setMetadata({ ...metadata, industria: e.target.value })}
                      placeholder="real-estate, consultoria, etc."
                    />
                  </div>
                  <div>
                    <Label>Prioridad (1-10)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={metadata.prioridad || ''}
                      onChange={(e) => setMetadata({ ...metadata, prioridad: parseInt(e.target.value) || null })}
                      placeholder="3"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab Media */}
            <TabsContent value="media" className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium mb-3">Galería Multimedia</h4>
                <p className="text-sm text-muted-foreground mb-4">Sube imágenes y agrega enlaces de videos y documentos</p>

                <div className="space-y-4">
                  <div>
                    <Label className="flex items-center gap-2 mb-3">
                      <ImageIcon className="h-4 w-4" /> Imágenes del producto/servicio
                    </Label>
                    <ImageUploader
                      images={media.imagenes || []}
                      onChange={(newImages) => setMedia({ ...media, imagenes: newImages })}
                      maxImages={10}
                    />
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      <Video className="h-4 w-4" /> Video Tour (YouTube/Vimeo)
                    </Label>
                    <Input
                      value={media.video_tour || ''}
                      onChange={(e) => setMedia({ ...media, video_tour: e.target.value })}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Documento Técnico (PDF)
                    </Label>
                    <Input
                      value={media.documento_tecnico || ''}
                      onChange={(e) => setMedia({ ...media, documento_tecnico: e.target.value })}
                      placeholder="https://ejemplo.com/ficha-tecnica.pdf"
                    />
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      <Layers className="h-4 w-4" /> Tour 360°
                    </Label>
                    <Input
                      value={media.tour_360 || ''}
                      onChange={(e) => setMedia({ ...media, tour_360: e.target.value })}
                      placeholder="https://tour360.com/propiedad"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab Precios Flexibles */}
            <TabsContent value="precios" className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium mb-3">Motor de Precios Flexible</h4>
                <p className="text-sm text-muted-foreground mb-4">Configura tipo de precio, descuentos por volumen e impuestos</p>

                <div className="space-y-4">
                  <div>
                    <Label>Tipo de Precio</Label>
                    <Select 
                      value={pricing.tipo} 
                      onValueChange={(v) => setPricing({ ...pricing, tipo: v as PricingData['tipo'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_PRECIO.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Impuestos</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">IVA (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={(pricing.impuestos.iva * 100).toFixed(0)}
                          onChange={(e) => setPricing({ 
                            ...pricing, 
                            impuestos: { ...pricing.impuestos, iva: parseFloat(e.target.value) / 100 || 0 } 
                          })}
                          placeholder="21"
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={pricing.impuestos.incluido}
                            onCheckedChange={(v) => setPricing({ 
                              ...pricing, 
                              impuestos: { ...pricing.impuestos, incluido: v } 
                            })}
                          />
                          <Label>IVA Incluido</Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Descuentos por Volumen</Label>
                      <Button variant="outline" size="sm" onClick={addDiscount}>
                        <Plus className="h-4 w-4 mr-1" /> Añadir
                      </Button>
                    </div>
                    {pricing.descuentos.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground border-2 border-dashed rounded-lg">
                        <Percent className="h-6 w-6 mx-auto mb-1 opacity-50" />
                        <p className="text-sm">Sin descuentos configurados</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pricing.descuentos.map((desc, index) => (
                          <div key={index} className="flex gap-2 items-center p-2 bg-muted/50 rounded-lg">
                            <div className="flex-1 grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-xs">Tipo</Label>
                                <Select 
                                  value={desc.tipo} 
                                  onValueChange={(v) => updateDiscount(index, { tipo: v })}
                                >
                                  <SelectTrigger className="text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="volumen">Por Volumen</SelectItem>
                                    <SelectItem value="temporada">Temporada</SelectItem>
                                    <SelectItem value="promocion">Promoción</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Mínimo Unidades</Label>
                                <Input
                                  type="number"
                                  value={desc.min || ''}
                                  onChange={(e) => updateDiscount(index, { min: parseInt(e.target.value) || 0 })}
                                  placeholder="3"
                                  className="text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Descuento (%)</Label>
                                <Input
                                  type="number"
                                  value={desc.descuento}
                                  onChange={(e) => updateDiscount(index, { descuento: parseFloat(e.target.value) || 0 })}
                                  placeholder="10"
                                  className="text-sm"
                                />
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeDiscount(index)}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</>
              ) : (
                editing ? 'Actualizar' : 'Crear'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
