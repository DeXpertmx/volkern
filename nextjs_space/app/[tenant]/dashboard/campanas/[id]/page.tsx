
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  Mail,
  MousePointer,
  TrendingUp,
  AlertCircle,
  Calendar,
  Users,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ABTestResults } from '@/components/abtest-results';

interface CampaignDetails {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo: string;
  estado: string;
  canales: string[];
  targetType: string;
  targetConfig: any;
  fechaProgramada?: string;
  fechaCreacion: string;
  fechaInicio?: string;
  fechaCompletado?: string;
  totalDestinatarios: number;
  totalEnviados: number;
  totalEntregados: number;
  totalAbiertos: number;
  totalClicks: number;
  totalConversiones: number;
  totalErrores: number;
  mensajes: any[];
  executions: any[];
  metrics: any[];
}

const estadoBadgeColor: Record<string, string> = {
  borrador: 'bg-gray-500',
  programada: 'bg-blue-500',
  en_curso: 'bg-yellow-500',
  completada: 'bg-green-500',
  pausada: 'bg-orange-500',
  cancelada: 'bg-red-500',
};

const estadoExecutionBadgeColor: Record<string, string> = {
  pendiente: 'bg-gray-500',
  enviando: 'bg-blue-500',
  enviado: 'bg-yellow-500',
  entregado: 'bg-green-500',
  abierto: 'bg-purple-500',
  click: 'bg-indigo-500',
  convertido: 'bg-emerald-500',
  error: 'bg-red-500',
};

