'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Users, 
  CheckCircle, 
  XCircle,
  Clock,
  Mail,
  Eye,
  BarChart3,
  TrendingUp,
  MousePointerClick,
  DollarSign
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ABTestResults } from '@/components/abtest-results';
import { EmailMetricsDashboard } from '@/components/email-metrics-dashboard';
import { Progress } from '@/components/ui/progress';

interface CampanaDetalle {
  id: string;
  nombre: string;
  asunto: string;
  estado: string;
  esABTest: boolean;
  objetivoConversion?: string;
  totalDestinatarios: number;
  totalEnviados: number;
  totalFallidos: number;
  totalAbiertos: number;
  totalClics: number;
  totalConversiones: number;
  valorConversion?: number;
  costoTotal?: number;
  roiCalculado?: number;
  fechaEnvio: string | null;
}

interface Analytics {
  metricas: {
    totalDestinatarios: number;
    totalEnviados: number;
    totalAbiertos: number;
    totalClics: number;
    totalConversiones: number;
    totalFallidos: number;
  };
  tasas: {
    entrega: number;
    apertura: number;
    clic: number;
    conversion: number;
    rebote: number;
  };
  timeline: {
    aperturasPorHora: Array<{ hora: string; cantidad: number }>;
  };
  rendimiento: {
    totalConversiones: number;
    valorTotal: number;
    valorPromedio: string;
    costoTotal: string;
    roi: number;
  };
}

export default function CampanaDetallePage() {
  const router = useRouter();
  const params = useParams();
  const [campana, setCampana] = useState<CampanaDetalle | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, [params.id]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setLoadingAnalytics(true);

      // Cargar datos básicos de la campaña
      const resCampana = await fetch(`/api/email-campanas/${params.id}`);
      if (resCampana.ok) {
        const dataCampana = await resCampana.json();
        setCampana(dataCampana);
      }

      // Cargar analytics
      const resAnalytics = await fetch(`/api/email-campanas/${params.id}/analytics`);
      if (resAnalytics.ok) {
        const dataAnalytics = await resAnalytics.json();
        setAnalytics(dataAnalytics);
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar los datos de la campaña');
    } finally {
      setLoading(false);
      setLoadingAnalytics(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!campana) {
    return (
      <div className="p-8">
        <p>Campaña no encontrada</p>
      </div>
    );
  }

  const getEstadoBadge = (estado: string) => {
    const variants: Record<string, string> = {
      'borrador': 'secondary',
      'programada': 'default',
      'enviando': 'default',
      'enviada': 'default',
      'pausada': 'secondary',
      'fallida': 'destructive'
    };
    return variants[estado] || 'secondary';
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard/email-campanas')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{campana.nombre}</h1>
              <p className="text-muted-foreground">{campana.asunto}</p>
            </div>
          </div>
        </div>
        <Badge variant={getEstadoBadge(campana.estado) as any}>
          {campana.estado}
        </Badge>
      </div>

      {/* Métricas principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Destinatarios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campana.totalDestinatarios}</div>
            <p className="text-xs text-muted-foreground">
              {campana.totalEnviados} enviados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aperturas</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campana.totalAbiertos}</div>
            <p className="text-xs text-muted-foreground">
              {analytics ? `${analytics.tasas.apertura.toFixed(1)}%` : '...'} tasa de apertura
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clics</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campana.totalClics}</div>
            <p className="text-xs text-muted-foreground">
              {analytics ? `${analytics.tasas.clic.toFixed(1)}%` : '...'} tasa de clic
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversiones</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campana.totalConversiones}</div>
            <p className="text-xs text-muted-foreground">
              {analytics ? `${analytics.tasas.conversion.toFixed(1)}%` : '...'} tasa de conversión
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campana.roiCalculado ? `${campana.roiCalculado.toFixed(0)}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {campana.valorConversion ? `$${campana.valorConversion.toFixed(2)} promedio` : 'Sin datos'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          {campana.esABTest && (
            <TabsTrigger value="abtest">A/B Testing</TabsTrigger>
          )}
          <TabsTrigger value="analytics">Analytics Avanzado</TabsTrigger>
        </TabsList>

        {/* Tab: Resumen */}
        <TabsContent value="overview" className="space-y-4">
          {loadingAnalytics ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">Cargando analytics...</p>
              </CardContent>
            </Card>
          ) : analytics && (
            <>
              {/* Tasas de engagement */}
              <Card>
                <CardHeader>
                  <CardTitle>Tasas de Engagement</CardTitle>
                  <CardDescription>
                    Rendimiento general de la campaña
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">Tasa de Entrega</span>
                      <span className="text-muted-foreground">
                        {analytics.tasas.entrega.toFixed(2)}%
                      </span>
                    </div>
                    <Progress value={analytics.tasas.entrega} className="h-2" />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">Tasa de Apertura</span>
                      <span className="text-muted-foreground">
                        {analytics.tasas.apertura.toFixed(2)}%
                      </span>
                    </div>
                    <Progress value={analytics.tasas.apertura} className="h-2" />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">Tasa de Clic</span>
                      <span className="text-muted-foreground">
                        {analytics.tasas.clic.toFixed(2)}%
                      </span>
                    </div>
                    <Progress value={analytics.tasas.clic} className="h-2" />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium">Tasa de Conversión</span>
                      <span className="text-muted-foreground">
                        {analytics.tasas.conversion.toFixed(2)}%
                      </span>
                    </div>
                    <Progress value={analytics.tasas.conversion} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Rendimiento y ROI */}
              {campana.objetivoConversion && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Conversiones</CardTitle>
                      <CardDescription>
                        Objetivo: {campana.objetivoConversion}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total</span>
                          <span className="font-medium">{analytics.rendimiento.totalConversiones}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Valor Total</span>
                          <span className="font-medium">${analytics.rendimiento.valorTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Valor Promedio</span>
                          <span className="font-medium">${analytics.rendimiento.valorPromedio}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>ROI</CardTitle>
                      <CardDescription>Retorno de inversión</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Costo Total</span>
                          <span className="font-medium">${analytics.rendimiento.costoTotal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Valor Generado</span>
                          <span className="font-medium">${analytics.rendimiento.valorTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="text-sm font-medium">ROI</span>
                          <span className={`font-bold ${analytics.rendimiento.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {analytics.rendimiento.roi.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab: A/B Testing */}
        {campana.esABTest && (
          <TabsContent value="abtest">
            <ABTestResults campanaId={campana.id} />
          </TabsContent>
        )}

        {/* Tab: Analytics Avanzado */}
        <TabsContent value="analytics" className="space-y-4">
          <EmailMetricsDashboard campanaId={campana.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
