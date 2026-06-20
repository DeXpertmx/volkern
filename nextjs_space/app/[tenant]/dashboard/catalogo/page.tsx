'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
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
  Video, FileText, X, Percent, Layers, Settings2, Upload, ShieldCheck, MessageCircle
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
  visibleInChatbot: boolean;
  // Nuevos campos Fase 1
  customFieldValues: CustomFieldValues | null;
  categorias: string[];
  etiquetas: string[];
  metadata: Record<string, any> | null;
  media: MediaData | null;
  pricing: PricingData | null;
  isManufactured: boolean;
  costOfAcquisition: number;
  integrityHash: string | null;
  inventoryConfig: {
    minStock: number;
    reorderPoint: number;
    valuationMethod: string;
    storageLocation: string | null;
  } | null;
  billOfMaterials: {
    laborCost: number;
    overheadCost: number;
    components: {
      componentId: string;
      quantityRequired: number;
      unit: string;
      component?: { nombre: string, sku: string };
    }[];
  } | null;
  contactId: string | null;
  ownerContact: {
    id: string;
    nombre: string;
    email: string;
    telefono: string;
  } | null;
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
  { value: 'servicio', label: 'Servicio', icon: Briefcase },
  { value: 'materia_prima', label: 'Materia Prima', icon: Package },
  { value: 'producto_terminado', label: 'Producto Terminado', icon: Layers },
  { value: 'insumo', label: 'Insumo/Consumible', icon: Tag },
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
    visibleInChatbot: false,
    isManufactured: false,
    costOfAcquisition: '',
  });

  // Estado para Inventario y Producción
  const [inventoryForm, setInventoryForm] = useState({
    minStock: '0',
    reorderPoint: '0',
    valuationMethod: 'AVERAGE_COST',
    storageLocation: '',
  });

  const [bomForm, setBomForm] = useState({
    laborCost: '0',
    overheadCost: '0',
    components: [] as any[],
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
  const [contacts, setContacts] = useState<Array<{id: string, nombre: string, email: string, telefono: string | null}>>([]);
  const [propietarioId, setPropietarioId] = useState<string>('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchItems();
    fetchTasas();
    fetchFieldDefinitions();
    fetchContacts();
  }, [filterTipo, filterActivo, filterCategoria, filterEtiqueta]);

  const fetchContacts = async () => {
    try {
      const res = await apiFetch('/api/contacts?limit=500');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || data || []);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const fetchFieldDefinitions = async () => {
    try {
      const res = await apiFetch('/api/catalogo/field-definitions');
      if (res.ok) {
        const data = await res.json();
        // Normalizar options: Prisma Json? puede devolver objeto en vez de array
        const normalized = (data.fieldDefinitions || []).map((f: any) => ({
          ...f,
          options: Array.isArray(f.options) ? f.options : []
        }));
        setFieldDefinitions(normalized);
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

      const res = await apiFetch(`/api/catalogo?${params.toString()}`);
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
      const res = await apiFetch('/api/configuracion/fiscal/tasas?activo=true');
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
    setPropietarioId('');
    setMetadata({});
    setInventoryForm({ minStock: '0', reorderPoint: '0', valuationMethod: 'AVERAGE_COST', storageLocation: '' });
    setBomForm({ laborCost: '0', overheadCost: '0', components: [] });
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
      visibleInChatbot: item.visibleInChatbot ?? false,
      isManufactured: item.isManufactured,
      costOfAcquisition: item.costOfAcquisition?.toString() || '',
    });
    // Cargar nuevos campos
    setCustomFieldValues(item.customFieldValues || {});
    setCategorias(item.categorias || []);
    setEtiquetas(item.etiquetas || []);
    setMedia(item.media || { imagenes: [] });
    // Pricing: merge con defaults para evitar undefined en campos anidados
    setPricing({
      ...{ tipo: 'unico', descuentos: [], impuestos: { iva: 0.21, incluido: false } },
      ...(item.pricing || {}),
      impuestos: {
        iva: 0.21,
        incluido: false,
        ...((item.pricing as any)?.impuestos || {})
      }
    });
    setMetadata(item.metadata || {});
    setPropietarioId(item.contactId || '');
    // Onboarding 2.0 / MRP
    if (item.inventoryConfig) {
      setInventoryForm({
        minStock: item.inventoryConfig.minStock.toString(),
        reorderPoint: item.inventoryConfig.reorderPoint.toString(),
        valuationMethod: item.inventoryConfig.valuationMethod,
        storageLocation: item.inventoryConfig.storageLocation || '',
      });
    } else {
      setInventoryForm({ minStock: '0', reorderPoint: '0', valuationMethod: 'AVERAGE_COST', storageLocation: '' });
    }

    if (item.billOfMaterials) {
      setBomForm({
        laborCost: item.billOfMaterials.laborCost.toString(),
        overheadCost: item.billOfMaterials.overheadCost.toString(),
        components: item.billOfMaterials.components || [],
      });
    } else {
      setBomForm({ laborCost: '0', overheadCost: '0', components: [] });
    }

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
      visibleInChatbot: false,
      isManufactured: false,
      costOfAcquisition: '',
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
        // Onboarding 2.0 / MRP
        visibleInChatbot: form.visibleInChatbot,
        isManufactured: form.isManufactured,
        costOfAcquisition: parseFloat(form.costOfAcquisition || '0'),
        inventoryConfig: {
          minStock: parseFloat(inventoryForm.minStock),
          reorderPoint: parseFloat(inventoryForm.reorderPoint),
          valuationMethod: inventoryForm.valuationMethod,
          storageLocation: inventoryForm.storageLocation || null,
        },
        contactId: propietarioId || null,
        bom: form.isManufactured ? {
          laborCost: parseFloat(bomForm.laborCost),
          overheadCost: parseFloat(bomForm.overheadCost),
          components: bomForm.components.map((c: any) => ({
            componentId: c.componentId,
            quantityRequired: parseFloat(c.quantityRequired),
            unit: c.unit || 'unit'
          }))
        } : null
      };

      const res = await apiFetch(url, {
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
      const res = await apiFetch(`/api/catalogo/${item.id}`, { method: 'DELETE' });
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
                  <TableHead>Propietario</TableHead>
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
                        {item.ownerContact ? (
                          <span className="text-sm">{item.ownerContact.nombre}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
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
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="basico" className="text-[10px] uppercase font-bold">Básico</TabsTrigger>
              <TabsTrigger value="campos" className="text-[10px] uppercase font-bold">Campos</TabsTrigger>
              <TabsTrigger value="logistica" className="text-[10px] uppercase font-bold">Logística</TabsTrigger>
              <TabsTrigger value="ingenieria" className="text-[10px] uppercase font-bold" disabled={!form.isManufactured}>Ingeniería</TabsTrigger>
              <TabsTrigger value="categorias" className="text-[10px] uppercase font-bold">Tags</TabsTrigger>
              <TabsTrigger value="media" className="text-[10px] uppercase font-bold">Media</TabsTrigger>
              <TabsTrigger value="precios" className="text-[10px] uppercase font-bold">Precios</TabsTrigger>
            </TabsList>

            {/* Tab Básico */}
            <TabsContent value="basico" className="space-y-4 mt-4 animate-in fade-in duration-300">
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

                <div className="flex flex-col gap-4">
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      checked={form.isManufactured}
                      onCheckedChange={(v) => setForm({ ...form, isManufactured: v })}
                    />
                    <Label className="font-bold text-primary">Se puede fabricar (Habilitar BoM)</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={form.activo}
                      onCheckedChange={(v) => setForm({ ...form, activo: v })}
                    />
                    <Label>Activo</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={form.visibleInChatbot}
                      onCheckedChange={(v) => setForm({ ...form, visibleInChatbot: v })}
                    />
                    <Label className="flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5 text-violet-500" />
                      Visible en chatbot
                    </Label>
                  </div>
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

                <div className="col-span-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Descripción detallada para documentos"
                    rows={3}
                  />
                </div>

                {form.tipo === 'inmueble' && (
                  <div className="col-span-2">
                    <Label>👤 Propietario / Vendedor</Label>
                    <Select value={propietarioId} onValueChange={setPropietarioId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar propietario..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Sin propietario</SelectItem>
                        {contacts.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre}{c.email ? ` — ${c.email}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab Logística */}
            <TabsContent value="logistica" className="space-y-4 mt-4 animate-in fade-in duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stock Mínimo (Alerta IA)</Label>
                  <Input
                    type="number"
                    value={inventoryForm.minStock}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, minStock: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Punto de Reorden</Label>
                  <Input
                    type="number"
                    value={inventoryForm.reorderPoint}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, reorderPoint: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Método de Valoración</Label>
                  <Select value={inventoryForm.valuationMethod} onValueChange={(v) => setInventoryForm({ ...inventoryForm, valuationMethod: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AVERAGE_COST">Costo Promedio (AVG)</SelectItem>
                      <SelectItem value="FIFO">Primero en entrar - Primero en salir (FIFO)</SelectItem>
                      <SelectItem value="LIFO">Último en entrar - Primero en salir (LIFO)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ubicación (Almacén/Estante)</Label>
                  <Input
                    value={inventoryForm.storageLocation}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, storageLocation: e.target.value })}
                    placeholder="Ejem: Pasillo A, Estante 4"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Tab Ingeniería (BoM) */}
            <TabsContent value="ingenieria" className="space-y-4 mt-4 animate-in fade-in duration-300">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs uppercase font-bold text-slate-500">Costo Mano de Obra</Label>
                            <Input
                                type="number"
                                value={bomForm.laborCost}
                                onChange={(e) => setBomForm({ ...bomForm, laborCost: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label className="text-xs uppercase font-bold text-slate-500">Costos Indirectos (Overhead)</Label>
                            <Input
                                type="number"
                                value={bomForm.overheadCost}
                                onChange={(e) => setBomForm({ ...bomForm, overheadCost: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="font-bold">Componentes / Receta</Label>
                        <Button variant="outline" size="sm" onClick={() => setBomForm({
                            ...bomForm,
                            components: [...bomForm.components, { componentId: '', quantityRequired: '1', unit: 'unit' }]
                        })}>
                            <Plus className="h-3 w-3 mr-1" /> Añadir Componente
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {bomForm.components.map((comp: any, idx: number) => (
                            <div key={idx} className="flex gap-2 items-end bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                <div className="flex-1">
                                    <Label className="text-[10px] uppercase font-bold">Item del Catálogo</Label>
                                    <Select value={comp.componentId} onValueChange={(v) => {
                                        const updated = [...bomForm.components];
                                        updated[idx].componentId = v;
                                        setBomForm({ ...bomForm, components: updated });
                                    }}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Seleccionar material..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {items.filter(i => i.id !== editing?.id).map(i => (
                                                <SelectItem key={i.id} value={i.id}>{i.sku ? `[${i.sku}] ` : ''}{i.nombre}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-24">
                                    <Label className="text-[10px] uppercase font-bold">Cant.</Label>
                                    <Input
                                        className="h-9"
                                        type="number"
                                        value={comp.quantityRequired}
                                        onChange={(e) => {
                                            const updated = [...bomForm.components];
                                            updated[idx].quantityRequired = e.target.value;
                                            setBomForm({ ...bomForm, components: updated });
                                        }}
                                    />
                                </div>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500" onClick={() => {
                                    setBomForm({ ...bomForm, components: bomForm.components.filter((_: any, i: number) => i !== idx) });
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </TabsContent>

            {/* Tab Campos Personalizados */}
            <TabsContent value="campos" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Campos Personalizados</h4>
                <Button variant="ghost" size="sm" className="h-8 text-xs underline" onClick={() => setActiveTab('basico')}>
                  Configurar campos en Ajustes
                </Button>
              </div>
              
              {fieldDefinitions.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed">
                  <p className="text-sm text-muted-foreground">No hay campos personalizados definidos para el tipo {form.tipo}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {fieldDefinitions.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-rose-500">*</span>}
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
                            {field.options.map((opt: any) => (
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
                    <p className="text-sm text-muted-foreground">Organiza jerárquicamente</p>
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
                      <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => removeCategoria(cat)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Etiquetas</h4>
                    <p className="text-sm text-muted-foreground">Tags para filtrado rápido</p>
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
                      <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => removeEtiqueta(tag)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
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
                </div>
              </div>
            </TabsContent>

            {/* Tab Media */}
            <TabsContent value="media" className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium mb-3">Galería Multimedia</h4>
                <div className="space-y-4">
                  <div>
                    <Label className="flex items-center gap-2 mb-3">
                      <ImageIcon className="h-4 w-4" /> Imágenes del producto/servicio
                    </Label>
                    <ImageUploader
                      images={media.imagenes || []}
                      onChange={(newImages: any) => setMedia({ ...media, imagenes: newImages })}
                      maxImages={10}
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
                </div>
              </div>
            </TabsContent>

            {/* Tab Precios */}
            <TabsContent value="precios" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-slate-50/50">
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <Label>Precio de Venta Base *</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={form.precioBase}
                          onChange={(e) => setForm({ ...form, precioBase: e.target.value })}
                          className="font-bold text-lg"
                        />
                        <span className="font-bold">{form.moneda}</span>
                      </div>
                    </div>
                    
                    <div>
                      <Label>Costo de Adquisición / Producción</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={form.costOfAcquisition}
                          onChange={(e) => setForm({ ...form, costOfAcquisition: e.target.value })}
                          placeholder="0.00"
                        />
                        <span className="text-muted-foreground">{form.moneda}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Utilizado para el cálculo de margen neto por la IA.
                      </p>
                    </div>

                    {editing?.integrityHash && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            <span className="text-[10px] uppercase font-bold text-emerald-700">Integridad Criptográfica Verificada</span>
                        </div>
                    )}
                  </CardContent>
                </Card>

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
                      <Label>Impuestos Flexibles</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] text-muted-foreground font-semibold">Tipo de IVA</Label>
                        <Select
                          value={String(Math.round(pricing.impuestos.iva * 100))}
                          onValueChange={(v) => setPricing({
                            ...pricing,
                            impuestos: { ...pricing.impuestos, iva: Number(v) / 100 }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="21">21% (General)</SelectItem>
                            <SelectItem value="10">10% (Reducido)</SelectItem>
                            <SelectItem value="4">4% (Superreducido)</SelectItem>
                            <SelectItem value="0">0% (Exento)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 pt-6">
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
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-bold">Descuentos por Volumen</Label>
                  <Button variant="outline" size="sm" onClick={addDiscount}>
                    <Plus className="h-4 w-4 mr-1" /> Añadir Rango
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
                            <Input
                              type="number"
                              value={desc.min || ''}
                              onChange={(e) => updateDiscount(index, { min: parseInt(e.target.value) || 0 })}
                              placeholder="Mínimo Unidades"
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Input
                              type="number"
                              value={desc.descuento}
                              onChange={(e) => updateDiscount(index, { descuento: parseFloat(e.target.value) || 0 })}
                              placeholder="Descuento %"
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
