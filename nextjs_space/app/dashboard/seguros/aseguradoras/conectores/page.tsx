'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  Plug,
  RefreshCw,
  Loader2,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  Rocket,
  Ban,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface ConnectorInfo {
  slug: string;
  nombre: string;
  country: 'MX' | 'ES' | null;
  regulatoryId?: string | null;
  website?: string | null;
  monedaBase?: string | null;
  supportedRamos?: string[];
  capabilities?: string[];
  isMock?: boolean | null;
  status: 'disponible' | 'pendiente';
}

interface SyncResult {
  summary?: { created: number; updated: number; skipped: number; errors: number; dryRun: boolean };
  mensaje?: string;
  totalEnPartner?: number;
  errors?: Array<{ numeroPoliza: string; code: string; message: string }>;
  processed?: Array<{ numeroPoliza: string; accion: string; estado: string }>;
}

const CAP_LABELS: Record<string, string> = {
  AUTH_OAUTH: 'OAuth 2.0',
  AUTH_API_KEY: 'API Key',
  POLICIES_LIST: 'Listar pólizas',
  POLICIES_ISSUE: 'Emitir pólizas',
  CLAIMS_SUBMIT: 'Siniestros',
  CLAIMS_STATUS: 'Estado siniestros',
  WEBHOOK_IN: 'Webhook IN',
  WEBHOOK_OUT: 'Webhook OUT',
};

const PAIS_LABEL: Record<string, string> = { MX: '🇲🇽 México', ES: '🇪🇸 España' };

interface PolizaOption {
  id: string;
  numeroPoliza: string;
  cliente: { nombre: string };
  aseguradora: { nombre: string };
}

