'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Search, Upload, Package, Edit, Trash2, Filter } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import { ImportEntityWizard } from '@/components/insurance/ImportEntityWizard';
import {
  buildTemplateProductos,
  TEMPLATE_PRODUCTOS_FILENAME,
} from '@/lib/insurance/csv-template';

interface Aseguradora {
  id: string;
  nombre: string;
}

interface ProductoSeguro {
  id: string;
  nombre: string;
  ramo: string;
  subramo: string | null;
  descripcion: string | null;
  primaReferencia: number | null;
  comisionPct: number | null;
  activo: boolean;
  aseguradora: { id: string; nombre: string };
  _count: { polizas: number };
  createdAt: string;
}

const RAMO_LABELS: Record<string, string> = {
  AUTO: 'Auto',
  HOGAR: 'Hogar',
  VIDA: 'Vida',
  SALUD: 'Salud',
  GASTOS_MEDICOS: 'Gastos médicos',
  EMPRESARIAL: 'Empresarial',
  RESPONSABILIDAD_CIVIL: 'Responsabilidad civil',
  INCENDIO: 'Incendio',
  TRANSPORTE: 'Transporte',
  AHORRO: 'Ahorro',
  JUBILACION: 'Jubilación',
  OTROS: 'Otros',
};

/**
 * Columnas canónicas que el wizard muestra en el paso 2 (mapeo).
 * El orden y los labels están alineados con TEMPLATE_PRODUCTOS_COLUMNS
 * y con PRODUCTOS_COLUMN_SYNONYMS para que el corredor las reconozca.
 */
const PRODUCTOS_CANONICOS_UI: Array<{ key: string; label: string; required: boolean }> = [
  { key: 'nombre',                label: 'Nombre del producto',  required: true  },
  { key: 'aseguradoraNombre',    label: 'Aseguradora',          required: true  },
  { key: 'ramo',                  label: 'Ramo',                required: false },
  { key: 'subramo',               label: 'Subramo',             required: false },
  { key: 'primaReferencia',       label: 'Prima referencia',    required: false },
  { key: 'comisionPorDefecto',    label: 'Comisión %',          required: false },
  { key: 'descripcion',           label: 'Descripción',         required: false },
  { key: 'activo',                label: 'Activo',              required: false },
  { key: 'notas',                 label: 'Notas',               required: false },
];

