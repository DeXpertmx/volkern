'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  User, 
  ArrowLeft, 
  Mail, 
  Phone, 
  Calendar, 
  Clock,
  Edit2,
  Save,
  X,
  Trash2,
  UserCheck,
  PhoneCall
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import LeadScoreCard from '@/components/lead-score-card';
import { LeadPipeline } from '@/components/lead-pipeline';
import { LeadTasks } from '@/components/lead-tasks';
import { UnifiedTimeline } from '@/components/unified-timeline';
import { EnhancedNotes } from '@/components/enhanced-notes';
import { LeadAssignment } from '@/components/lead-assignment';

interface Lead {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  empresa: string | null;
  contextoProyecto: string | null;
  notas: string | null;
  estado: string;
  status?: string;
  convertedToContactId?: string | null;
  asignadoA: string | null;
  tiempoEnEstado: string;
  fechaCreacion: string;
  citas: Cita[];
}

interface Cita {
  id: string;
  fechaHora: string;
  estado: string;
  titulo?: string;
  servicio: {
    nombre: string;
    precio: number;
    moneda: string;
  } | null;
}

export default function LeadDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    contextoProyecto: ''
  });
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    fetchLead();
  }, [params.id]);

  const fetchLead = async () => {
    try {
      const res = await fetch(`/api/leads/${params.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Lead no encontrado');
          router.push('/dashboard/leads');
          return;
        }
        throw new Error('Error al cargar lead');
      }
      const data = await res.json();
      setLead(data);
      setFormData({
        nombre: data.nombre,
        email: data.email,
        telefono: data.telefono || '',
        empresa: data.empresa || '',
        contextoProyecto: data.contextoProyecto || ''
      });
    } catch (error) {
      console.error('Error fetching lead:', error);
      toast.error('Error al cargar lead');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/leads/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error('Error al actualizar lead');

      toast.success('Lead actualizado correctamente');
      setIsEditing(false);
      fetchLead();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Error al actualizar lead');
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar este lead? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const res = await fetch(`/api/leads/${params.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Error al eliminar lead');

      toast.success('Lead eliminado correctamente');
      router.push('/dashboard/leads');
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.error('Error al eliminar lead');
    }
  };

  const handleConvert = async () => {
    if (!confirm('¿Convertir este lead a contacto? Se creará un nuevo contacto y deal asociado.')) {
      return;
    }

    setIsConverting(true);
    try {
      const res = await fetch(`/api/leads/${params.id}/convert`, {
        method: 'POST'
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al convertir lead');
      }

      toast.success('Lead convertido exitosamente');
      
      // Redirigir al contacto creado
      if (data.data?.contact?.id) {
        router.push(`/dashboard/contactos/${data.data.contact.id}`);
      } else {
        fetchLead(); // Refrescar datos
      }
    } catch (error: any) {
      console.error('Error converting lead:', error);
      toast.error(error.message || 'Error al convertir lead');
    } finally {
      setIsConverting(false);
    }
  };

  const initiateCall = async () => {
    if (!lead?.telefono) return;
    
    setCalling(true);
    try {
      const res = await fetch('/api/integrations/telephony/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: lead.telefono })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Llamada iniciada');
      } else {
        toast.error(data.error || 'Error al iniciar llamada');
      }
    } catch (error) {
      console.error('Call error:', error);
      toast.error('Error de conexión al iniciar llamada');
    } finally {
      setCalling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando lead...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">Lead no encontrado</p>
          <Button onClick={() => router.push('/dashboard/leads')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Leads
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          <Button onClick={() => router.back()} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center">
              <User className="h-6 md:h-8 w-6 md:w-8 mr-3 text-primary" />
              {lead.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              Lead creado el {format(new Date(lead.fechaCreacion), 'dd MMM yyyy', { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isEditing ? (
            <>
              {/* Solo mostrar botón de conversión si el lead no ha sido convertido */}
              {lead.estado !== 'convertido' && lead.status !== 'converted' && (
                <Button 
                  onClick={handleConvert} 
                  variant="default" 
                  size="sm"
                  disabled={isConverting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  {isConverting ? 'Convirtiendo...' : 'Convertir a Contacto'}
                </Button>
              )}
              {lead.convertedToContactId && (
                <Button 
                  onClick={() => router.push(`/dashboard/contactos/${lead.convertedToContactId}`)} 
                  variant="outline" 
                  size="sm"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Ver Contacto
                </Button>
              )}
              <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                <Edit2 className="h-4 w-4 mr-2" />
                Editar
              </Button>
              <Button onClick={handleDelete} variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleSave} variant="default" size="sm">
                <Save className="h-4 w-4 mr-2" />
                Guardar
              </Button>
              <Button onClick={() => {
                setIsEditing(false);
                setFormData({
                  nombre: lead.nombre,
                  email: lead.email,
                  telefono: lead.telefono || '',
                  empresa: lead.empresa || '',
                  contextoProyecto: lead.contextoProyecto || ''
                });
              }} variant="outline" size="sm">
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline del Lead */}
      <LeadPipeline 
        leadId={lead.id}
        currentStage={lead.estado}
        tiempoEnEstado={lead.tiempoEnEstado}
        onStageChange={(newStage) => setLead({...lead, estado: newStage, tiempoEnEstado: new Date().toISOString()})}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Información del Lead */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Información del Lead
            </CardTitle>
            <CardDescription>
              Datos de contacto y asignación del lead
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre completo</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Nombre del lead"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="+52 123 456 7890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa</Label>
                  <Input
                    id="empresa"
                    value={formData.empresa}
                    onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                    placeholder="Nombre de la empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contextoProyecto">Contexto del Proyecto</Label>
                  <Textarea
                    id="contextoProyecto"
                    value={formData.contextoProyecto}
                    onChange={(e) => setFormData({ ...formData, contextoProyecto: e.target.value })}
                    placeholder="Describe el contexto, necesidades o detalles del proyecto del lead..."
                    rows={4}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Nombre</p>
                  <p className="text-lg font-semibold">{lead.nombre}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                    <Mail className="h-4 w-4 mr-1" />
                    Email
                  </p>
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-primary hover:underline"
                  >
                    {lead.email}
                  </a>
                </div>
                {lead.telefono && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                      <Phone className="h-4 w-4 mr-1" />
                      Teléfono
                    </p>
                    <div className="flex items-center gap-3">
                      <a
                        href={`tel:${lead.telefono}`}
                        className="text-primary hover:underline font-semibold"
                      >
                        {lead.telefono}
                      </a>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 gap-2 font-bold transition-all active:scale-95"
                        onClick={initiateCall}
                        disabled={calling}
                      >
                        {calling ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600/30 border-t-blue-600" />
                        ) : (
                          <PhoneCall className="h-3.5 w-3.5" />
                        )}
                        {calling ? 'Llamando...' : 'Llamar (VoIP)'}
                      </Button>
                    </div>
                  </div>
                )}
                {lead.empresa && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Empresa</p>
                    <p className="text-base">{lead.empresa}</p>
                  </div>
                )}
                {lead.contextoProyecto && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Contexto del Proyecto</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.contextoProyecto}</p>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <LeadAssignment 
                    leadId={lead.id}
                    currentAssignedTo={lead.asignadoA}
                    onAssignmentChange={(userId) => setLead({...lead, asignadoA: userId})}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Estadísticas rápidas */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total de Citas</p>
                <p className="text-2xl font-bold">{lead.citas?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Citas Completadas</p>
                <p className="text-2xl font-bold">
                  {lead.citas?.filter(c => c.estado === 'completada').length || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ingresos Generados</p>
                <p className="text-2xl font-bold">
                  ${lead.citas
                    ?.filter(c => c.estado === 'pagada' || c.estado === 'completada')
                    .reduce((sum, c) => sum + (c.servicio?.precio || 0), 0)
                    .toFixed(2) || '0.00'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Score del Lead */}
          <LeadScoreCard leadId={lead.id} />
        </div>
      </div>

      {/* Gestión de Tareas */}
      <LeadTasks leadId={lead.id} />

      {/* Línea de Tiempo de Comunicaciones */}
      <UnifiedTimeline leadId={lead.id} />

      {/* Notas Mejoradas */}
      <EnhancedNotes leadId={lead.id} />

      {/* Historial de Citas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Historial de Citas ({lead.citas?.length || 0})
          </CardTitle>
          <CardDescription>
            Todas las citas asociadas a este lead
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!lead.citas || lead.citas.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Sin citas agendadas</h3>
              <p className="text-muted-foreground mb-4">
                Este lead aún no ha agendado ninguna cita
              </p>
              <Link href="/dashboard/citas">
                <Button variant="outline">
                  Ver Sistema de Citas
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {lead.citas.map((cita) => (
                <Link 
                  key={cita.id} 
                  href={`/dashboard/citas/${cita.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="flex flex-col items-center justify-center bg-primary/10 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {format(new Date(cita.fechaHora), 'MMM', { locale: es })}
                        </p>
                        <p className="text-2xl font-bold">
                          {format(new Date(cita.fechaHora), 'dd', { locale: es })}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold">{cita.servicio?.nombre || cita.titulo || 'Cita'}</p>
                        <div className="flex items-center text-sm text-muted-foreground space-x-3">
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {format(new Date(cita.fechaHora), 'HH:mm', { locale: es })}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {cita.estado}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {cita.servicio && (
                      <div className="text-right">
                        <p className="font-semibold">
                          {new Intl.NumberFormat('es-MX', {
                            style: 'currency',
                            currency: cita.servicio.moneda || 'USD'
                          }).format(cita.servicio.precio)}
                        </p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