export default function ConectoresPage() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog sync
  const [syncTarget, setSyncTarget] = useState<ConnectorInfo | null>(null);
  const [syncForm, setSyncForm] = useState({ dryRun: true, actualizarExistentes: false, limit: '50' });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Dialog emitir
  const [emitTarget, setEmitTarget] = useState<ConnectorInfo | null>(null);
  const [polizas, setPolizas] = useState<PolizaOption[]>([]);
  const [emitPolizaId, setEmitPolizaId] = useState('');
  const [emitDryRun, setEmitDryRun] = useState(true);
  const [emitting, setEmitting] = useState(false);
  const [emitResult, setEmitResult] = useState<{ mensaje: string } | null>(null);

  const loadConnectors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/insurance/connectors');
      const data = await res.json();
      if (res.ok) {
        setConnectors(data.connectors || []);
      } else {
        toast.error(data.error || 'Error al cargar conectores');
      }
    } catch (error) {
      console.error('Error cargando conectores:', error);
      toast.error('Error al cargar conectores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const openSync = (c: ConnectorInfo) => {
    setSyncTarget(c);
    setSyncForm({ dryRun: true, actualizarExistentes: false, limit: '50' });
    setSyncResult(null);
  };

  const runSync = async () => {
    if (!syncTarget) return;
    try {
      setSyncing(true);
      setSyncResult(null);
      const res = await apiFetch(`/api/insurance/connectors/${syncTarget.slug}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: syncForm.dryRun,
          actualizarExistentes: syncForm.actualizarExistentes,
          limit: Number(syncForm.limit) || 50,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(data);
        toast.success(data.mensaje || 'Sincronización completada');
      } else {
        toast.error(data.error || 'Error al sincronizar');
        setSyncResult({ mensaje: data.error });
      }
    } catch (error) {
      console.error('Error en sync:', error);
      toast.error('Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const openEmitir = async (c: ConnectorInfo) => {
    setEmitTarget(c);
    setEmitPolizaId('');
    setEmitDryRun(true);
    setEmitResult(null);
    try {
      const res = await apiFetch('/api/insurance/polizas?limite=200');
      const data = await res.json();
      if (res.ok) {
        const list = data.polizas || [];
        setPolizas(list.filter((p: PolizaOption) => p.aseguradora?.nombre).slice(0, 100));
      }
    } catch (error) {
      console.error('Error cargando pólizas:', error);
    }
  };

  const runEmitir = async () => {
    if (!emitTarget || !emitPolizaId) {
      toast.error('Selecciona la póliza a emitir');
      return;
    }
    try {
      setEmitting(true);
      const res = await apiFetch(`/api/insurance/connectors/${emitTarget.slug}/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polizaId: emitPolizaId, dryRun: emitDryRun }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmitResult({ mensaje: data.mensaje || 'Emisión completada' });
        toast.success(data.mensaje || 'Emisión completada');
      } else {
        toast.error(data.error || 'Error al emitir');
        setEmitResult({ mensaje: data.error });
      }
    } catch (error) {
      console.error('Error en emisión:', error);
      toast.error('Error al emitir');
    } finally {
      setEmitting(false);
    }
  };

  if (loading && connectors.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando conectores...</p>
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
            <Plug className="h-6 w-6 text-sky-500" />
            Conectores de Aseguradoras
          </h1>
          <p className="text-sm text-muted-foreground">
            Marketplace de integraciones (Fase 5): sincroniza la cartera del partner y emite pólizas sin cambiar de sistema
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadConnectors}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {connectors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
            <h3 className="text-lg font-medium mb-2">No hay conectores registrados</h3>
            <p className="text-muted-foreground text-sm">El marketplace está vacío.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connectors.map(c => (
            <Card key={c.slug} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                      <Landmark className="h-5 w-5 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{c.nombre}</CardTitle>
                      <CardDescription className="text-xs">
                        {c.country ? PAIS_LABEL[c.country] : '—'}
                        {c.monedaBase ? ` · ${c.monedaBase}` : ''}
                      </CardDescription>
                    </div>
                  </div>
                  {c.status === 'disponible' ? (
                    c.isMock ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 whitespace-nowrap">
                        Sandbox
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Live
                      </Badge>
                    )
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground whitespace-nowrap">
                      Pendiente
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {c.status === 'disponible' ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Ramos soportados</p>
                      <div className="flex flex-wrap gap-1">
                        {(c.supportedRamos || []).map(r => (
                          <Badge key={r} variant="secondary" className="text-xs">
                            {r.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Capacidades</p>
                      <div className="flex flex-wrap gap-1">
                        {(c.capabilities || []).map(cap => (
                          <Badge key={cap} variant="outline" className="text-xs">
                            {CAP_LABELS[cap] || cap}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {c.website && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.website.replace('https://', '')}</span>
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openSync(c)}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Sincronizar cartera
                      </Button>
                      <Button size="sm" onClick={() => openEmitir(c)}>
                        <Rocket className="w-3.5 h-3.5 mr-1.5" />
                        Emitir póliza
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Conector registrado en el marketplace, pendiente de implementación.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: sincronizar cartera */}
      <Dialog open={syncTarget !== null} onOpenChange={open => { if (!open) setSyncTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-sky-500" />
              Sincronizar cartera — {syncTarget?.nombre}
            </DialogTitle>
            <DialogDescription>
              Importa las pólizas del partner al CRM (idempotente por número de póliza).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="syncLimit">Pólizas por página</Label>
              <Input
                id="syncLimit"
                type="number"
                min={1}
                max={100}
                value={syncForm.limit}
                onChange={e => setSyncForm(prev => ({ ...prev, limit: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Modo dry-run (preview)</p>
                <p className="text-xs text-muted-foreground">Muestra qué se importaría sin escribir en BD</p>
              </div>
              <Switch checked={syncForm.dryRun} onCheckedChange={v => setSyncForm(prev => ({ ...prev, dryRun: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Actualizar existentes</p>
                <p className="text-xs text-muted-foreground">Refresca fechas, prima y estado de pólizas ya importadas</p>
              </div>
              <Switch checked={syncForm.actualizarExistentes} onCheckedChange={v => setSyncForm(prev => ({ ...prev, actualizarExistentes: v }))} />
            </div>

            {syncResult && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm whitespace-pre-wrap">{syncResult.mensaje || ''}</p>
                {syncResult.summary && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded bg-emerald-50 p-2">
                      <p className="text-lg font-bold text-emerald-600">{syncResult.summary.created}</p>
                      <p className="text-xs text-muted-foreground">Creadas</p>
                    </div>
                    <div className="rounded bg-sky-50 p-2">
                      <p className="text-lg font-bold text-sky-600">{syncResult.summary.updated}</p>
                      <p className="text-xs text-muted-foreground">Actualizadas</p>
                    </div>
                    <div className="rounded bg-muted p-2">
                      <p className="text-lg font-bold">{syncResult.summary.skipped}</p>
                      <p className="text-xs text-muted-foreground">Ya existían</p>
                    </div>
                    <div className={`rounded p-2 ${syncResult.summary.errors > 0 ? 'bg-red-50' : 'bg-muted'}`}>
                      <p className={`text-lg font-bold ${syncResult.summary.errors > 0 ? 'text-red-600' : ''}`}>{syncResult.summary.errors}</p>
                      <p className="text-xs text-muted-foreground">Errores</p>
                    </div>
                  </div>
                )}
                {syncResult.errors && syncResult.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {syncResult.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-red-600 flex gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {e.numeroPoliza} · {e.code}: {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncTarget(null)} disabled={syncing}>
              Cerrar
            </Button>
            <Button onClick={runSync} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {syncing ? 'Sincronizando...' : 'Ejecutar sync'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: emitir póliza */}
      <Dialog open={emitTarget !== null} onOpenChange={open => { if (!open) setEmitTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-sky-500" />
              Emitir póliza — {emitTarget?.nombre}
            </DialogTitle>
            <DialogDescription>
              Emite una póliza interna contra el partner. Requiere RFC/NIF del cliente en su ficha fiscal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emitPoliza">Póliza interna *</Label>
              <Select value={emitPolizaId} onValueChange={setEmitPolizaId}>
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
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Modo dry-run (preview)</p>
                <p className="text-xs text-muted-foreground">Simula la emisión sin guardar el documento externo</p>
              </div>
              <Switch checked={emitDryRun} onCheckedChange={setEmitDryRun} />
            </div>

            {emitResult && (
              <div className="rounded-lg border p-3">
                <p className="text-sm whitespace-pre-wrap">{emitResult.mensaje}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmitTarget(null)} disabled={emitting}>
              Cerrar
            </Button>
            <Button onClick={runEmitir} disabled={emitting}>
              {emitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
              {emitting ? 'Emitiendo...' : 'Emitir en partner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
