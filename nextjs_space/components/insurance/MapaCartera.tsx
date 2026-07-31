'use client';

import React from 'react';
import {
  TrendingUp,
  Users,
  Shield,
  AlertTriangle,
  Building2,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MapaCarteraProps {
  stats: {
    totalPolizas: number;
    primaTotal: number;
    totalClientes: number;
    clientesSinContacto: number;
    tasaRenovacion: number;
    oportunidadesIA: number;
    distribucionRamo: Record<string, { polizas: number; prima: number }>;
    renovacionesPorMes: Record<string, number>;
    topAseguradoras: Array<{ id: string; nombre: string; polizas: number; prima: number }>;
  };
  loading?: boolean;
}

const RAMO_COLORS: Record<string, string> = {
  AUTO: '#3B82F6', HOGAR: '#22C55E', VIDA: '#A855F7', SALUD: '#EF4444',
  GASTOS_MEDICOS: '#F97316', EMPRESARIAL: '#6366F1', RESPONSABILIDAD_CIVIL: '#EC4899',
  INCENDIO: '#F59E0B', TRANSPORTE: '#06B6D4', AHORRO: '#84CC16', JUBILACION: '#8B5CF6',
  OTROS: '#6B7280',
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function MapaCartera({ stats, loading }: MapaCarteraProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-3" />
            <p className="text-muted-foreground">Cargando mapa de cartera...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ramos = Object.entries(stats.distribucionRamo);
  const maxPolizas = Math.max(...ramos.map(([, d]) => d.polizas), 1);
  const maxPrima = Math.max(...ramos.map(([, d]) => d.prima), 1);

  // Ordenar ramos por número de pólizas descendente
  ramos.sort((a, b) => b[1].polizas - a[1].polizas);

  // Renovaciones por mes: próximos 6 meses
  const mesesKeys = Object.keys(stats.renovacionesPorMes).sort();
  const maxRenovaciones = Math.max(...Object.values(stats.renovacionesPorMes), 1);

  // Calcular color de salud de cartera
  const salud = stats.tasaRenovacion >= 90 ? 'emerald' : stats.tasaRenovacion >= 75 ? 'amber' : 'red';
  const saludText = salud === 'emerald' ? 'text-emerald-500' : salud === 'amber' ? 'text-amber-500' : 'text-red-500';
  const saludBg = salud === 'emerald' ? 'bg-emerald-500' : salud === 'amber' ? 'bg-amber-500' : 'bg-red-500';
  const sinContactoPct = stats.totalClientes > 0
    ? Math.round((stats.clientesSinContacto / stats.totalClientes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-purple-500" />
        Mapa de Cartera
      </h2>

      {/* Health Indicators */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Salud de Cartera */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Salud de Cartera</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${saludText}`}>{stats.tasaRenovacion}%</div>
            <p className="text-xs text-muted-foreground">Tasa de renovación</p>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${saludBg}`}
                style={{ width: `${stats.tasaRenovacion}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Valor Cartera */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Valor Cartera</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {stats.primaTotal >= 1_000_000
                ? `${(stats.primaTotal / 1_000_000).toFixed(1)}M €`
                : `${(stats.primaTotal / 1000).toFixed(0)}K €`}
            </div>
            <p className="text-xs text-muted-foreground">Prima anual gestionada</p>
          </CardContent>
        </Card>

        {/* Clientes sin contacto */}
        <Card className={sinContactoPct > 30 ? 'border-l-4 border-l-red-500' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${sinContactoPct > 30 ? 'text-red-500' : 'text-muted-foreground'}`} />
              Sin Contacto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.clientesSinContacto}</div>
            <p className="text-xs text-muted-foreground">
              {sinContactoPct}% de {stats.totalClientes} clientes
            </p>
          </CardContent>
        </Card>

        {/* Oportunidades IA */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Oportunidades IA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.oportunidadesIA}</div>
            <p className="text-xs text-muted-foreground">Detectadas automáticamente</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Distribución por Ramo — barras horizontales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribución por Ramo</CardTitle>
            <CardDescription>Pólizas activas por tipo de seguro</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ramos.slice(0, 8).map(([ramo, data]) => (
                <div key={ramo} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: RAMO_COLORS[ramo] || '#6B7280' }}
                      />
                      {ramo.replace(/_/g, ' ')}
                    </span>
                    <span className="text-muted-foreground">
                      {data.polizas} pólizas · {data.prima >= 1000 ? `${(data.prima / 1000).toFixed(0)}K €` : `${data.prima} €`}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(data.polizas / maxPolizas) * 100}%`,
                        backgroundColor: RAMO_COLORS[ramo] || '#6B7280',
                      }}
                    />
                  </div>
                </div>
              ))}
              {ramos.length > 8 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{ramos.length - 8} ramos más
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Renovaciones próximos meses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Renovaciones Próximas</CardTitle>
            <CardDescription>Pólizas que vencen en los próximos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mesesKeys.slice(0, 6).map(key => {
                const [y, m] = key.split('-');
                const label = `${MONTHS[parseInt(m) - 1]} ${y.slice(2)}`;
                const count = stats.renovacionesPorMes[key] || 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="text-muted-foreground">{count} pólizas</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: `${(count / maxRenovaciones) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Aseguradoras */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Top Aseguradoras
          </CardTitle>
          <CardDescription>Por volumen de pólizas activas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            {stats.topAseguradoras.map((a, i) => (
              <Card key={a.id} className="border-l-4 border-l-purple-500">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">#{i + 1}</p>
                  <p className="font-semibold text-sm truncate">{a.nombre}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{a.polizas} pólizas</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.prima >= 1000 ? `${(a.prima / 1000).toFixed(0)}K €` : `${a.prima} €`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