export default function CampanaDetallesPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [campana, setCampana] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarCampana();
  }, []);

  const cargarCampana = async () => {
    try {
      const res = await fetch(`/api/campanas/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setCampana(data);
      }
    } catch (error) {
      console.error('Error cargando campaña:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!campana) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Campaña no encontrada</h3>
          <Button onClick={() => router.push('/dashboard/campanas')}>
            Volver a Campañas
          </Button>
        </div>
      </div>
    );
  }

  const tasaEntrega = campana.totalEnviados > 0
    ? (campana.totalEntregados / campana.totalEnviados) * 100
    : 0;
  const tasaApertura = campana.totalEntregados > 0
    ? (campana.totalAbiertos / campana.totalEntregados) * 100
    : 0;
  const tasaClick = campana.totalAbiertos > 0
    ? (campana.totalClicks / campana.totalAbiertos) * 100
    : 0;
  const tasaConversion = campana.totalClicks > 0
    ? (campana.totalConversiones / campana.totalClicks) * 100
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/campanas')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{campana.nombre}</h1>
              <Badge className={estadoBadgeColor[campana.estado]}>
                {campana.estado}
              </Badge>
            </div>
            {campana.descripcion && (
              <p className="text-muted-foreground mt-1">{campana.descripcion}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Creada el {format(new Date(campana.fechaCreacion), "d 'de' MMMM, yyyy", {
                  locale: es,
                })}
              </div>
              {campana.fechaInicio && (
                <div className="flex items-center gap-1">
                  <Send className="h-4 w-4" />
                  Iniciada el {format(new Date(campana.fechaInicio), "d 'de' MMMM, yyyy HH:mm", {
                    locale: es,
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Destinatarios</p>
                <p className="text-3xl font-bold">{campana.totalDestinatarios}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Enviados</p>
                <p className="text-3xl font-bold">{campana.totalEnviados}</p>
              </div>
              <Send className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Entregados</p>
                <p className="text-3xl font-bold">{campana.totalEntregados}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tasaEntrega.toFixed(1)}% tasa
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Abiertos</p>
                <p className="text-3xl font-bold">{campana.totalAbiertos}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tasaApertura.toFixed(1)}% tasa
                </p>
              </div>
              <Mail className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Métricas secundarias */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Clicks</p>
                <p className="text-2xl font-bold">{campana.totalClicks}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tasaClick.toFixed(1)}% CTR
                </p>
              </div>
              <MousePointer className="h-8 w-8 text-indigo-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversiones</p>
                <p className="text-2xl font-bold">{campana.totalConversiones}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tasaConversion.toFixed(1)}% tasa
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Errores</p>
                <p className="text-2xl font-bold">{campana.totalErrores}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {campana.totalEnviados > 0
                    ? ((campana.totalErrores / campana.totalEnviados) * 100).toFixed(1)
                    : 0}% tasa
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embudo de conversión */}
      <Card>
        <CardHeader>
          <CardTitle>Embudo de Conversión</CardTitle>
          <CardDescription>
            Visualización del recorrido de los destinatarios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Enviados</span>
                <span className="text-muted-foreground">{campana.totalEnviados}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-500 h-3 rounded-full"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Entregados</span>
                <span className="text-muted-foreground">
                  {campana.totalEntregados} ({tasaEntrega.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full"
                  style={{ width: `${tasaEntrega}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Abiertos</span>
                <span className="text-muted-foreground">
                  {campana.totalAbiertos} ({tasaApertura.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-orange-500 h-3 rounded-full"
                  style={{ width: `${tasaApertura}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Clicks</span>
                <span className="text-muted-foreground">
                  {campana.totalClicks} ({tasaClick.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-indigo-500 h-3 rounded-full"
                  style={{ width: `${tasaClick}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Conversiones</span>
                <span className="text-muted-foreground">
                  {campana.totalConversiones} ({tasaConversion.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-emerald-500 h-3 rounded-full"
                  style={{ width: `${tasaConversion}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs con detalles */}
      <Tabs defaultValue={campana.tipo === 'a_b_test' ? 'abtest' : 'mensajes'} className="space-y-4">
        <TabsList>
          {campana.tipo === 'a_b_test' && (
            <TabsTrigger value="abtest">Resultados A/B Test</TabsTrigger>
          )}
          <TabsTrigger value="mensajes">Mensajes</TabsTrigger>
          <TabsTrigger value="ejecuciones">Ejecuciones</TabsTrigger>
          <TabsTrigger value="metricas">Métricas por Canal</TabsTrigger>
        </TabsList>

        {/* Tab de A/B Test */}
        {campana.tipo === 'a_b_test' && (
          <TabsContent value="abtest">
            <ABTestResults 
              campanaId={campana.id} 
            />
          </TabsContent>
        )}

        <TabsContent value="mensajes">
          <Card>
            <CardHeader>
              <CardTitle>Mensajes de la Campaña</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {campana.mensajes.map((mensaje) => (
                <div key={mensaje.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge>{mensaje.canal}</Badge>
                    {mensaje.asunto && (
                      <span className="text-sm font-medium">{mensaje.asunto}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {mensaje.contenido}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ejecuciones">
          <Card>
            <CardHeader>
              <CardTitle>Ejecuciones Individuales</CardTitle>
              <CardDescription>
                Historial de envíos a cada destinatario
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha Envío</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campana.executions.slice(0, 50).map((exec) => (
                    <TableRow key={exec.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{exec.destinatarioNombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {exec.destinatarioEmail || exec.destinatarioTelefono}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{exec.canal}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={estadoExecutionBadgeColor[exec.estado]}>
                          {exec.estado}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {exec.fechaEnviado
                          ? format(new Date(exec.fechaEnviado), 'dd/MM/yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-red-500">
                        {exec.errorMensaje || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {campana.executions.length > 50 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Mostrando 50 de {campana.executions.length} ejecuciones
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metricas">
          <Card>
            <CardHeader>
              <CardTitle>Métricas por Canal</CardTitle>
              <CardDescription>
                Rendimiento detallado de cada canal de comunicación
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead>Enviados</TableHead>
                    <TableHead>Entregados</TableHead>
                    <TableHead>Abiertos</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Conversiones</TableHead>
                    <TableHead>Tasa Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campana.metrics
                    .filter((m) => m.canal !== null)
                    .map((metric) => (
                      <TableRow key={metric.id}>
                        <TableCell>
                          <Badge variant="outline">{metric.canal}</Badge>
                        </TableCell>
                        <TableCell>{metric.enviados}</TableCell>
                        <TableCell>{metric.entregados}</TableCell>
                        <TableCell>{metric.abiertos}</TableCell>
                        <TableCell>{metric.clicks}</TableCell>
                        <TableCell>{metric.conversiones}</TableCell>
                        <TableCell>{metric.tasaEntrega.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