export default function ProductosPage() {
  const [productos, setProductos] = useState<ProductoSeguro[]>([]);
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ramoFilter, setRamoFilter] = useState<string>('all');
  const [aseguradoraFilter, setAseguradoraFilter] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductoSeguro | null>(null);
  const [saving, setSaving] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Form state
  const [aseguradoraId, setAseguradoraId] = useState('');
  const [nombre, setNombre] = useState('');
  const [ramo, setRamo] = useState('OTROS');
  const [subramo, setSubramo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [primaReferencia, setPrimaReferencia] = useState('');
  const [comisionPct, setComisionPct] = useState('');
  // La prima de referencia no trae divisa propia, así que se escribe con la del
  // tenant en vez de dar por hecho la convención de pesos.
  const monedaTenant = useMonedaTenant();

  useEffect(() => {
    loadProductos();
    loadAseguradoras();
  }, []);

  async function loadProductos() {
    try {
      setLoading(true);
      const res = await apiFetch('/api/insurance/productos');
      const data = await res.json();
      // Defensivo contra shape heterogéneo (pre-fix histórico de shape bugs).
      const items = Array.isArray(data) ? data : data?.productos ?? [];
      setProductos(items);
    } catch (err) {
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }

  async function loadAseguradoras() {
    try {
      const res = await apiFetch('/api/insurance/aseguradoras');
      const data = await res.json();
      const items = Array.isArray(data) ? data : data?.aseguradoras ?? [];
      setAseguradoras(items);
    } catch {
      // Silencioso: el form simplemente listará vacío.
    }
  }

  function resetForm() {
    setAseguradoraId('');
    setNombre('');
    setRamo('OTROS');
    setSubramo('');
    setDescripcion('');
    setPrimaReferencia('');
    setComisionPct('');
    setEditing(null);
  }

  function handleNew() {
    resetForm();
    setIsFormOpen(true);
  }

  function handleEdit(p: ProductoSeguro) {
    setEditing(p);
    setAseguradoraId(p.aseguradora.id);
    setNombre(p.nombre);
    setRamo(p.ramo);
    setSubramo(p.subramo ?? '');
    setDescripcion(p.descripcion ?? '');
    setPrimaReferencia(p.primaReferencia?.toString() ?? '');
    setComisionPct(p.comisionPct?.toString() ?? '');
    setIsFormOpen(true);
  }

  async function handleDelete(p: ProductoSeguro) {
    if (!confirm(`¿Eliminar el producto "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await apiFetch(`/api/insurance/productos/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar');
      }
      toast.success('Producto eliminado');
      loadProductos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aseguradoraId || !nombre || !ramo) {
      toast.error('Aseguradora, nombre y ramo son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        aseguradoraId,
        nombre,
        ramo,
        subramo: subramo || null,
        descripcion: descripcion || null,
        primaReferencia: primaReferencia || null,
        comisionPct: comisionPct || null,
      };
      const url = editing ? `/api/insurance/productos/${editing.id}` : '/api/insurance/productos';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      toast.success(editing ? 'Producto actualizado' : 'Producto creado');
      setIsFormOpen(false);
      resetForm();
      loadProductos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const filtered = productos.filter(p => {
    if (search && !`${p.nombre} ${p.aseguradora.nombre} ${p.descripcion ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (ramoFilter !== 'all' && p.ramo !== ramoFilter) return false;
    if (aseguradoraFilter !== 'all' && p.aseguradora.id !== aseguradoraFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={ramoFilter} onValueChange={setRamoFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Ramo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ramos</SelectItem>
                  {Object.entries(RAMO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={aseguradoraFilter} onValueChange={setAseguradoraFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Aseguradora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las aseguradoras</SelectItem>
                  {aseguradoras.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </Button>
              <Button onClick={handleNew}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Producto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Cargando productos…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No hay productos</h3>
              <p className="text-muted-foreground mb-4">
                {search || ramoFilter !== 'all' || aseguradoraFilter !== 'all'
                  ? 'No se encontraron resultados con el filtro actual'
                  : 'Registra tu primer producto o importa un CSV'}
              </p>
              {!search && ramoFilter === 'all' && aseguradoraFilter === 'all' && (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar CSV
                  </Button>
                  <Button onClick={handleNew}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Producto
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map(p => (
                <Card key={p.id} className="hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Package className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{p.nombre}</CardTitle>
                          <p className="text-xs text-muted-foreground truncate">{p.aseguradora.nombre}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} title="Editar">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} title="Eliminar" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <Badge variant="secondary">{RAMO_LABELS[p.ramo] ?? p.ramo}</Badge>
                      {p.subramo && <Badge variant="outline">{p.subramo}</Badge>}
                      <Badge variant={p.activo ? 'default' : 'outline'} className={p.activo ? 'bg-green-100 text-green-800' : ''}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                    {p.descripcion && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{p.descripcion}</p>
                    )}
                    <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                      {p.primaReferencia !== null && (
                        <span>Prima ref: <strong>{formatearImporte(p.primaReferencia, monedaTenant)}</strong></span>
                      )}
                      {p.comisionPct !== null && <span>Comisión: <strong>{p.comisionPct}%</strong></span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Nueva/Editar Producto */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>
              Define el producto que será ofrecido a tus clientes bajo una aseguradora.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="aseguradoraId">Aseguradora *</Label>
              <Select value={aseguradoraId} onValueChange={setAseguradoraId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una aseguradora" />
                </SelectTrigger>
                <SelectContent>
                  {aseguradoras.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nombre">Nombre del producto *</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Auto Plus Premium"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ramo">Ramo *</Label>
                <Select value={ramo} onValueChange={setRamo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RAMO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="subramo">Subramo</Label>
                <Input
                  id="subramo"
                  value={subramo}
                  onChange={e => setSubramo(e.target.value)}
                  placeholder="Cobertura amplia"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="primaReferencia">Prima referencia</Label>
                <Input
                  id="primaReferencia"
                  type="number"
                  step="0.01"
                  value={primaReferencia}
                  onChange={e => setPrimaReferencia(e.target.value)}
                  placeholder="8500"
                />
              </div>
              <div>
                <Label htmlFor="comisionPct">Comisión %</Label>
                <Input
                  id="comisionPct"
                  type="number"
                  step="0.01"
                  value={comisionPct}
                  onChange={e => setComisionPct(e.target.value)}
                  placeholder="15"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Cobertura todo riesgo con asistencia 24/7…"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Wizard de import compartido */}
      <ImportEntityWizard
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        endpoint="/api/insurance/productos/importar"
        canonicalColumns={PRODUCTOS_CANONICOS_UI}
        templateBuilder={buildTemplateProductos}
        templateFilename={TEMPLATE_PRODUCTOS_FILENAME}
        entityLabel="Productos"
        fileInputId="productos-wizard-file-input"
        requiredFieldsHint="Nombre del producto y nombre de la aseguradora son obligatorios; si la aseguradora no existe, se crea automáticamente."
        extraTips={[
          'Si tu CSV viene de Excel con acentos o delimitador ;, el paso Análisis detecta todo automáticamente.',
          'Los productos duplicados (mismo nombre bajo la misma aseguradora) se omiten sin sobreescribir los existentes.',
        ]}
        onCompleted={() => {
          loadProductos();
          loadAseguradoras();
        }}
      />
    </div>
  );
}
