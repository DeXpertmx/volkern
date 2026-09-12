'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { MONEDAS_SELECCIONABLES, monedaEfectiva } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Upload,
  List,
  FileDown,
  Loader2,
  X,
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
import {
  buildTemplatePolizas,
  descargarCsv,
  TEMPLATE_POLIZAS_FILENAME,
} from '@/lib/insurance/csv-template';
import {
  renderReportAsCsv,
  buildReportFilename,
  type ImportReport,
} from '@/lib/insurance/import-report';
import { PolizaCard } from '@/components/insurance/PolizaCard';
import { PolizaForm } from '@/components/insurance/PolizaForm';

// Wizard CSV: tipos y helpers
interface WizardMatch {
  canonical: string;
  matchedHeader: string | null;
  confidence: number;
  reason: string;
}
interface WizardAnalysis {
  fileName: string;
  delimiter: ',' | ';' | '\t';
  delimiterLabel: string;
  totalRows: number;
  columns: string[];
  preview: Record<string, string>[];
  mapeoSugerido: Record<string, string>;
  matches: WizardMatch[];
  autoMapAvailable: boolean;
}
type WizardStep = 'select' | 'analyzing' | 'mapping' | 'importing';

// Lista canónica de pólizas — ordenada y con etiquetas legibles para el wizard.
const CANONICALES_POLIZAS: Array<{ key: string; label: string; required: boolean }> = [
  { key: 'numeroPoliza', label: 'Número de Póliza', required: true },
  { key: 'clienteNombre', label: 'Nombre del Cliente', required: true },
  { key: 'aseguradoraNombre', label: 'Aseguradora', required: true },
  { key: 'fechaInicio', label: 'Fecha de Inicio', required: true },
  { key: 'fechaVencimiento', label: 'Fecha de Vencimiento', required: true },
  { key: 'clienteEmail', label: 'Email del Cliente', required: false },
  { key: 'clienteTelefono', label: 'Teléfono del Cliente', required: false },
  { key: 'productoSeguroNombre', label: 'Producto', required: false },
  { key: 'ramo', label: 'Ramo', required: false },
  { key: 'primaAnual', label: 'Prima Anual', required: false },
  { key: 'sumaAsegurada', label: 'Suma Asegurada', required: false },
  { key: 'moneda', label: 'Moneda', required: false },
  { key: 'formaPago', label: 'Forma de Pago', required: false },
  { key: 'comisionPct', label: 'Comisión (%)', required: false },
  { key: 'descripcion', label: 'Descripción', required: false },
  { key: 'notas', label: 'Notas', required: false },
];

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

/**
 * Estado inicial del formulario de póliza. La divisa por defecto es la del
 * tenant: estaba fija a 'EUR', así que una póliza nueva de un tenant con la
 * moneda en pesos nacía en euros.
 */
const formularioPoliza = (moneda: string) => ({
  clienteId: '',
  aseguradoraId: '',
  productoSeguroId: '',
  numeroPoliza: '',
  descripcion: '',
  sumaAsegurada: '',
  primaAnual: '',
  formaPago: 'ANUAL',
  moneda,
  fechaInicio: new Date().toISOString().split('T')[0],
  fechaVencimiento: '',
  comisionPct: '',
  notas: '',
});

