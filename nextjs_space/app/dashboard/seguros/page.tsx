'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { formatearImporte } from '@/lib/moneda';
import { formatCurrencyExact } from '@/components/insurance/portfolio-format';
import {
  Shield,
  FileText,
  Building2,
  AlertTriangle,
  TrendingUp,
  Calendar,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface InsuranceStats {
  totalPolizas: number;
  polizasActivas: number;
  polizasProximasVencer: number;
  polizasVencidas: number;
  totalAseguradoras: number;
  totalProductos: number;
  primaTotal: number;
  /** Divisa de reporte del tenant: el agregado de primas se escribe en ella. */
  tenantMoneda?: string;
  renovaciones30d: number;
  renovaciones60d: number;
  oportunidadesDetectadas: number;
}

interface PolizaProxima {
  id: string;
  numeroPoliza: string;
  cliente: { id: string; nombre: string };
  aseguradora: { id: string; nombre: string };
  productoSeguro: { id: string; nombre: string; ramo: string };
  fechaVencimiento: string;
  estado: string;
  primaAnual: number | null;
  moneda: string;
}

export default function SegurosDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<InsuranceStats | null>(null);
  const [proximasVencer, setProximasVencer] = useState<PolizaProxima[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [statsRes, polizasRes] = await Promise.all([
        apiFetch('/api/insurance/stats'),
        apiFetch('/api/insurance/polizas?estado=ACTIVA&ordenar=fechaVencimiento&limite=10'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (polizasRes.ok) {
        const data = await polizasRes.json();
        setProximasVencer(data.polizas || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard de seguros:', error);
      toast.error('Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando dashboard de seguros...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pólizas Activas</CardTitle>
            <FileText className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.polizasActivas ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              de {stats?.totalPolizas ?? 0} pólizas totales
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximas a Vencer</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.polizasProximasVencer ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.renovaciones30d ?? 0} en los próximos 30 días
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prima Anual Gestionada</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatearImporte(stats?.primaTotal, stats?.tenantMoneda || '', 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Valor total de la cartera
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oportunidades IA</CardTitle>
            <Shield className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.oportunidadesDetectadas ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Detectadas por el Portfolio Manager
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Second row: more stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aseguradoras</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAseguradoras ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProductos ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Renovaciones 60d</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.renovaciones60d ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Próximas a vencer table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pólizas próximas a vencer</CardTitle>
            <CardDescription>
              Ordenadas por fecha de vencimiento más próxima
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => router.push('/dashboard/seguros/polizas')}>
            Ver todas
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardHeader>
        <CardContent>
          {proximasVencer.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay pólizas próximas a vencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-3 font-medium">Póliza</th>
                    <th className="pb-3 font-medium">Cliente</th>
                    <th className="pb-3 font-medium">Aseguradora</th>
                    <th className="pb-3 font-medium">Ramo</th>
                    <th className="pb-3 font-medium text-right">Prima</th>
                    <th className="pb-3 font-medium">Vencimiento</th>
                    <th className="pb-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {proximasVencer.map((p) => {
                    const daysLeft = Math.ceil(
                      (new Date(p.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    );
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-muted/50"
                      >
                        <td className="py-2 font-medium">{p.numeroPoliza}</td>
                        <td className="py-2">{p.cliente.nombre}</td>
                        <td className="py-2">{p.aseguradora.nombre}</td>
                        <td className="py-2">
                          <Badge variant="outline" className="text-xs">
                            {p.productoSeguro.ramo.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          {p.primaAnual ? formatCurrencyExact(p.primaAnual, p.moneda) : '—'}
                        </td>
                        <td className="py-2">
                          <span className={daysLeft <= 30 ? 'text-red-600 font-medium' : ''}>
                            {new Date(p.fechaVencimiento).toLocaleDateString('es-ES')}
                          </span>
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className={`text-xs ${
                            p.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' :
                            p.estado === 'PROXIMA_A_VENCER' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {p.estado.replace('_', ' ')}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/dashboard/seguros/polizas?nueva=true')}>
          <CardContent className="flex items-center gap-3 p-4 pt-4">
            <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Nueva Póliza</p>
              <p className="text-xs text-muted-foreground">Registrar una póliza manualmente</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/dashboard/seguros/polizas?importar=true')}>
          <CardContent className="flex items-center gap-3 p-4 pt-4">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Importar Cartera</p>
              <p className="text-xs text-muted-foreground">Importar desde Excel o CSV</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/dashboard/seguros/aseguradoras?nueva=true')}>
          <CardContent className="flex items-center gap-3 p-4 pt-4">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Nueva Aseguradora</p>
              <p className="text-xs text-muted-foreground">Registrar una aseguradora</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
