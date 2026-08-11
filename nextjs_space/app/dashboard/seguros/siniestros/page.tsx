'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  ShieldAlert,
  Plus,
  Search,
  Filter,
  X,
  Loader2,
  FileWarning,
  ChevronRight,
  RefreshCw,
  CircleDollarSign,
  Ban,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

// ─── Estados del ciclo de vida (igual que lib/skills/siniestros-skills.ts) ──
const ESTADOS = ['REPORTADO', 'EN_TRAMITE', 'ABIERTO', 'PAGADO', 'RECHAZADO', 'CERRADO'] as const;
type EstadoSiniestro = (typeof ESTADOS)[number];

// Transiciones válidas por estado (espejo de TRANSICIONES_VALIDAS del skill)
const TRANSICIONES: Record<EstadoSiniestro, EstadoSiniestro[]> = {
  REPORTADO: ['EN_TRAMITE', 'RECHAZADO', 'CERRADO'],
  EN_TRAMITE: ['ABIERTO', 'RECHAZADO', 'CERRADO'],
  ABIERTO: ['PAGADO', 'RECHAZADO', 'CERRADO'],
  PAGADO: ['CERRADO'],
  RECHAZADO: ['CERRADO'],
  CERRADO: [],
};

const ESTADO_STYLES: Record<EstadoSiniestro, { badge: string; dot: string; label: string }> = {
  REPORTADO: { badge: 'bg-sky-100 text-sky-700 border-sky-200', dot: 'bg-sky-500', label: 'Reportado' },
  EN_TRAMITE: { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'En trámite' },
  ABIERTO: { badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'Abierto' },
  PAGADO: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Pagado' },
  RECHAZADO: { badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Rechazado' },
  CERRADO: { badge: 'bg-slate-200 text-slate-700 border-slate-300', dot: 'bg-slate-400', label: 'Cerrado' },
};

interface SiniestroList {
  id: string;
  numeroSiniestro: string | null;
  descripcion: string;
  fechaSuceso: string;
  fechaReporte: string;
  fechaCierre: string | null;
  montoReclamado: number | null;
  montoIndemnizado: number | null;
  deducible: number | null;
  moneda: string;
  estado: EstadoSiniestro;
  motivoRechazo: string | null;
  notas: string | null;
  poliza: { id: string; numeroPoliza: string };
  cliente: { id: string; nombre: string };
  aseguradora: { id: string; nombre: string };
}

interface SiniestroDetalle extends SiniestroList {
  poliza: SiniestroList['poliza'] & {
    fechaVencimiento: string;
    productoSeguro: { ramo: string; nombre: string } | null;
  };
  cliente: SiniestroList['cliente'] & { email: string | null; telefono: string | null };
  aseguradora: SiniestroList['aseguradora'] & { email: string | null; telefono: string | null };
  createdBy: { id: string; name: string | null; email: string | null } | null;
}

interface PolizaOption {
  id: string;
  numeroPoliza: string;
  estado: string;
  cliente: { id: string; nombre: string };
  aseguradora: { id: string; nombre: string };
  productoSeguro: { id: string; ramo: string } | null;
}

const fmtFecha = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtMoneda = (n: number | null | undefined, moneda: string) => {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || 'EUR'}`;
};

export default function SiniestrosPage() {
  const [siniestros, setSiniestros] = useState<SiniestroList[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [estadoFilter, setEstadoFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Dialog de alta
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [polizas, setPolizas] = useState<PolizaOption[]>([]);
  const [form, setForm] = useState({
    polizaId: '',
    numeroSiniestro: '',
    descripcion: '',
    fechaSuceso: new Date().toISOString().split('T')[0],
    montoReclamado: '',
    deducible: '',
    moneda: 'EUR',
    notas: '',
  });

  // Dialog de detalle / transiciones
  const [detail, setDetail] = useState<SiniestroDetalle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transition, setTransition] = useState<{
    estado: EstadoSiniestro;
    montoIndemnizado: string;
    motivoRechazo: string;
    notas: string;
    fechaCierre: string;
  }>({ estado: '' as EstadoSiniestro, montoIndemnizado: '', motivoRechazo: '', notas: '', fechaCierre: '' });
  const [transitionSaving, setTransitionSaving] = useState(false);

  const loadSiniestros = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (estadoFilter) params.set('estado', estadoFilter);
      // La búsqueda de texto libre se filtra client-side (la API solo acepta
      // filtros por clienteId/polizaId/aseguradoraId/estado).

      const res = await apiFetch(`/api/insurance/siniestros?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setSiniestros(data.siniestros || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        toast.error(data.error || 'Error al cargar siniestros');
      }
    } catch (error) {
      console.error('Error cargando siniestros:', error);
      toast.error('Error al cargar siniestros');
    } finally {
      setLoading(false);
    }
  }, [page, estadoFilter, search]);

  useEffect(() => {
    loadSiniestros();
  }, [loadSiniestros]);

  const loadPolizas = async () => {
    try {
      const res = await apiFetch('/api/insurance/polizas?limite=200');
      const data = await res.json();
      if (res.ok) {
        setPolizas((data.polizas || []).filter((p: PolizaOption) => p.estado !== 'CANCELADA'));
      }
    } catch (error) {
      console.error('Error cargando pólizas para el formulario:', error);
    }
  };

  const openNewDialog = () => {
    setForm({
      polizaId: '',
      numeroSiniestro: '',
      descripcion: '',
      fechaSuceso: new Date().toISOString().split('T')[0],
      montoReclamado: '',
      deducible: '',
      moneda: 'EUR',
      notas: '',
    });
    loadPolizas();
    setIsNewOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.polizaId) {
      toast.error('Selecciona la póliza afectada');
      return;
    }
    if (!form.descripcion.trim()) {
      toast.error('Describe brevemente el siniestro');
      return;
    }
    try {
      setSaving(true);
      const res = await apiFetch('/api/insurance/siniestros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polizaId: form.polizaId,
          numeroSiniestro: form.numeroSiniestro.trim() || undefined,
          descripcion: form.descripcion.trim(),
          fechaSuceso: form.fechaSuceso,
          montoReclamado: form.montoReclamado ? Number(form.montoReclamado) : undefined,
          deducible: form.deducible ? Number(form.deducible) : undefined,
          moneda: form.moneda,
          notas: form.notas.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Siniestro reportado');
        setIsNewOpen(false);
        loadSiniestros();
      } else {
        toast.error(data.error || 'Error al reportar el siniestro');
      }
    } catch (error) {
      console.error('Error creando siniestro:', error);
      toast.error('Error al reportar el siniestro');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    setTransition({ estado: '' as EstadoSiniestro, montoIndemnizado: '', motivoRechazo: '', notas: '', fechaCierre: '' });
    try {
      const res = await apiFetch(`/api/insurance/siniestros/${id}`);
      const data = await res.json();
      if (res.ok) {
        setDetail(data.siniestro);
      } else {
        toast.error(data.error || 'Error al cargar el siniestro');
      }
    } catch (error) {
      console.error('Error cargando detalle:', error);
      toast.error('Error al cargar el siniestro');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTransition = async () => {
    if (!detail || !transition.estado) return;
    try {
      setTransitionSaving(true);
      const body: Record<string, unknown> = { estado: transition.estado };
      if (transition.estado === 'PAGADO') body.montoIndemnizado = Number(transition.montoIndemnizado);
      if (transition.estado === 'RECHAZADO') body.motivoRechazo = transition.motivoRechazo.trim();
      if (transition.estado === 'CERRADO') body.fechaCierre = transition.fechaCierre || undefined;
      if (transition.notas.trim()) body.notas = transition.notas.trim();

      const res = await apiFetch(`/api/insurance/siniestros/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Estado actualizado');
        setTransition({ estado: '' as EstadoSiniestro, montoIndemnizado: '', motivoRechazo: '', notas: '', fechaCierre: '' });
        openDetail(detail.id);
        loadSiniestros();
      } else {
        toast.error(data.error || 'Error al actualizar el estado');
      }
    } catch (error) {
      console.error('Error en transición:', error);
      toast.error('Error al actualizar el estado');
    } finally {
      setTransitionSaving(false);
    }
  };

  // Búsqueda de texto libre: filtra sobre la página actual (cliente, póliza,
  // aseguradora o nº de siniestro). El contador de total sigue siendo el de la API.
  const visibleSiniestros = search.trim()
    ? siniestros.filter(s => {
        const q = search.trim().toLowerCase();
        return [
          s.cliente?.nombre,
          s.poliza?.numeroPoliza,
          s.aseguradora?.nombre,
          s.numeroSiniestro,
          s.descripcion,
        ]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q));
      })
    : siniestros;

  // KPIs de la cabecera
  const enProceso = visibleSiniestros.filter(s => ['REPORTADO', 'EN_TRAMITE', 'ABIERTO'].includes(s.estado)).length;
  const pagados = visibleSiniestros.filter(s => s.estado === 'PAGADO').length;
  const rechazados = visibleSiniestros.filter(s => s.estado === 'RECHAZADO').length;

  if (loading && siniestros.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando siniestros...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-500" />
            Siniestros
          </h1>
          <p className="text-sm text-muted-foreground">
            Reporta y gestiona el ciclo de vida completo de los siniestros de tu cartera
          </p>
        </div>
        <Button onClick={openNewDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Reportar Siniestro
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <ShieldAlert className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">Siniestros registrados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En proceso</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{enProceso}</div>
            <p className="text-xs text-muted-foreground">Reportado / trámite / abierto</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagados</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{pagados}</div>
            <p className="text-xs text-muted-foreground">Indemnizados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rechazados</CardTitle>
            <Ban className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rechazados}</div>
            <p className="text-xs text-muted-foreground">Con motivo registrado</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar + filtros */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por póliza, cliente o aseguradora..."
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
                title="Filtrar por estado"
              >
                <Filter className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={loadSiniestros} title="Actualizar">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex gap-3 mt-3 p-3 bg-muted/50 rounded-lg flex-wrap">
              <Select value={estadoFilter || 'TODOS'} onValueChange={v => { setEstadoFilter(v === 'TODOS' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los estados</SelectItem>
                  {ESTADOS.map(e => (
                    <SelectItem key={e} value={e}>{ESTADO_STYLES[e].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(search || estadoFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(''); setEstadoFilter(''); setPage(1); }}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {visibleSiniestros.length === 0 ? (
            <div className="text-center py-12">
              <FileWarning className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No hay siniestros</h3>
              <p className="text-muted-foreground mb-4">
                {estadoFilter || search
                  ? 'No se encontraron siniestros con los filtros seleccionados'
                  : 'Cuando un cliente sufra un siniestro, repórtalo aquí para hacerle seguimiento'}
              </p>
              {!estadoFilter && !search && (
                <Button onClick={openNewDialog}>
                  <Plus className="h-4 w-4 mr-2" /> Reportar Siniestro
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="p-2 font-medium">Nº Siniestro</th>
                    <th className="p-2 font-medium">Cliente</th>
                    <th className="p-2 font-medium">Póliza</th>
                    <th className="p-2 font-medium">Aseguradora</th>
                    <th className="p-2 font-medium">Fecha suceso</th>
                    <th className="p-2 font-medium text-right">Reclamado</th>
                    <th className="p-2 font-medium">Estado</th>
                    <th className="p-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {visibleSiniestros.map(s => (
                    <tr
                      key={s.id}
                      className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => openDetail(s.id)}
                    >
                      <td className="p-2 font-medium">{s.numeroSiniestro || s.descripcion.slice(0, 28) || '—'}</td>
                      <td className="p-2">{s.cliente.nombre}</td>
                      <td className="p-2 text-muted-foreground">{s.poliza.numeroPoliza}</td>
                      <td className="p-2">{s.aseguradora.nombre}</td>
                      <td className="p-2 text-muted-foreground">{fmtFecha(s.fechaSuceso)}</td>
                      <td className="p-2 text-right">{fmtMoneda(s.montoReclamado, s.moneda)}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={ESTADO_STYLES[s.estado].badge}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${ESTADO_STYLES[s.estado].dot}`} />
                          {ESTADO_STYLES[s.estado].label}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    Página {page} de {totalPages} · {total} siniestros
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      ← Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Siguiente →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: reportar siniestro */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reportar Siniestro</DialogTitle>
            <DialogDescription>
              Registra el siniestro contra la póliza afectada. Cliente y aseguradora se resuelven desde la póliza.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="polizaId">Póliza afectada *</Label>
              <Select value={form.polizaId} onValueChange={v => setForm(prev => ({ ...prev, polizaId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar póliza..." />
                </SelectTrigger>
                <SelectContent>
                  {polizas.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.numeroPoliza} — {p.cliente.nombre} ({p.aseguradora.nombre})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.polizaId && (() => {
                const p = polizas.find(x => x.id === form.polizaId);
                if (!p) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    Cliente: <strong>{p.cliente.nombre}</strong> · Aseguradora:{' '}
                    <strong>{p.aseguradora.nombre}</strong>
                    {p.productoSeguro?.ramo ? ` · Ramo: ${p.productoSeguro.ramo.replace('_', ' ')}` : ''}
                  </p>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numeroSiniestro">Nº Siniestro (aseguradora)</Label>
                <Input
                  id="numeroSiniestro"
                  value={form.numeroSiniestro}
                  onChange={e => setForm(prev => ({ ...prev, numeroSiniestro: e.target.value }))}
                  placeholder="SIN-2026-0001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaSuceso">Fecha del suceso *</Label>
                <Input
                  id="fechaSuceso"
                  type="date"
                  value={form.fechaSuceso}
                  onChange={e => setForm(prev => ({ ...prev, fechaSuceso: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="montoReclamado">Monto reclamado</Label>
                <Input
                  id="montoReclamado"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.montoReclamado}
                  onChange={e => setForm(prev => ({ ...prev, montoReclamado: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deducible">Deducible</Label>
                <Input
                  id="deducible"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.deducible}
                  onChange={e => setForm(prev => ({ ...prev, deducible: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moneda">Moneda</Label>
                <Select value={form.moneda} onValueChange={v => setForm(prev => ({ ...prev, moneda: v }))}>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción del siniestro *</Label>
              <Textarea
                id="descripcion"
                value={form.descripcion}
                onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Ej: Colisión leve en estacionamiento, golpe en puerta trasera derecha..."
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas internas</Label>
              <Textarea
                id="notas"
                value={form.notas}
                onChange={e => setForm(prev => ({ ...prev, notas: e.target.value }))}
                placeholder="Notas para el agente..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
                  </>
                ) : (
                  'Reportar Siniestro'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: detalle + transiciones */}
      <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            </div>
          ) : detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                  {detail.numeroSiniestro || 'Siniestro'}
                  <Badge variant="outline" className={ESTADO_STYLES[detail.estado].badge}>
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${ESTADO_STYLES[detail.estado].dot}`} />
                    {ESTADO_STYLES[detail.estado].label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Reportado el {fmtFecha(detail.fechaReporte)}
                  {detail.createdBy?.name ? ` por ${detail.createdBy.name}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Datos clave */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-medium text-sm">{detail.cliente.nombre}</p>
                    {detail.cliente.email && <p className="text-xs text-muted-foreground truncate">{detail.cliente.email}</p>}
                    {detail.cliente.telefono && <p className="text-xs text-muted-foreground">{detail.cliente.telefono}</p>}
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Póliza</p>
                    <p className="font-medium text-sm">{detail.poliza.numeroPoliza}</p>
                    {detail.poliza.productoSeguro && (
                      <p className="text-xs text-muted-foreground">
                        {detail.poliza.productoSeguro.nombre} ({detail.poliza.productoSeguro.ramo.replace('_', ' ')})
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Aseguradora</p>
                    <p className="font-medium text-sm">{detail.aseguradora.nombre}</p>
                    {detail.aseguradora.email && <p className="text-xs text-muted-foreground truncate">{detail.aseguradora.email}</p>}
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Fecha del suceso</p>
                    <p className="font-medium text-sm">{fmtFecha(detail.fechaSuceso)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Reclamado</p>
                    <p className="font-medium text-sm">{fmtMoneda(detail.montoReclamado, detail.moneda)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Indemnizado</p>
                    <p className="font-medium text-sm text-emerald-600">
                      {fmtMoneda(detail.montoIndemnizado, detail.moneda)}
                    </p>
                  </div>
                </div>

                {/* Descripción */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Descripción</p>
                  <p className="text-sm whitespace-pre-wrap">{detail.descripcion}</p>
                </div>

                {detail.motivoRechazo && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-xs font-medium text-red-700 mb-1">Motivo de rechazo</p>
                    <p className="text-sm text-red-700">{detail.motivoRechazo}</p>
                  </div>
                )}

                {detail.notas && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notas internas</p>
                    <p className="text-sm whitespace-pre-wrap">{detail.notas}</p>
                  </div>
                )}

                {/* Transiciones */}
                {TRANSICIONES[detail.estado].length > 0 ? (
                  <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-sky-500" />
                      Avanzar estado
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TRANSICIONES[detail.estado].map(t => (
                        <Button
                          key={t}
                          size="sm"
                          variant={t === 'PAGADO' ? 'default' : t === 'RECHAZADO' ? 'destructive' : 'outline'}
                          onClick={() => setTransition(prev => ({
                            ...prev,
                            estado: t,
                            montoIndemnizado: t === 'PAGADO' ? String(detail.montoReclamado ?? '') : '',
                            fechaCierre: t === 'CERRADO' ? new Date().toISOString().split('T')[0] : '',
                          }))}
                          className={transition.estado === t ? 'ring-2 ring-offset-1 ring-sky-500' : ''}
                        >
                          {t === 'PAGADO' && <CircleDollarSign className="w-3.5 h-3.5 mr-1.5" />}
                          {t === 'RECHAZADO' && <Ban className="w-3.5 h-3.5 mr-1.5" />}
                          {t === 'CERRADO' && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                          {ESTADO_STYLES[t].label}
                        </Button>
                      ))}
                    </div>

                    {transition.estado && (
                      <div className="space-y-3 pt-2 border-t">
                        {transition.estado === 'PAGADO' && (
                          <div className="space-y-2">
                            <Label htmlFor="montoIndemnizado">Monto indemnizado *</Label>
                            <Input
                              id="montoIndemnizado"
                              type="number"
                              step="0.01"
                              min="0"
                              value={transition.montoIndemnizado}
                              onChange={e => setTransition(prev => ({ ...prev, montoIndemnizado: e.target.value }))}
                              placeholder="0.00"
                            />
                          </div>
                        )}
                        {transition.estado === 'RECHAZADO' && (
                          <div className="space-y-2">
                            <Label htmlFor="motivoRechazo">Motivo del rechazo *</Label>
                            <Textarea
                              id="motivoRechazo"
                              value={transition.motivoRechazo}
                              onChange={e => setTransition(prev => ({ ...prev, motivoRechazo: e.target.value }))}
                              placeholder="Ej: Siniestro no cubierto por la póliza..."
                              rows={2}
                            />
                          </div>
                        )}
                        {transition.estado === 'CERRADO' && (
                          <div className="space-y-2">
                            <Label htmlFor="fechaCierre">Fecha de cierre *</Label>
                            <Input
                              id="fechaCierre"
                              type="date"
                              value={transition.fechaCierre}
                              onChange={e => setTransition(prev => ({ ...prev, fechaCierre: e.target.value }))}
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="transNotas">Notas (opcional)</Label>
                          <Textarea
                            id="transNotas"
                            value={transition.notas}
                            onChange={e => setTransition(prev => ({ ...prev, notas: e.target.value }))}
                            rows={2}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTransition(prev => ({ ...prev, estado: '' as EstadoSiniestro }))}
                          >
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={handleTransition} disabled={transitionSaving}>
                            {transitionSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            Pasar a {ESTADO_STYLES[transition.estado].label}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
                    Estado terminal: no hay transiciones disponibles para este siniestro.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
