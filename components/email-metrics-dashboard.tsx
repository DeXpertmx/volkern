
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  Mail,
  Eye,
  MousePointer,
  DollarSign,
  Clock,
  Target,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

interface EmailMetricsProps {
  campanaId: string;
}

interface Metricas {
  total: number;
  enviados: number;
  abiertos: number;
  clicados: number;
  convertidos: number;
  rebotados: number;
  tasaApertura: number;
  tasaClic: number;
  tasaConversion: number;
  tasaRebote: number;
  engagementScore: number;
  roi: number;
  timeline: Array<{
    fecha: string;
    enviados: number;
    abiertos: number;
    clicados: number;
    convertidos: number;
  }>;
  aperturasPorHora: Array<{
    hora: number;
    aperturas: number;
  }>;
  mejorHora: { hora: number; aperturas: number } | null;
  costoPorConversion: number;
  valorGenerado: number;
}

export function EmailMetricsDashboard({ campanaId }: EmailMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState<Metricas | null>(null);

  useEffect(() => {
    cargarMetricas();
  }, [campanaId]);

  const cargarMetricas = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/email-campanas/${campanaId}/metrics`);
      if (res.ok) {
        const data = await res.json();
        setMetricas(data);
      } else {
        toast.error("Error al cargar métricas");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Métricas Avanzadas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Cargando métricas...</p>
        </CardContent>
      </Card>
    );
  }

  if (!metricas) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Métricas Avanzadas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No hay datos disponibles</p>
        </CardContent>
      </Card>
    );
  }

  const getEngagementColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const getEngagementBadge = (score: number) => {
    if (score >= 70) return "Excelente";
    if (score >= 40) return "Bueno";
    return "Bajo";
  };

  return (
    <div className="space-y-6">
      {/* Resumen de KPIs principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Apertura</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.tasaApertura.toFixed(2)}%</div>
            <Progress value={metricas.tasaApertura} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metricas.abiertos} de {metricas.enviados} abiertos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Clic</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.tasaClic.toFixed(2)}%</div>
            <Progress value={metricas.tasaClic} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metricas.clicados} clics registrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.tasaConversion.toFixed(2)}%</div>
            <Progress value={metricas.tasaConversion} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metricas.convertidos} conversiones
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
              {metricas.roi.toFixed(0)}%
            </div>
            {metricas.roi >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600 mt-2" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600 mt-2" />
            )}
            <p className="text-xs text-muted-foreground mt-2">
              ${metricas.valorGenerado.toFixed(2)} generados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Engagement Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Engagement Score</CardTitle>
              <CardDescription>Indicador general de compromiso de la audiencia</CardDescription>
            </div>
            <Badge variant="outline" className={getEngagementColor(metricas.engagementScore)}>
              {getEngagementBadge(metricas.engagementScore)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-bold ${getEngagementColor(metricas.engagementScore)}`}>
              {metricas.engagementScore.toFixed(0)}
            </div>
            <div className="flex-1">
              <Progress value={metricas.engagementScore} className="h-4" />
              <p className="text-sm text-muted-foreground mt-2">
                Calculado en base a tasas de apertura (30%), clic (40%) y conversión (30%)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs para análisis detallados */}
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="horas">Mejores Horarios</TabsTrigger>
          <TabsTrigger value="costos">Análisis de Costos</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por Día</CardTitle>
              <CardDescription>Evolución de las métricas a lo largo del tiempo</CardDescription>
            </CardHeader>
            <CardContent>
              {metricas.timeline.length > 0 ? (
                <div className="space-y-4">
                  {metricas.timeline.map((dia, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{new Date(dia.fecha).toLocaleDateString('es-ES')}</span>
                        <span className="text-muted-foreground">{dia.enviados} enviados</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Abiertos: </span>
                          <span className="font-medium">{dia.abiertos}</span>
                          <span className="text-muted-foreground ml-1">
                            ({dia.enviados > 0 ? ((dia.abiertos / dia.enviados) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Clics: </span>
                          <span className="font-medium">{dia.clicados}</span>
                          <span className="text-muted-foreground ml-1">
                            ({dia.enviados > 0 ? ((dia.clicados / dia.enviados) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Conversiones: </span>
                          <span className="font-medium">{dia.convertidos}</span>
                          <span className="text-muted-foreground ml-1">
                            ({dia.enviados > 0 ? ((dia.convertidos / dia.enviados) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No hay datos suficientes para mostrar el timeline
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="horas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Aperturas por Hora del Día</CardTitle>
              <CardDescription>Identifica el mejor momento para enviar tus campañas</CardDescription>
            </CardHeader>
            <CardContent>
              {metricas.mejorHora && (
                <div className="mb-6 p-4 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Mejor Hora para Enviar</p>
                      <p className="text-sm text-muted-foreground">
                        {metricas.mejorHora.hora}:00 - {metricas.mejorHora.hora + 1}:00 con{" "}
                        {metricas.mejorHora.aperturas} aperturas
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {metricas.aperturasPorHora.length > 0 ? (
                  metricas.aperturasPorHora.map((hora, idx) => {
                    const maxAperturas = Math.max(...metricas.aperturasPorHora.map(h => h.aperturas))
                    const porcentaje = maxAperturas > 0 ? (hora.aperturas / maxAperturas) * 100 : 0
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="w-20">
                            {hora.hora.toString().padStart(2, '0')}:00
                          </span>
                          <div className="flex-1 mx-4">
                            <Progress value={porcentaje} className="h-2" />
                          </div>
                          <span className="w-16 text-right text-muted-foreground">
                            {hora.aperturas}
                          </span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No hay datos de aperturas para analizar
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Análisis de Costos y Retorno</CardTitle>
              <CardDescription>Métricas financieras de la campaña</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Costo por Conversión</p>
                    <p className="text-3xl font-bold">
                      ${metricas.costoPorConversion.toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Valor Generado</p>
                    <p className="text-3xl font-bold text-green-600">
                      ${metricas.valorGenerado.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Desglose de Rendimiento</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Total Enviados</span>
                      <span className="font-medium">{metricas.enviados}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Conversiones</span>
                      <span className="font-medium">{metricas.convertidos}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Tasa de Rebote</span>
                      <span className="font-medium">{metricas.tasaRebote.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between py-2 pt-4 font-bold">
                      <span>ROI Total</span>
                      <span className={metricas.roi >= 0 ? "text-green-600" : "text-red-600"}>
                        {metricas.roi.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {metricas.roi < 0 && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Consejo:</strong> El ROI es negativo. Considera revisar tu segmentación de audiencia,
                      mejorar el contenido del email, o ajustar tu estrategia de conversión.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