export default function PolizasPage() {
  const monedaTenant = useMonedaTenant();
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
  const [formData, setFormData] = useState(() => formularioPoliza(''));

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
      moneda: monedaEfectiva([poliza.moneda], monedaTenant),
      fechaInicio: poliza.fechaInicio.split('T')[0],
      fechaVencimiento: poliza.fechaVencimiento.split('T')[0],
      comisionPct: poliza.comisionPct ? String(poliza.comisionPct) : '',
      notas: poliza.notas || '',
    });
    loadDropdowns();
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormData(formularioPoliza(monedaTenant));
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

  // ── Estado del wizard de import (3 pasos: select → mapping → import) ─────
  const [wizardStep, setWizardStep] = useState<WizardStep>('select');
  const [wizardAnalysis, setWizardAnalysis] = useState<WizardAnalysis | null>(null);
  // Mapeo editable: cada canónico -> header seleccionado por el usuario ('' = sin mapear).
  const [wizardMapping, setWizardMapping] = useState<Record<string, string>>({});
  // AbortController para cancelar una importación en curso durante el paso 4.
  const importAbortRef = useRef<AbortController | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWizardStep('analyzing');

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/insurance/importar', { method: 'PUT', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No pude analizar el archivo');

      const analysis = data as WizardAnalysis;
      setWizardAnalysis(analysis);
      // Inicializa el mapping editable con las sugerencias de confianza >= 0.6
      setWizardMapping({ ...analysis.mapeoSugerido });
      setWizardStep('mapping');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar el archivo');
      setWizardStep('select');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  /**
   * Dispara el import con el mapping confirmado por el usuario en el wizard.
   * Si requiere columnas sin mapear, muestra un toast y bloquea la acción.
   * Crea un AbortController para que el usuario pueda cancelar la importación
   * durante el paso 'importing' (ver `cancelarImport`).
   */
  const confirmarImportWizard = async () => {
    if (!wizardAnalysis) return;
    const faltantesRequeridos = CANONICALES_POLIZAS
      .filter(c => c.required && !wizardMapping[c.key])
      .map(c => c.label);
    if (faltantesRequeridos.length > 0) {
      toast.error(`Faltan columnas obligatorias: ${faltantesRequeridos.join(', ')}`);
      return;
    }
    setWizardStep('importing');
    importAbortRef.current = new AbortController();
    try {
      // Re-leemos el archivo desde el input (es donde vive el File que el
      // usuario acaba de seleccionar). Si el input se vació (caso raro),
      // abortamos de forma controlada.
      const inputEl = document.getElementById('wizard-file-input') as HTMLInputElement | null;
      const file2 = inputEl?.files?.[0];
      if (!file2) {
        toast.error('Vuelve a seleccionar el archivo para importar.');
        setWizardStep('mapping');
        return;
      }
      const fd = new FormData();
      fd.append('file', file2);
      // Enviamos sólo los canónicos que el usuario Mapeó (omitimos vacíos).
      const mappingLimpio: Record<string, string> = {};
      for (const [k, v] of Object.entries(wizardMapping)) {
        if (v && v.length > 0) mappingLimpio[k] = v;
      }
      fd.append('mapping', JSON.stringify(mappingLimpio));

      const res = await apiFetch(
        '/api/insurance/importar',
        { method: 'POST', body: fd, signal: importAbortRef.current.signal },
      );
      const data = await res.json();
      if (res.ok) {
        const report: ImportReport | undefined = data.report;
        if (report) mostrarResumenImportacion(report);
        else toast.success(`Importación completada: ${data.importadas || 0} pólizas importadas`);
        cerrarWizard();
        loadPolizas();
      } else {
        toast.error(data.error || 'Error al importar');
        setWizardStep('mapping');
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        // El usuario canceló. Algunas filas pueden haberse insertado en BD
        // antes de que llegara la señal de abort al servidor, por eso avisamos.
        toast.warning('Importación cancelada. Las pólizas que ya se habían guardado permanecen en tu cartera.', {
          duration: 8000,
          description: 'Puedes revisar la lista o reimportar el archivo corregido.',
        });
        setWizardStep('mapping');
      } else {
        console.error('Error importando:', error);
        toast.error('Error al importar');
        setWizardStep('mapping');
      }
    } finally {
      importAbortRef.current = null;
    }
  };

  /**
   * Aborta la importación en curso. Disparado por el botón 'Cancelar' del
   * paso 'importing'. Si no hay nada en vuelo, no-op.
   * @param parcialMsg - texto a mostrar si llegan filas parcialmente guardadas;
   *   requerido por si más adelante tenemos señales del servidor sobre el avance.
   */
  const cancelarImport = () => {
    if (importAbortRef.current) {
      importAbortRef.current.abort();
    }
  };

  const cerrarWizard = () => {
    // Si hay un import en curso, abortarlo antes de cerrar el modal.
    if (importAbortRef.current) {
      importAbortRef.current.abort();
      importAbortRef.current = null;
    }
    setIsImportOpen(false);
    setWizardStep('select');
    setWizardAnalysis(null);
    setWizardMapping({});
  };

  /**
   * Muestra el resultado estructurado de la importación en un toast:
   *   - Total / importadas / fallidas en una sola línea.
   *   - Si hubo errores, ofrece descargar el reporte completo (CSV multi-sección
   *     con errores por fila + entidades creadas) para que el broker pueda
   *     corregir su archivo y volver a importar.
   *   - Si se crearon nuevas aseguradoras, lo avisa (porque el broker suele
   *     querer revisarlas antes de la próxima importación).
   */
  const mostrarResumenImportacion = (report: ImportReport) => {
    const totalesPartes = [
      `${report.totalRows} procesadas`,
      `✅ ${report.importadas} importadas`,
    ];
    if (report.fallidas > 0) {
      totalesPartes.push(`⚠️ ${report.fallidas} con error`);
    }
    const detalle = totalesPartes.join(' · ');

    const subdetalle: string[] = [];
    if (report.creadas.clientes.length > 0) {
      const nuevos = report.creadas.clientes.filter(c => c.fueCreado).length;
      subdetalle.push(`${nuevos} cliente(s) creado(s)`);
    }
    if (report.creadas.aseguradoras.length > 0) {
      const nuevas = report.creadas.aseguradoras.filter(a => a.fueCreada).length;
      subdetalle.push(`${nuevas} aseguradora(s) creada(s)`);
    }
    if (report.creadas.productos.length > 0) {
      const nuevos = report.creadas.productos.filter(p => p.fueCreado).length;
      subdetalle.push(`${nuevos} producto(s) creado(s)`);
    }

    const opciones: Parameters<typeof toast.success>[1] = {
      duration: report.fallidas > 0 || report.creadas.clientes.length > 0 ? 10000 : 5000,
      description: subdetalle.length > 0 ? subdetalle.join(' · ') : undefined,
    };

    if (report.fallidas > 0) {
      opciones.action = {
        label: 'Descargar reporte',
        onClick: () => {
          descargarCsv(
            buildReportFilename(report.fileName),
            renderReportAsCsv(report),
          );
          toast.success('Reporte descargado');
        },
      };
    }

    toast.success(`Importación: ${detalle}`, opciones);
  };

  /**
   * Descarga la plantilla CSV de Pólizas usando el helper compartido
   * `lib/insurance/csv-template.ts`. Mantener sincronizado el listado de
   * columnas con la ruta /api/insurance/importar.
   */
  const descargarTemplate = () => {
    if (descargarCsv(TEMPLATE_POLIZAS_FILENAME, buildTemplatePolizas())) {
      toast.success('Template descargado');
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
      {/* Toolbar — la guarda del viewMode se hace con ternario explícito (no
          `&&`) para que el subtree nunca quede "medio montado". Solo se
          renderiza la toolbar nativa en cards; la vista table la trae
          PolizaTable internamente. Si ves dos toolbars apiladas es porque la
          versión desplegada es anterior a este fix. */}
      <Card>
        {viewMode === 'cards' ? (
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
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode('table')}
                  title="Cambiar a vista de tabla"
                >
                  <List className="w-4 h-4" />
                </Button>
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
              <div className="flex gap-3 mt-3 p-3 bg-muted/50 rounded-lg flex-wrap">
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
        ) : null}

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
              onSwitchToCards={() => setViewMode('cards')}
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
                    {MONEDAS_SELECCIONABLES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
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

      {/* Import Dialog — wizard de 3 pasos:
            1) 'select'    → drag & drop + botón descargar template
            2) 'analyzing' → PUT para detectar delimitador + sugerir mapping
            3) 'mapping'   → tabla editable: cada canónico → header + confianza
            4) 'importing' → POST con el mapping confirmado + toast resumen
          La UI nunca muestra dos toolbars porque PolizaTable (vista table)
          ya trae su propia barra. Esta vista card sólo muestra el contenido
          sin toolbar nativa. */}
      <Dialog open={isImportOpen} onOpenChange={(open) => open ? setIsImportOpen(true) : cerrarWizard()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {/* ── Stepper visible: 3 fases ─────────────────────────────────────── */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {(['select', 'analyzing', 'mapping'] as const).map((s, i) => {
              const active =
                s === wizardStep ||
                (s === 'select' && wizardStep === 'importing') ||
                (s === 'analyzing' && (wizardStep === 'mapping' || wizardStep === 'importing'));
              return (
                <React.Fragment key={s}>
                  <span className={`px-2 py-0.5 rounded-full ${active ? 'bg-sky-100 text-sky-700' : 'bg-muted'}`}>
                    {i + 1}. {s === 'select' ? 'Subir' : s === 'analyzing' ? 'Analizar' : 'Mapear'}
                  </span>
                  {i < 2 && <span>→</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* ── Paso 1: Selección de archivo ───────────────────────────────── */}
          {wizardStep === 'select' && (
            <>
              <DialogHeader>
                <DialogTitle>Importar Cartera</DialogTitle>
                <DialogDescription>
                  Sube tu archivo CSV. Detectamos automáticamente el delimitador y mapeamos las columnas.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Selecciona tu CSV. No necesitas renombrar columnas: detectaremos el delimitador
                    y te mostraremos el mapeo antes de importar.
                  </p>
                  <label htmlFor="wizard-file-input" className="cursor-pointer">
                    <Button variant="outline" asChild>
                      <span>Seleccionar archivo</span>
                    </Button>
                    <input
                      id="wizard-file-input"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleImport}
                    />
                  </label>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">¿No tienes un archivo listo?</p>
                    <Button variant="outline" size="sm" onClick={descargarTemplate}>
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      Descargar template
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Columnas mínimas:</strong> Número de póliza, Aseguradora, Nombre del cliente, Fecha de inicio, Fecha de vencimiento.</p>
                    <p>• El <strong>cliente</strong> se busca por nombre; si no existe, se crea automáticamente.</p>
                    <p>• La <strong>aseguradora</strong> y el <strong>producto</strong> también se crean si no existen.</p>
                    <p>• Aceptamos CSV con <strong>coma</strong>, <strong>punto y coma</strong> o <strong>tab</strong>. Fechas en <code className="bg-background px-1 rounded">YYYY-MM-DD</code>.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Paso 2: Analizando ──────────────────────────────────────────── */}
          {wizardStep === 'analyzing' && (
            <div className="py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-sky-500 mx-auto mb-4" />
              <DialogHeader className="items-center">
                <DialogTitle>Analizando archivo…</DialogTitle>
                <DialogDescription>
                  Detectando delimitador y proponiendo el mapeo de columnas.
                </DialogDescription>
              </DialogHeader>
            </div>
          )}

          {/* ── Paso 3: Mapeo editable ────────────────────────────────────── */}
          {wizardStep === 'mapping' && wizardAnalysis && (
            <>
              <DialogHeader>
                <DialogTitle>Confirma el mapeo de columnas</DialogTitle>
                <DialogDescription>
                  {wizardAnalysis.totalRows} filas · delimitador <strong>{wizardAnalysis.delimiterLabel}</strong> ·
                  columnas detectadas: {wizardAnalysis.columns.length}
                  {wizardAnalysis.autoMapAvailable
                    ? ' · sugerencia automática disponible'
                    : ' · requiere tu confirmación'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-2">
                  {CANONICALES_POLIZAS.map((c) => {
                    const match = wizardAnalysis.matches.find(m => m.canonical === c.key);
                    const sugerido = match?.matchedHeader ?? wizardMapping[c.key] ?? '';
                    const confidence = match?.confidence ?? 0;
                    const confidenceColor =
                      confidence >= 0.85 ? 'bg-green-100 text-green-700' :
                      confidence >= 0.6 ? 'bg-amber-100 text-amber-700' :
                      confidence > 0 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground';
                    return (
                      <div key={c.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{c.label}</span>
                            {c.required && <span className="text-red-500 text-xs">*</span>}
                          </div>
                          {match?.reason && (
                            <p className="text-xs text-muted-foreground truncate">
                              <code className="bg-background px-1 rounded">{sugerido || '—'}</code>
                              {match.reason !== 'Exacto' && match.reason !== 'Sin match' && (
                                <span className="ml-2">· {match.reason}</span>
                              )}
                            </p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${confidenceColor}`}>
                          {confidence ? `${Math.round(confidence * 100)}%` : 'manual'}
                        </span>
                        <Select
                          value={wizardMapping[c.key] ?? ''}
                          onValueChange={(v) => setWizardMapping(prev => {
                            const next = { ...prev };
                            if (v === '') delete next[c.key];
                            else {
                              // Liberamos el header previo de cualquier otro canónico.
                              for (const k of Object.keys(next)) {
                                if (next[k] === v) delete next[k];
                              }
                              next[c.key] = v;
                            }
                            return next;
                          })}
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue placeholder="(sin mapear)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">(sin mapear)</SelectItem>
                            {wizardAnalysis.columns.map((col) => (
                              <SelectItem key={col} value={col}>
                                {col}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {/* Preview de las primeras filas */}
                <details className="rounded-lg bg-muted/30 p-3 text-xs">
                  <summary className="cursor-pointer font-medium text-foreground">
                    Vista previa · {Math.min(5, wizardAnalysis.preview.length)} de {wizardAnalysis.totalRows} filas
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          {wizardAnalysis.columns.map(col => (
                            <th key={col} className="p-1 font-medium">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wizardAnalysis.preview.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t border-border/50">
                            {wizardAnalysis.columns.map(col => (
                              <td key={col} className="p-1 whitespace-nowrap">{row[col] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={cerrarWizard}>Cancelar</Button>
                <Button variant="ghost" onClick={() => { setWizardStep('select'); setWizardAnalysis(null); }}>
                  ← Elegir otro archivo
                </Button>
                <Button onClick={confirmarImportWizard}>
                  Confirmar e importar
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Paso 4: Importando ─────────────────────────────────────────── */}
          {wizardStep === 'importing' && (
            <div className="py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-sky-500 mx-auto mb-4" />
              <DialogHeader className="items-center">
                <DialogTitle>Importando {wizardAnalysis?.fileName || ''}…</DialogTitle>
                <DialogDescription>
                  Procesando {wizardAnalysis?.totalRows ?? 0} filas. Esto puede tardar unos segundos.
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                variant="outline"
                onClick={cancelarImport}
                className="mt-6"
              >
                Cancelar import
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
