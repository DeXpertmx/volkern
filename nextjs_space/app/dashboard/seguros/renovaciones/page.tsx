'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import {
  Calendar as CalendarIcon,
  AlertTriangle,
  Clock,
  BellRing,
  RefreshCw,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CalendarioRenovaciones } from '@/components/insurance/CalendarioRenovaciones';

interface PolizaRenovacion {
  id: string;
  numeroPoliza: string;
  fechaVencimiento: string;
  estado: string;
  primaAnual: number | null;
  moneda: string;
  cliente: { id: string; nombre: string; email: string };
  aseguradora: { id: string; nombre: string };
  productoSeguro: { id: string; nombre: string; ramo: string };
}

interface AlertasData {
  rojas: number;
  ambar: number;
  verdes: number;
}

export default function RenovacionesPage() {
  const router = useRouter();
  const [polizas, setPolizas] = useState<PolizaRenovacion[]>([]);
  const [alertas, setAlertas] = useState<AlertasData>({ rojas: 0, ambar: 0, verdes: 0 });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'calendario' | 'lista'>('calendario');

  const loadRenovaciones = useCallback(async (mes?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (mes) params.set('mes', mes);
      params.set('limite', '100');

      const res = await apiFetch(`/api/insurance/renovaciones?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setPolizas(data.polizas || []);
        setAlertas(data.alertas || { rojas: 0, ambar: 0, verdes: 0 });
      } else {
        toast.error(data.error || 'Error al cargar renovaciones');
      }
    } catch (error) {
      console.error('Error cargando renovaciones:', error);
      toast.error('Error al cargar renovaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRenovaciones();
  }, [loadRenovaciones]);

  const handleMonthChange = (year: number, month: number) => {
    const mes = `${year}-${String(month + 1).padStart(2, '0')}`;
    loadRenovaciones(mes);
  };

  const handlePolizaClick = (id: string) => {
    router.push(`/dashboard/seguros/polizas`);
  };

  // Clasificar pólizas urgente/próximas/futuras para la lista
  const urgencia = (p: PolizaRenovacion) => {
    const dias = Math.ceil(
      (new Date(p.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (dias <= 0) return 'urgente';
    if (dias <= 30) return 'roja';
    if (dias <= 60) return 'ambar';
    return 'verde';
  };

  const rojas = polizas.filter(p => urgencia(p) === 'urgente' || urgencia(p) === 'roja');
  const ambar = polizas.filter(p => urgencia(p) === 'ambar');
  const verdes = polizas.filter(p => urgencia(p) === 'verde');

  if (loading && polizas.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando renovaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alertas Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rojas.length}</div>
            <p className="text-xs text-muted-foreground">&lt; 30 días o vencidas</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximas</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{ambar.length}</div>
            <p className="text-xs text-muted-foreground">30–60 días</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planificadas</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{verdes.length}</div>
            <p className="text-xs text-muted-foreground">&gt; 60 días</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cartera</CardTitle>
            <Shield className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{polizas.length}</div>
            <p className="text-xs text-muted-foreground">Pólizas activas</p>
          </CardContent>
        </Card>
      </div>

      {/* Toggle and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <Button
            variant={viewMode === 'calendario' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendario')}
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Calendario
          </Button>
          <Button
            variant={viewMode === 'lista' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('lista')}
          >
            <BellRing className="w-4 h-4 mr-2" />
            Lista de Alertas
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadRenovaciones()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Calendar or List View */}
      {viewMode === 'calendario' ? (
        polizas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No hay renovaciones próximas</h3>
              <p className="text-muted-foreground text-sm">
                Todas tus pólizas están al día. ¡Buen trabajo!
              </p>
            </CardContent>
          </Card>
        ) : (
          <CalendarioRenovaciones
            polizas={polizas}
            onPolizaClick={handlePolizaClick}
            onMonthChange={handleMonthChange}
          />
        )
      ) : (
        /* List View: grouped by urgency */
        <div className="space-y-6">
          {/* Urgentes */}
          {rojas.length > 0 && (
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Urgente — Acción inmediata requerida ({rojas.length})
                  </CardTitle>
                </div>
                <CardDescription>Pólizas que vencen en menos de 30 días o ya vencidas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {rojas.map(p => {
                    const dias = Math.ceil((new Date(p.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer transition-colors"
                        onClick={() => handlePolizaClick(p.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{p.numeroPoliza}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.cliente.nombre} · {p.aseguradora.nombre} · {p.productoSeguro.ramo.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <Badge variant="destructive" className="text-xs">
                            {dias <= 0 ? '¡VENCIDA!' : `${dias} días`}
                          </Badge>
                          {p.primaAnual && (
                            <p className="text-xs mt-1">{p.primaAnual.toLocaleString('es-ES')} {p.moneda || 'EUR'}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Próximas */}
          {ambar.length > 0 && (
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    Próximas — Planificar seguimiento ({ambar.length})
                  </CardTitle>
                </div>
                <CardDescription>Pólizas que vencen en 30–60 días</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ambar.slice(0, 10).map(p => {
                    const dias = Math.ceil((new Date(p.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-amber-50 rounded-lg hover:bg-amber-100 cursor-pointer transition-colors"
                        onClick={() => handlePolizaClick(p.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{p.numeroPoliza}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.cliente.nombre} · {p.aseguradora.nombre}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                            {dias} días
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                  {ambar.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      +{ambar.length - 10} pólizas más
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Futuras */}
          {verdes.length > 0 && (
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Planificadas ({verdes.length})
                  </CardTitle>
                </div>
                <CardDescription>Pólizas que vencen en más de 60 días</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {verdes.slice(0, 5).map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer text-sm"
                      onClick={() => handlePolizaClick(p.id)}
                    >
                      <span className="truncate">{p.numeroPoliza} — {p.cliente.nombre}</span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {new Date(p.fechaVencimiento).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  ))}
                  {verdes.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      +{verdes.length - 5} pólizas más
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
