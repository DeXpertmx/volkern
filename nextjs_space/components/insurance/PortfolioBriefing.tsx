'use client';

import React from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Users,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PortfolioBriefingProps {
  briefing: {
    generado: string;
    resumen: {
      totalPolizasActivas: number;
      renovacionesProximas: number;
      urgentes: number;
      proximas: number;
      futuras: number;
      vencidas: number;
      clientesSinContacto: number;
      oportunidadesCrossSell: number;
      valorEnRiesgo: number;
      valorUrgente: number;
    };
    detalle: {
      urgentes: any[];
      vencidas: any[];
      clientesRiesgo: any[];
      oportunidades: any[];
    };
    acciones: string[];
  };
  loading?: boolean;
  onRefresh?: () => void;
  onPolizaClick?: (id: string) => void;
}

const RAMO_COLORS: Record<string, string> = {
  AUTO: '#3B82F6', HOGAR: '#22C55E', VIDA: '#A855F7', SALUD: '#EF4444',
  GASTOS_MEDICOS: '#F97316', EMPRESARIAL: '#6366F1', RESPONSABILIDAD_CIVIL: '#EC4899',
  INCENDIO: '#F59E0B', TRANSPORTE: '#06B6D4', AHORRO: '#84CC16', JUBILACION: '#8B5CF6',
  OTROS: '#6B7280',
};

export function PortfolioBriefing({
  briefing,
  loading,
  onRefresh,
  onPolizaClick,
}: PortfolioBriefingProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500 mx-auto mb-3" />
            <p className="text-muted-foreground">Analizando cartera...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { resumen, detalle, acciones } = briefing;

  return (
    <div className="space-y-6">
      {/* Header & Timestamp */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-500" />
            AI Portfolio Manager
          </h2>
          <p className="text-xs text-muted-foreground">
            Generado: {new Date(briefing.generado).toLocaleString('es-ES')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar análisis
        </Button>
      </div>

      {/* Acciones recomendadas */}
      <Card className="border-l-4 border-l-sky-500 bg-sky-50/50">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-sky-800 mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Acciones recomendadas
          </h3>
          <div className="space-y-2">
            {acciones.map((accion, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">•</span>
                <span>{accion}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Vencidas</p>
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            </div>
            <p className="text-xl font-bold text-red-600">{resumen.vencidas}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Urgentes &lt;30d</p>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xl font-bold text-amber-600">{resumen.urgentes}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Sin contacto</p>
              <Users className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <p className="text-xl font-bold text-purple-600">{resumen.clientesSinContacto}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Cross-sell</p>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-xl font-bold text-emerald-600">{resumen.oportunidadesCrossSell}</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Urgentes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Pólizas urgentes ({detalle.urgentes.length})
            </CardTitle>
            <CardDescription>&lt; 30 días para vencer</CardDescription>
          </CardHeader>
          <CardContent>
            {detalle.urgentes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">✅ Sin urgencias</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {detalle.urgentes.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer transition-colors"
                    onClick={() => onPolizaClick?.(p.id)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.cliente?.nombre}</p>
                      <p className="text-xs text-muted-foreground">{p.ramo?.replace('_', ' ')} · {p.numeroPoliza}</p>
                    </div>
                    <Badge variant="destructive" className="text-xs shrink-0">
                      {p.diasRestantes <= 0 ? '¡HOY!' : `${p.diasRestantes}d`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Oportunidades Cross-Sell */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Oportunidades de venta cruzada ({detalle.oportunidades.length})
            </CardTitle>
            <CardDescription>Detectadas por IA analizando patrones de cartera</CardDescription>
          </CardHeader>
          <CardContent>
            {detalle.oportunidades.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No se detectaron oportunidades</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {detalle.oportunidades.map((o, i) => (
                  <div
                    key={i}
                    className="p-3 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer transition-colors border-l-4"
                    style={{ borderLeftColor: RAMO_COLORS[o.ramoSugerido] || '#6B7280' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{o.clienteNombre}</p>
                        <p className="text-xs text-muted-foreground">{o.motivo}</p>
                      </div>
                      <Badge className="text-xs bg-emerald-500 shrink-0">{o.probabilidad}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
