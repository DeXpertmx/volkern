
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Plus,
  Play,
  Pause,
  X,
  BarChart3,
  Calendar,
  Users,
  Mail,
  MessageSquare,
  Filter,
  Search,
  Sparkles,
  Edit,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Campaign {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo: string;
  estado: string;
  canales: string[];
  targetType: string;
  fechaProgramada?: string;
  totalDestinatarios: number;
  totalEnviados: number;
  totalEntregados: number;
  totalAbiertos: number;
  totalClicks: number;
  totalConversiones: number;
  totalErrores: number;
  fechaCreacion: string;
  fechaInicio?: string;
  fechaCompletado?: string;
  _count?: {
    executions: number;
  };
}

const estadoBadgeColor: Record<string, string> = {
  borrador: 'bg-gray-500',
  programada: 'bg-blue-500',
  en_curso: 'bg-yellow-500',
  completada: 'bg-green-500',
  pausada: 'bg-orange-500',
  cancelada: 'bg-red-500',
};

const canalIcons: Record<string, any> = {
  whatsapp: MessageSquare,
  email: Mail,
  sms: MessageSquare,
  telegram: Send,
  facebook: MessageSquare,
  instagram: MessageSquare,
};

export default function CampanasPage() {
  const router = useRouter();
  const [campanas, setCampanas] = useState<Campaign[]>([]);
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('campanas');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [filtroTipo, setFiltroTipo] = useState<string>('all');
  const [campanaAEliminar, setCampanaAEliminar] = useState<string | null>(null);

  useEffect(() => {
    cargarCampanas();
    cargarPlantillas();
  }, [filtroEstado, filtroTipo]);

  const cargarPlantillas = async () => {
    try {
      const res = await fetch('/api/cms/templates?type=email');
      if (!res.ok) throw new Error('Error al cargar plantillas');
      const data = await res.json();
      setPlantillas(data.templates || []);
    } catch (error: any) {
      console.error('Error cargando plantillas:', error);
    }
  };

  const cargarCampanas = async () => {
    try {
      const params = new URLSearchParams();
      if (filtroEstado !== 'all') params.append('estado', filtroEstado);
      if (filtroTipo !== 'all') params.append('tipo', filtroTipo);

      const res = await fetch(`/api/campanas?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCampanas(data);
      }
    } catch (error) {
      console.error('Error cargando campañas:', error);
      toast.error('Error al cargar campañas');
    } finally {
      setLoading(false);
    }
  };

  const ejecutarCampana = async (id: string) => {
    try {
      const res = await fetch(`/api/campanas/${id}/ejecutar`, {
        method: 'POST',
      });

      if (res.ok) {
        toast.success('Campaña iniciada correctamente');
        cargarCampanas();
      } else {
        toast.error('Error al ejecutar campaña');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al ejecutar campaña');
    }
  };

  const pausarCampana = async (id: string) => {
    try {
      const res = await fetch(`/api/campanas/${id}/pausar`, {
        method: 'POST',
      });

      if (res.ok) {
        toast.success('Campaña pausada');
        cargarCampanas();
      } else {
        toast.error('Error al pausar campaña');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al pausar campaña');
    }
  };

  const reanudarCampana = async (id: string) => {
    try {
      const res = await fetch(`/api/campanas/${id}/reanudar`, {
        method: 'POST',
      });

      if (res.ok) {
        toast.success('Campaña reanudada');
        cargarCampanas();
      } else {
        toast.error('Error al reanudar campaña');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al reanudar campaña');
    }
  };

  const cancelarCampana = async (id: string) => {
    try {
      const res = await fetch(`/api/campanas/${id}/cancelar`, {
        method: 'POST',
      });

      if (res.ok) {
        toast.success('Campaña cancelada');
        cargarCampanas();
      } else {
        toast.error('Error al cancelar campaña');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cancelar campaña');
    }
  };

  const eliminarCampana = async () => {
    if (!campanaAEliminar) return;

    try {
      const res = await fetch(`/api/campanas/${campanaAEliminar}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Campaña eliminada');
        cargarCampanas();
      } else {
        toast.error('Error al eliminar campaña');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar campaña');
    } finally {
      setCampanaAEliminar(null);
    }
  };

  const campanasFiltradas = campanas.filter((campana) =>
    campana.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Campañas Multicanal</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona y ejecuta campañas de marketing en múltiples canales
          </p>
        </div>
        <Button onClick={() => router.push('/dashboard/campanas/nueva')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Campaña
        </Button>
        <Button variant="outline" onClick={() => router.push('/dashboard/email-campanas/audiencias')}>
          <UserPlus className="h-4 w-4 mr-2" />
          Audiencias
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="campanas">Campañas</TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-2">
            <Sparkles className="h-3 w-3" />
            Plantillas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanas" className="space-y-6">
      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Campañas</p>
                <p className="text-2xl font-bold">{campanas.length}</p>
              </div>
              <Send className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Activas</p>
                <p className="text-2xl font-bold">
                  {campanas.filter((c) => c.estado === 'en_curso').length}
                </p>
              </div>
              <Play className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completadas</p>
                <p className="text-2xl font-bold">
                  {campanas.filter((c) => c.estado === 'completada').length}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Enviados</p>
                <p className="text-2xl font-bold">
                  {campanas.reduce((sum, c) => sum + c.totalEnviados, 0)}
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y búsqueda */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar campañas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="programada">Programada</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="completada">Completada</SelectItem>
                <SelectItem value="pausada">Pausada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="automatica">Automática</SelectItem>
                <SelectItem value="a_b_test">Prueba A/B</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de campañas */}
      {campanasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Send className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay campañas</h3>
              <p className="text-muted-foreground mb-4">
                Crea tu primera campaña multicanal para comenzar
              </p>
              <Button onClick={() => router.push('/dashboard/campanas/nueva')}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Campaña
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {campanasFiltradas.map((campana) => (
            <Card key={campana.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{campana.nombre}</CardTitle>
                      <Badge className={estadoBadgeColor[campana.estado]}>
                        {campana.estado}
                      </Badge>
                      {campana.tipo === 'a_b_test' && (
                        <Badge variant="outline">A/B Test</Badge>
                      )}
                    </div>
                    {campana.descripcion && (
                      <CardDescription className="mt-2">
                        {campana.descripcion}
                      </CardDescription>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(campana.fechaCreacion), "d 'de' MMMM, yyyy", {
                          locale: es,
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        {campana.canales.map((canal) => {
                          const Icon = canalIcons[canal] || MessageSquare;
                          return <Icon key={canal} className="h-4 w-4" />;
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {campana.totalDestinatarios} destinatarios
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {campana.estado === 'borrador' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/dashboard/campanas/${campana.id}/editar`)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => ejecutarCampana(campana.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Ejecutar
                        </Button>
                      </>
                    )}
                    {campana.estado === 'en_curso' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pausarCampana(campana.id)}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Pausar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => cancelarCampana(campana.id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancelar
                        </Button>
                      </>
                    )}
                    {campana.estado === 'pausada' && (
                      <Button
                        size="sm"
                        onClick={() => reanudarCampana(campana.id)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Reanudar
                      </Button>
                    )}
                    {(campana.estado === 'completada' || campana.estado === 'cancelada') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/campanas/${campana.id}`)}
                      >
                        <BarChart3 className="h-4 w-4 mr-1" />
                        Ver Resultados
                      </Button>
                    )}
                    {(campana.estado === 'borrador' || campana.estado === 'cancelada') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCampanaAEliminar(campana.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {(campana.totalEnviados > 0 || campana.estado !== 'borrador') && (
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Enviados</p>
                      <p className="font-semibold">{campana.totalEnviados}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entregados</p>
                      <p className="font-semibold">{campana.totalEntregados}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Abiertos</p>
                      <p className="font-semibold">{campana.totalAbiertos}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Clicks</p>
                      <p className="font-semibold">{campana.totalClicks}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Conversiones</p>
                      <p className="font-semibold">{campana.totalConversiones}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Errores</p>
                      <p className="font-semibold text-red-500">{campana.totalErrores}</p>
                    </div>
                  </div>
                  {campana.totalEnviados > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Tasa de entrega</span>
                        <span>
                          {((campana.totalEntregados / campana.totalEnviados) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{
                            width: `${(campana.totalEntregados / campana.totalEnviados) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={!!campanaAEliminar} onOpenChange={() => setCampanaAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los datos asociados a esta
              campaña.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarCampana}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>
        
        <TabsContent value="plantillas" className="space-y-6">
        {plantillas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay plantillas profesionales</h3>
              <p className="text-muted-foreground text-center mb-4">
                Diseña hermosa plantillas con nuestro editor visual avanzado
              </p>
              <Button onClick={() => router.push('/template-editor/email/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Primera Plantilla
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plantillas.map((plantilla) => (
              <Card key={plantilla.id} className="group relative overflow-hidden hover:shadow-lg transition-all border-none bg-white">
                <div className="aspect-[4/5] bg-slate-100 relative overflow-hidden flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                  <Mail className="w-12 h-12 text-slate-300 group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => router.push(`/template-editor/email/${plantilla.id}`)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  </div>
                </div>
                <CardHeader className="p-4">
                  <CardTitle className="text-lg truncate">{plantilla.nombre}</CardTitle>
                  <CardDescription className="flex items-center justify-between mt-1">
                    <span>{plantilla.categoria}</span>
                    {plantilla.esOficial && <Badge variant="secondary">Oficial</Badge>}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
      </Tabs>
    </div>
  );
}
