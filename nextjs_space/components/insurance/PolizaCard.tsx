'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, Shield, Building2, Euro } from 'lucide-react';

interface PolizaCardProps {
  poliza: {
    id: string;
    numeroPoliza: string;
    estado: string;
    fechaVencimiento: string;
    primaAnual?: number | null;
    moneda?: string;
    cliente: { id: string; nombre: string };
    aseguradora: { id: string; nombre: string };
    productoSeguro: { id: string; nombre: string; ramo: string };
  };
  onClick?: () => void;
}

const RAMO_COLORS: Record<string, string> = {
  AUTO: '#3B82F6',
  HOGAR: '#22C55E',
  VIDA: '#A855F7',
  SALUD: '#EF4444',
  GASTOS_MEDICOS: '#F97316',
  EMPRESARIAL: '#6366F1',
  RESPONSABILIDAD_CIVIL: '#EC4899',
  INCENDIO: '#F59E0B',
  TRANSPORTE: '#06B6D4',
  AHORRO: '#84CC16',
  JUBILACION: '#8B5CF6',
  OTROS: '#6B7280',
};

const ESTADO_COLORS: Record<string, string> = {
  ACTIVA: 'bg-green-100 text-green-700 border-green-200',
  PROXIMA_A_VENCER: 'bg-amber-100 text-amber-700 border-amber-200',
  VENCIDA: 'bg-red-100 text-red-700 border-red-200',
  CANCELADA: 'bg-gray-100 text-gray-500 border-gray-200',
  EN_TRAMITE: 'bg-blue-100 text-blue-700 border-blue-200',
};

export function PolizaCard({ poliza, onClick }: PolizaCardProps) {
  const ramoColor = RAMO_COLORS[poliza.productoSeguro.ramo] || RAMO_COLORS.OTROS;
  const estadoClass = ESTADO_COLORS[poliza.estado] || 'bg-gray-100 text-gray-700';

  const daysUntilExpiry = Math.ceil(
    (new Date(poliza.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-l-4 overflow-hidden"
      style={{ borderLeftColor: ramoColor }}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: ramoColor }}
            >
              {poliza.productoSeguro.ramo.substring(0, 2)}
            </div>
            <div>
              <p className="font-semibold text-sm">{poliza.numeroPoliza}</p>
              <p className="text-xs text-muted-foreground">{poliza.productoSeguro.nombre}</p>
            </div>
          </div>
          <Badge variant="outline" className={estadoClass}>
            {poliza.estado.replace('_', ' ')}
          </Badge>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-3.5 h-3.5" />
            <span>{poliza.cliente.nombre}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="w-3.5 h-3.5" />
            <span>{poliza.aseguradora.nombre}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span className={daysUntilExpiry <= 30 ? 'text-red-600 font-medium' : ''}>
              Vence: {new Date(poliza.fechaVencimiento).toLocaleDateString('es-ES')}
              {daysUntilExpiry > 0 && daysUntilExpiry <= 30 && (
                <span className="ml-1 text-xs">({daysUntilExpiry} días)</span>
              )}
            </span>
          </div>
          {poliza.primaAnual && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Euro className="w-3.5 h-3.5" />
              <span>
                {poliza.primaAnual.toLocaleString('es-ES')} {poliza.moneda || 'EUR'}/año
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
