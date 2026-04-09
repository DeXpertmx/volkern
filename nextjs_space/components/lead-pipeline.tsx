
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface PipelineStage {
  value: string;
  label: string;
  color: string;
}

const stages: PipelineStage[] = [
  { value: 'nuevo', label: 'Nuevo', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'contactado', label: 'Contactado', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'agendado', label: 'Agendado', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'pagado', label: 'Pagado', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'convertido', label: 'Convertido', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'inactivo', label: 'Inactivo', color: 'bg-gray-100 text-gray-800 border-gray-200' }
];

interface LeadPipelineProps {
  leadId: string;
  currentStage: string;
  tiempoEnEstado: string;
  onStageChange: (newStage: string) => void;
}

export function LeadPipeline({ leadId, currentStage, tiempoEnEstado, onStageChange }: LeadPipelineProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleStageClick = async (newStage: string) => {
    if (newStage === currentStage) return;

    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: newStage })
      });

      if (!res.ok) throw new Error('Error al actualizar el estado');

      toast.success(`Lead movido a ${stages.find(s => s.value === newStage)?.label}`);
      onStageChange(newStage);
    } catch (error) {
      console.error('Error updating stage:', error);
      toast.error('Error al actualizar el estado');
    }
  };

  const tiempoEnEstadoTexto = () => {
    try {
      const tiempo = formatDistanceToNow(new Date(tiempoEnEstado), { 
        locale: es,
        addSuffix: false 
      });
      return tiempo;
    } catch {
      return '0 días';
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1">Pipeline del Lead</h3>
        <p className="text-sm text-muted-foreground flex items-center">
          <Clock className="h-4 w-4 mr-1" />
          {tiempoEnEstadoTexto()} en "{stages.find(s => s.value === currentStage)?.label}"
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stages.map((stage) => (
          <button
            key={stage.value}
            onClick={() => handleStageClick(stage.value)}
            className={`
              relative p-4 rounded-lg border-2 transition-all duration-200 text-center
              ${stage.value === currentStage 
                ? `${stage.color} border-current shadow-md scale-105` 
                : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }
              ${stage.value !== currentStage && 'cursor-pointer'}
            `}
          >
            <div className="text-sm font-semibold">
              {stage.label}
            </div>
            {stage.value === currentStage && (
              <div className="absolute -top-2 -right-2">
                <div className="bg-primary text-white rounded-full h-6 w-6 flex items-center justify-center text-xs">
                  ✓
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 p-3 bg-muted rounded-lg">
        <p className="text-xs text-muted-foreground">
          💡 <strong>Tip:</strong> Haz clic en cualquier etapa para mover el lead instantáneamente
        </p>
      </div>
    </Card>
  );
}
