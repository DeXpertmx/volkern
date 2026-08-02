'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Upload,
  LayoutGrid,
  List,
  Download,
  Loader2,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { PolizaTable } from '@/components/insurance/PolizaTable';
import { PolizaCard } from '@/components/insurance/PolizaCard';
import { PolizaForm } from '@/components/insurance/PolizaForm';

const ESTADOS = ['ACTIVA', 'PROXIMA_A_VENCER', 'VENCIDA', 'CANCELADA', 'EN_TRAMITE'];
const RAMOS = [
  'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS',
  'EMPRESARIAL', 'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE',
  'AHORRO', 'JUBILACION', 'OTROS',
];

interface Poliza {
  id: string;
  numeroPoliza: string;
  estado: string;
  ramo?: string;
  fechaVencimiento: string;
  fechaInicio: string;
  primaAnual: number | null;
  sumaAsegurada: number | null;
  moneda: string;
  formaPago: string;
  comisionPct: number | null;
  descripcion: string | null;
  notas: string | null;
  cliente: { id: string; nombre: string };
  aseguradora: { id: string; nombre: string };
  productoSeguro: { id: string; nombre: string; ramo: string };
}

export default function PolizasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [ramoFilter, setRamoFilter] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showFilters, setShowFilters] = useState(false);

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPoliza, setEditingPoliza] = useState<Poliza | null>(null);
  const [saving, setSaving] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    clienteId: '',
    aseguradoraId: '',
    productoSeguroId: '',
    numeroPoliza: '',
    descripcion: '',
    sumaAsegurada: '',
    primaAnual: '',
    formaPago: 'ANUAL',
    moneda: 'EUR',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaVencimiento: '',
    comisionPct: '',
    notas: '',
  });

  // Dropdown data
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [aseguradoras, setAseguradoras] = useState<{ id: string; nombre: string }[]>([]);
  const [productos, setProductos] = useState<{ id: string; nombre: string; ramo: string }[]>([]);
  const [productosFiltrados, setProductosFiltrados] = useState<{ id: string; nombre: string; ramo: string }[]>([]);

  // Check for query params on mount
  useEffect(() => {
    const nueva = searchParams.get('nueva');
    const importar = searchParams.get('importar');
    if (nueva === 'true') {
      loadDropdowns();
      setIsFormOpen(true);
    }
    if (importar === 'true') {
      setIsImportOpen(true);
    }
  }, [searchParams]);

  const loadPolizas = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limite', '12');
      if (search) params.set('search', search);
      if (estadoFilter) params.set('estado', estadoFilter);
      if (ramoFilter) params.set('ramo', ramoFilter);

      const res = await apiFetch(`/api/insurance/polizas?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setPolizas(data.polizas || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        toast.error(data.error || 'Error al cargar pólizas');
      }
    } catch (error) {
      console.error('Error cargando pólizas:', error);
      toast.error('Error al cargar pólizas');
    } finally {
      setLoading(false);
    }
  }, [page, search, estadoFilter, ramoFilter]);

  useEffect(() => {
    loadPolizas();
  }, [loadPolizas]);

  const loadDropdowns = async () => {
    try {
      const [clientesRes, asegRes, prodRes] = await Promise.all([
        apiFetch('/api/contacts?tipo=person&limite=100'),
        apiFetch('/api/insurance/aseguradoras'),
        apiFetch('/api/insurance/productos'),
      ]);
      if (clientesRes.ok) {
        const data = await clientesRes.json();
        setClientes(Array.isArray(data) ? data : data.contacts || []);
      }
      if (asegRes.ok) {
        const data = await asegRes.json();
        setAseguradoras(data.aseguradoras || []);
      }
      if (prodRes.ok) {
        const data = await prodRes.json();
        // La API devuelve { productos: [...] } (y antes un array plano): soportar ambos
        const list = Array.isArray(data) ? data : data.productos || [];
        setProductos(list);
        setProductosFiltrados(list);
      }
    } catch (error) {
      console.error('Error cargando dropdowns:', error);
    }
  };

  const handleNewPoliza = () => {
    setEditingPoliza(null);
    resetForm();
    loadDropdowns();
    setIsFormOpen(true);
  };

  const handleEditPoliza = (poliza: Poliza) => {
    setEditingPoliza(poliza);
    setFormData({
      clienteId: poliza.cliente.id,
      aseguradoraId: poliza.aseguradora.id,
      productoSeguroId: poliza.productoSeguro.id,
      numeroPoliza: poliza.numeroPoliza,
      descripcion: poliza.descripcion || '',
      sumaAsegurada: poliza.sumaAsegurada ? String(poliza.sumaAsegurada) : '',
      primaAnual: poliza.primaAnual ? String(poliza.primaAnual) : '',
      formaPago: poliza.formaPago || 'ANUAL',
      moneda: poliza.moneda || 'EUR',
      fechaInicio: poliza.fechaInicio.split('T')[0],
      fechaVencimiento: poliza.fechaVencimiento.split('T')[0],
      comisionPct: poliza.comisionPct ? String(poliza.comisionPct) : '',
      notas: poliza.notas || '',
    });
    loadDropdowns();
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormData({
      clienteId: '',
      aseguradoraId: '',
      productoSeguroId: '',
      numeroPoliza: '',
      descripcion: '',
      sumaAsegurada: '',
      primaAnual: '',
      formaPago: 'ANUAL',
      moneda: 'EUR',
      fechaInicio: new Date().toISOString().split('T')[0],
      fechaVencimiento: '',
      comisionPct: '',
      notas: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clienteId || !formData.aseguradoraId || !formData.productoSeguroId || !formData.numeroPoliza) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    try {
      setSaving(true);
      const method = editingPoliza ? 'PATCH' : 'POST';
      const url = editingPoliza
        ? `/api/insurance/polizas/${editingPoliza.id}`
        : '/api/insurance/polizas';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(editingPoliza ? 'Póliza actualizada' : 'Póliza creada');
        setIsFormOpen(false);
        resetForm();
        loadPolizas();
      } else {
        toast.error(data.error || 'Error al guardar póliza');
      }
    } catch (error) {
      console.error('Error guardando póliza:', error);
      toast.error('Error al guardar póliza');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await apiFetch('/api/insurance/importar', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Importación completada: ${data.importadas || 0} pólizas importadas`);
        setIsImportOpen(false);
        loadPolizas();
      } else {
        toast.error(data.error || 'Error al importar');
      }
    } catch (error) {
      console.error('Error importando:', error);
      toast.error('Error al importar');
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  if (loading && polizas.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando pólizas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nº póliza, cliente, aseguradora..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className={showFilters ? 'bg-muted' : ''}
              >
                <Filter className="w-4 h-4" />
              </Button>
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('table')}
                  className="rounded-r-none"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'cards' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('cards')}
                  className="rounded-l-none"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </Button>
              <Button onClick={handleNewPoliza}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva Póliza
              </Button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="flex gap-3 mt-3 p-3 bg-muted/50 rounded-lg">
              <Select value={estadoFilter || 'TODOS'} onValueChange={v => { setEstadoFilter(v === 'TODOS' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los estados</SelectItem>
                  {ESTADOS.map(e => (
                    <SelectItem key={e} value={e}>{e.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ramoFilter || 'TODOS'} onValueChange={v => { setRamoFilter(v === 'TODOS' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Ramo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los ramos</SelectItem>
                  {RAMOS.map(r => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(search || estadoFilter || ramoFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(''); setEstadoFilter(''); setRamoFilter(''); setPage(1); }}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {polizas.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No hay pólizas</h3>
              <p className="text-muted-foreground mb-4">
                {search || estadoFilter || ramoFilter
                  ? 'No se encontraron pólizas con los filtros seleccionados'
                  : 'Comienza importando tu cartera o creando tu primera póliza'}
              </p>
              {!search && !estadoFilter && !ramoFilter && (
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Importar Excel
                  </Button>
                  <Button onClick={handleNewPoliza}>
                    <Plus className="h-4 w-4 mr-2" /> Nueva Póliza
                  </Button>
                </div>
              )}
            </div>
          ) : viewMode === 'cards' ? (
            /* Card View */
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {polizas.map(p => (
                <PolizaCard
                  key={p.id}
                  poliza={p}
                  onClick={() => handleEditPoliza(p)}
                />
              ))}
            </div>
          ) : (
            /* Table View */
            <PolizaTable
              polizas={polizas}
              total={total}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              onSearch={v => { setSearch(v); setPage(1); }}
              onFilterChange={f => {
                if (f.estado !== undefined) setEstadoFilter(f.estado || '');
                if (f.ramo !== undefined) setRamoFilter(f.ramo || '');
                setPage(1);
              }}
              onNewPoliza={handleNewPoliza}
              onImport={() => setIsImportOpen(true)}
              onRowClick={id => {
                const p = polizas.find(px => px.id === id);
                if (p) handleEditPoliza(p);
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPoliza ? 'Editar Póliza' : 'Nueva Póliza'}</DialogTitle>
            <DialogDescription>
              {editingPoliza
                ? `Editando póliza ${editingPoliza.numeroPoliza}`
                : 'Registra una nueva póliza en la cartera'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cliente */}
            <div className="space-y-2">
              <Label htmlFor="clienteId">Cliente *</Label>
              <Select value={formData.clienteId} onValueChange={v => { setFormData(prev => ({ ...prev, clienteId: v })); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Aseguradora */}
              <div className="space-y-2">
                <Label htmlFor="aseguradoraId">Aseguradora *</Label>
                <Select value={formData.aseguradoraId} onValueChange={v => setFormData(prev => ({ ...prev, aseguradoraId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {aseguradoras.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Producto */}
              <div className="space-y-2">
                <Label htmlFor="productoSeguroId">Producto *</Label>
                <Select value={formData.productoSeguroId} onValueChange={v => setFormData(prev => ({ ...prev, productoSeguroId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productosFiltrados.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre} ({p.ramo?.replace('_', ' ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Nº Póliza */}
              <div className="space-y-2">
                <Label htmlFor="numeroPoliza">Número de Póliza *</Label>
                <Input
                  id="numeroPoliza"
                  value={formData.numeroPoliza}
                  onChange={e => setFormData(prev => ({ ...prev, numeroPoliza: e.target.value }))}
                  placeholder="P-2026-00142"
                  required
                />
              </div>

              {/* Prima Anual */}
              <div className="space-y-2">
                <Label htmlFor="primaAnual">Prima Anual</Label>
                <Input
                  id="primaAnual"
                  type="number"
                  value={formData.primaAnual}
                  onChange={e => setFormData(prev => ({ ...prev, primaAnual: e.target.value }))}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              {/* Suma Asegurada */}
              <div className="space-y-2">
                <Label htmlFor="sumaAsegurada">Suma Asegurada</Label>
                <Input
                  id="sumaAsegurada"
                  type="number"
                  value={formData.sumaAsegurada}
                  onChange={e => setFormData(prev => ({ ...prev, sumaAsegurada: e.target.value }))}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              {/* Forma de Pago */}
              <div className="space-y-2">
                <Label htmlFor="formaPago">Forma de Pago</Label>
                <Select value={formData.formaPago} onValueChange={v => setFormData(prev => ({ ...prev, formaPago: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANUAL">Anual</SelectItem>
                    <SelectItem value="SEMESTRAL">Semestral</SelectItem>
                    <SelectItem value="TRIMESTRAL">Trimestral</SelectItem>
                    <SelectItem value="MENSUAL">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Moneda */}
              <div className="space-y-2">
                <Label htmlFor="moneda">Moneda</Label>
                <Select value={formData.moneda} onValueChange={v => setFormData(prev => ({ ...prev, moneda: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="MXN">MXN ($)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fechas */}
              <div className="space-y-2">
                <Label htmlFor="fechaInicio">Fecha de Inicio *</Label>
                <Input
                  id="fechaInicio"
                  type="date"
                  value={formData.fechaInicio}
                  onChange={e => setFormData(prev => ({ ...prev, fechaInicio: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fechaVencimiento">Fecha de Vencimiento *</Label>
                <Input
                  id="fechaVencimiento"
                  type="date"
                  value={formData.fechaVencimiento}
                  onChange={e => setFormData(prev => ({ ...prev, fechaVencimiento: e.target.value }))}
                  required
                />
              </div>

              {/* Comisión */}
              <div className="space-y-2">
                <Label htmlFor="comisionPct">Comisión (%)</Label>
                <Input
                  id="comisionPct"
                  type="number"
                  value={formData.comisionPct}
                  onChange={e => setFormData(prev => ({ ...prev, comisionPct: e.target.value }))}
                  placeholder="15"
                  step="0.1"
                />
              </div>
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={e => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Detalles adicionales de la póliza..."
                rows={2}
              />
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notas">Notas internas</Label>
              <Textarea
                id="notas"
                value={formData.notas}
                onChange={e => setFormData(prev => ({ ...prev, notas: e.target.value }))}
                placeholder="Notas para el agente..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : editingPoliza ? 'Actualizar Póliza' : 'Crear Póliza'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Cartera</DialogTitle>
            <DialogDescription>
              Sube un archivo CSV con tus pólizas. El sistema detectará automáticamente clientes, aseguradoras y productos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                Arrastra tu archivo CSV aquí o haz clic para seleccionar
              </p>
              <label className="cursor-pointer">
                <Button variant="outline" disabled={importing}>
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    'Seleccionar archivo'
                  )}
                </Button>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleImport}
                  disabled={importing}
                />
              </label>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Columnas esperadas:</strong> cliente, aseguradora, producto, numeroPoliza, ramo, primaAnual, fechaVencimiento</p>
              <p>Formatos soportados: CSV (coma o punto y coma), Excel (.xlsx, .xls)</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
