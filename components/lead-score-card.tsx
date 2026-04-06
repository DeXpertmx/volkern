
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Flame,
  Sun,
  Snowflake,
  Moon,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  History,
  Award,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface LeadScoreData {
  score: {
    id: string;
    leadId: string;
    puntuacion: number;
    categoria: string | null;
    puntuacionDemografica: number;
    puntuacionComportamiento: number;
    puntuacionInteraccion: number;
    puntuacionEngagement: number;
    ultimaActualizacion: string;
  };
  history: Array<{
    id: string;
    puntuacionAnterior: number;
    puntuacionNueva: number;
    cambio: number;
    razon: string;
    categoria: string | null;
    fechaCreacion: string;
  }>;
}

interface LeadScoreCardProps {
  leadId: string;
}

const categoryIcons: Record<string, any> = {
  A: Flame,
  B: Sun,
  C: Snowflake,
  D: Moon,
};

const categoryColors: Record<string, string> = {
  A: 'bg-red-500',
  B: 'bg-orange-500',
  C: 'bg-blue-500',
  D: 'bg-gray-500',
};

const categoryLabels: Record<string, string> = {
  A: 'Lead Caliente 🔥',
  B: 'Lead Tibio ☀️',
  C: 'Lead Frío ❄️',
  D: 'Lead Inactivo 💤',
};

export default function LeadScoreCard({ leadId }: LeadScoreCardProps) {
  const [data, setData] = useState<LeadScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [aiScoring, setAiScoring] = useState(false);

  const fetchScore = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/scoring/lead/${leadId}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error cargando score:', error);
      toast.error('Error cargando score del lead');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      const response = await fetch(`/api/scoring/lead/${leadId}`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          `Score recalculado: ${result.puntuacionAnterior} → ${result.puntuacionNueva}`
        );
        await fetchScore();
      } else {
        toast.error('Error recalculando score');
      }
    } catch (error) {
      console.error('Error recalculando score:', error);
      toast.error('Error recalculando score');
    } finally {
      setRecalculating(false);
    }
  };

  const handleAIScore = async () => {
    try {
      setAiScoring(true);
      const response = await fetch(`/api/leads/${leadId}/score`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(
          `Análisis de IA completado: Score ${result.puntuacion}`
        );
        await fetchScore();
      } else {
        toast.error('Error al generar score con IA');
      }
    } catch (error) {
      console.error('Error in AI scoring:', error);
      toast.error('Error al generar score con IA');
    } finally {
      setAiScoring(false);
    }
  };

  useEffect(() => {
    fetchScore();
  }, [leadId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Puntuación del Lead</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.score) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Puntuación del Lead</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No hay datos de puntuación disponibles</p>
          <Button onClick={handleRecalculate} className="mt-4" disabled={recalculating}>
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
            Calcular Score
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { score, history } = data;
  const Icon = score.categoria ? categoryIcons[score.categoria] : Award;
  const colorClass = score.categoria ? categoryColors[score.categoria] : 'bg-gray-500';
  const label = score.categoria ? categoryLabels[score.categoria] : 'Sin categoría';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Puntuación del Lead</CardTitle>
            <CardDescription>Basada en comportamiento y engagement</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleAIScore}
              disabled={aiScoring || recalculating}
              className="bg-indigo-600 hover:bg-indigo-700 h-8"
            >
              <Sparkles className={`w-3.5 h-3.5 mr-1.5 ${aiScoring ? 'animate-pulse' : ''}`} />
              {aiScoring ? 'Analizando...' : 'Calificar con IA'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculate}
              disabled={recalculating || aiScoring}
              className="h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recalculating ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Score principal */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${colorClass}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{score.puntuacion}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              </div>
              {score.categoria === 'A' && (
                <Badge variant="default" className="bg-red-500 hover:bg-red-600 animate-pulse">
                  PRIORIDAD ALTA
                </Badge>
              )}
            </div>

            {/* AI Reasoning (if available) */}
            {history[0]?.categoria === 'ia_evaluation' && (
              <div className="p-3 border border-indigo-100 bg-indigo-50/30 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-indigo-700 font-medium text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  ANÁLISIS DE IA:
                </div>
                <p className="text-sm text-indigo-900 leading-relaxed italic">
                  "{history[0].razon.replace('IA: ', '')}"
                </p>
              </div>
            )}

            {/* Desglose por categoría */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Desglose de Puntuación</h4>

              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Demográfica</span>
                    <span className="text-sm font-medium">{score.puntuacionDemografica}</span>
                  </div>
                  <Progress value={(score.puntuacionDemografica / score.puntuacion) * 100} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Comportamiento</span>
                    <span className="text-sm font-medium">{score.puntuacionComportamiento}</span>
                  </div>
                  <Progress value={(score.puntuacionComportamiento / score.puntuacion) * 100} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Interacción</span>
                    <span className="text-sm font-medium">{score.puntuacionInteraccion}</span>
                  </div>
                  <Progress value={(score.puntuacionInteraccion / score.puntuacion) * 100} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Engagement</span>
                    <span className="text-sm font-medium">{score.puntuacionEngagement}</span>
                  </div>
                  <Progress value={(score.puntuacionEngagement / score.puntuacion) * 100} />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <History className="w-8 h-8 mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No hay historial de cambios</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      {item.cambio > 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{item.razon}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.fechaCreacion).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={item.cambio > 0 ? 'default' : 'destructive'}>
                      {item.cambio > 0 ? '+' : ''}
                      {item.cambio}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
