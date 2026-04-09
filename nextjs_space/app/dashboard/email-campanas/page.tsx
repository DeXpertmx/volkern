
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  Plus, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle,
  Eye,
  Edit,
  Trash,
  Users,
  TrendingUp,
  Calendar,
  FileText,
  Sparkles
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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

interface EmailCampaign {
  id: string;
  nombre: string;
  asunto: string;
  estado: string;
  totalDestinatarios: number;
  totalEnviados: number;
  totalFallidos: number;
  fechaEnvio: string | null;
  fechaCreacion: string;
  plantilla?: { nombre: string };
  audiencia?: { nombre: string; totalLeads: number };
}

interface Plantilla {
  id: string;
  nombre: string;
  categoria: string;
  fechaActualizacion: string;
  esOficial: boolean;
}

export default function EmailCampanasPage() {
  const router = useRouter();
  const [campanas, setCampanas] = useState<EmailCampaign[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [estadoActual, setEstadoActual] = useState('todas');

  useEffect(() => {
    Promise.all([cargarCampanas(), cargarPlantillas()]);
  }, []);

  const cargarCampanas = async () => {
    try {
      const res = await fetch('/api/email-campanas');
      if (!res.ok) throw new Error('Error al cargar campañas');
      const data = await res.json();
      setCampanas(data);
    } catch (error: any) {
      toast.error('Error al cargar campañas');
      console.error(error);
    }
  };

  const cargarPlantillas = async () => {
    try {
      const res = await fetch('/api/cms/templates?type=email');
      if (!res.ok) throw new Error('Error al cargar plantillas');
      const data = await res.json();
      setPlantillas(data.templates || []);
    } catch (error: any) {
      console.error('Error cargando plantillas profesional:', error);
    } finally {
      setLoading(false);
    }
  };

  const eliminarCampana = async (id: string) => {
    try {
      const res = await fetch(`/api/email-campanas/${id}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }
      
      toast.success('Campaña eliminada exitosamente');
      cargarCampanas();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar campaña');
    } finally {
      setDeleteId(null);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const badges: Record<string, { variant: any; icon: any; label: string }> = {
      borrador: { variant: 'secondary', icon: Edit, label: 'Borrador' },
      programada: { variant: 'default', icon: Clock, label: 'Programada' },
      enviando: { variant: 'default', icon: Send, label: 'Enviando' },
      enviada: { variant: 'default', icon: CheckCircle, label: 'Enviada' },
      fallida: { variant: 'destructive', icon: XCircle, label: 'Fallida' },
      pausada: { variant: 'secondary', icon: Clock, label: 'Pausada' }
    };

    const badge = badges[estado] || badges.borrador;
    const Icon = badge.icon;

    return (
      <Badge variant={badge.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  const campanasFiltradas = campanas.filter(c => {
    if (estadoActual === 'todas') return true;
    if (estadoActual === 'borradores') return c.estado === 'borrador';
    if (estadoActual === 'programadas') return c.estado === 'programada';
    if (estadoActual === 'enviadas') return c.estado === 'enviada';
    return true;
  });

  // Estadísticas
  const stats = {
    total: campanas.length,
    borradores: campanas.filter(c => c.estado === 'borrador').length,
    programadas: campanas.filter(c => c.estado === 'programada').length,
    enviadas: campanas.filter(c => c.estado === 'enviada').length,
    totalEnviados: campanas.reduce((sum, c) => sum + c.totalEnviados, 0)
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
            <p className="text-muted-foreground">Cargando campañas...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Marketing</h1>
          <p className="text-muted-foreground mt-2">
            Crea y gestiona campañas de email para tus leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/template-editor/email/new')}>
            <FileText className="h-4 w-4 mr-2" />
            Gestionar Plantillas
          </Button>
          <Button 
            onClick={() => router.push('/dashboard/email-campanas/nueva')}
            size="lg"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva Campaña
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Campañas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Borradores</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.borradores}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Programadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.programadas}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enviadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.enviadas}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Emails Enviados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEnviados}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs y Lista */}
      <Tabs value={estadoActual} onValueChange={setEstadoActual}>
        <TabsList>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="borradores">Borradores</TabsTrigger>
          <TabsTrigger value="programadas">Programadas</TabsTrigger>
          <TabsTrigger value="enviadas">Enviadas</TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-2">
            <Sparkles className="h-3 w-3" />
            Plantillas
          </TabsTrigger>
        </TabsList>

        <TabsContent value={estadoActual} className="mt-6">
          {campanasFiltradas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay campañas</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {estadoActual === 'todas' 
                    ? 'Crea tu primera campaña de email para comenzar'
                    : `No hay campañas en estado "${estadoActual}"`}
                </p>
                <Button onClick={() => router.push('/dashboard/email-campanas/nueva')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Campaña
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {campanasFiltradas.map((campana) => (
                <Card key={campana.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-xl">{campana.nombre}</CardTitle>
                          {getEstadoBadge(campana.estado)}
                        </div>
                        <CardDescription className="text-base">
                          {campana.asunto}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/email-campanas/${campana.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {['borrador', 'fallida'].includes(campana.estado) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/dashboard/email-campanas/${campana.id}/editar`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteId(campana.id)}
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Destinatarios:</span>
                        <span className="font-semibold">{campana.totalDestinatarios}</span>
                      </div>
                      
                      {campana.estado === 'enviada' && (
                        <>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-muted-foreground">Enviados:</span>
                            <span className="font-semibold">{campana.totalEnviados}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span className="text-muted-foreground">Fallidos:</span>
                            <span className="font-semibold">{campana.totalFallidos}</span>
                          </div>
                        </>
                      )}
                      
                      {campana.fechaEnvio && campana.estado === 'programada' && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Programada:</span>
                          <span className="font-semibold">
                            {new Date(campana.fechaEnvio).toLocaleDateString('es-MX')}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Creada:</span>
                        <span className="font-semibold">
                          {new Date(campana.fechaCreacion).toLocaleDateString('es-MX')}
                        </span>
                      </div>
                    </div>

                    {campana.audiencia && (
                      <div className="mt-3 pt-3 border-t">
                        <span className="text-sm text-muted-foreground">
                          Audiencia: <span className="font-medium">{campana.audiencia.nombre}</span>
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="plantillas" className="mt-6">
          {plantillas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay plantillas profesionales</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Diseña hermosas plantillas con nuestro editor visual avanzado
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
                <Card key={plantilla.id} className="group relative overflow-hidden hover:shadow-lg transition-all border-none bg-white premium-shadow">
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

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La campaña será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && eliminarCampana(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
