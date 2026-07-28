
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Calendar, Clock, User, DollarSign, Mail, Phone, MessageSquare, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Cita {
  id: string;
  fecha_hora: string;
  estado: string;
  monto_pagado: number | null;
  titulo?: string;
  duracion?: number;
  descripcion?: string;
  servicio: {
    id: string;
    nombre: string;
    descripcion: string;
    duracion_minutos: number;
    precio: number;
    moneda: string;
  } | null;
  lead: {
    id: string;
    nombre: string;
    email: string;
    telefono: string;
    notas: string;
  };
}

export default function CitaDetalleePage() {
  const params = useParams();
  const router = useRouter();
  const [cita, setCita] = useState<Cita | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompletarModal, setShowCompletarModal] = useState(false);
  const [notasReunion, setNotasReunion] = useState('');
  const [completando, setCompletando] = useState(false);

  useEffect(() => {
    fetchCita();
  }, [params.id]);

  const fetchCita = async () => {
    try {
      const res = await fetch(`/api/citas/${params.id}`);
      if (!res.ok) throw new Error('Error al cargar la cita');
      const data = await res.json();
      setCita(data);
    } catch (error) {
      toast.error('Error al cargar la cita');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    try {
      const res = await fetch(`/api/citas/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado.toLowerCase() }),
      });

      if (!res.ok) throw new Error('Error al actualizar estado');
      
      toast.success('Estado actualizado correctamente');
      fetchCita();
    } catch (error) {
      toast.error('Error al actualizar estado');
      console.error(error);
    }
  };

  const cancelarCita = async () => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta cita?')) return;
    
    try {
      const res = await fetch(`/api/citas/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Cancelada' }),
      });

      if (!res.ok) throw new Error('Error al cancelar cita');
      
      toast.success('Cita cancelada');
      router.push('/dashboard/citas');
    } catch (error) {
      toast.error('Error al cancelar cita');
      console.error(error);
    }
  };

  // Función para completar la cita con notas
  const completarCita = async () => {
    if (!notasReunion.trim()) {
      toast.error('Por favor agrega un resumen de la reunión');
      return;
    }

    setCompletando(true);
    try {
      // 1. Actualizar la cita con estado completada y notas
      const fechaActual = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      const notaCompleta = `[${fechaActual}] ✅ REUNIÓN COMPLETADA\n\n📝 Resumen:\n${notasReunion}`;
      
      const res = await fetch(`/api/citas/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          estado: 'Completada',
          descripcion: cita?.descripcion 
            ? `${cita.descripcion}\n\n${notaCompleta}`
            : notaCompleta
        }),
      });

      if (!res.ok) throw new Error('Error al completar cita');

      // 2. Registrar en el historial del lead (interacción)
      if (cita?.lead?.id) {
        await fetch('/api/leads/interacciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: cita.lead.id,
            tipo: 'reunion',
            titulo: `Reunión completada: ${cita.servicio?.nombre || cita.titulo || 'Cita'}`,
            descripcion: notasReunion,
            metadata: {
              citaId: cita.id,
              servicio: cita.servicio?.nombre || cita.titulo,
              fecha: cita.fecha_hora
            }
          }),
        });
      }
      
      toast.success('Cita completada y registrada en el historial');
      setShowCompletarModal(false);
      setNotasReunion('');
      fetchCita();
    } catch (error) {
      toast.error('Error al completar la cita');
      console.error(error);
    } finally {
      setCompletando(false);
    }
  };

  // Normalizar estado para comparaciones
  const estadoNormalizado = cita?.estado?.toLowerCase() || '';

  const getEstadoBadge = (estado: string) => {
    // Normalizar a minúsculas para manejar inconsistencias
    const estadoLower = estado.toLowerCase();
    
    const colors: Record<string, string> = {
      pendiente: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
      confirmada: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
      pagada: 'bg-green-100 text-green-800 hover:bg-green-200',
      completada: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
      cancelada: 'bg-red-100 text-red-800 hover:bg-red-200',
    };

    return (
      <Badge className={colors[estadoLower] || 'bg-gray-100 text-gray-800'}>
        {estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Cargando cita...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!cita) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">Cita no encontrada</p>
            <Button onClick={() => router.push('/dashboard/citas')} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Citas
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button onClick={() => router.back()} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Detalle de Cita</h1>
            <p className="text-muted-foreground">
              Información completa de la cita
            </p>
          </div>
        </div>
        {getEstadoBadge(cita.estado)}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Información de la Cita */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Información de la Cita
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Servicio / Título</p>
              <p className="text-lg font-semibold">{cita.servicio?.nombre || cita.titulo || 'Cita'}</p>
              {cita.servicio?.descripcion && (
                <p className="text-sm text-muted-foreground">{cita.servicio.descripcion}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Fecha
                </p>
                <p className="font-medium">
                  {new Date(cita.fecha_hora).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  Hora
                </p>
                <p className="font-medium">
                  {new Date(cita.fecha_hora).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                Duración
              </p>
              <p className="font-medium">{cita.servicio?.duracion_minutos || cita.duracion || 30} minutos</p>
            </div>

            {cita.servicio && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  Precio
                </p>
                <p className="text-lg font-bold text-primary">
                  {new Intl.NumberFormat('es-MX', {
                    style: 'currency',
                    currency: cita.servicio.moneda,
                  }).format(cita.servicio.precio)}
                </p>
                {cita.monto_pagado !== null && (
                  <p className="text-sm text-green-600 font-medium">✓ Pagado</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Información del Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              Información del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Nombre</p>
              <p className="text-lg font-semibold">{cita.lead.nombre}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                <Mail className="h-4 w-4 mr-1" />
                Email
              </p>
              <a
                href={`mailto:${cita.lead.email}`}
                className="text-primary hover:underline"
              >
                {cita.lead.email}
              </a>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                <Phone className="h-4 w-4 mr-1" />
                Teléfono
              </p>
              {cita.lead.telefono ? (
                <a
                  href={`tel:${cita.lead.telefono}`}
                  className="text-primary hover:underline"
                >
                  {cita.lead.telefono}
                </a>
              ) : (
                <p className="text-muted-foreground">No proporcionado</p>
              )}
            </div>

            {cita.lead.notas && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Notas del cliente
                </p>
                <p className="text-sm bg-muted p-3 rounded-lg">{cita.lead.notas}</p>
              </div>
            )}

            <Button
              onClick={() => router.push(`/dashboard/leads/${cita.lead.id}`)}
              variant="outline"
              className="w-full"
            >
              Ver perfil completo del lead
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Historial / Notas de la cita */}
      {cita.descripcion && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              Historial de la Cita
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm">
              {cita.descripcion}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones</CardTitle>
          <CardDescription>
            Gestiona el estado de esta cita
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {estadoNormalizado === 'pendiente' && (
              <>
                <Button onClick={() => cambiarEstado('Confirmada')} variant="default">
                  Confirmar Cita
                </Button>
                <Button onClick={() => cambiarEstado('Pagada')} variant="default">
                  Marcar como Pagada
                </Button>
              </>
            )}
            {estadoNormalizado === 'confirmada' && (
              <>
                <Button onClick={() => cambiarEstado('Pagada')} variant="default">
                  Marcar como Pagada
                </Button>
                <Button onClick={() => setShowCompletarModal(true)} variant="default" className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Completar Reunión
                </Button>
              </>
            )}
            {estadoNormalizado === 'pagada' && (
              <Button onClick={() => setShowCompletarModal(true)} variant="default" className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Completar Reunión
              </Button>
            )}
            {estadoNormalizado !== 'cancelada' && estadoNormalizado !== 'completada' && (
              <Button onClick={cancelarCita} variant="destructive">
                Cancelar Cita
              </Button>
            )}
            {estadoNormalizado === 'completada' && (
              <p className="text-green-600 font-medium flex items-center">
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Esta reunión ya fue completada
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal para completar la cita */}
      <Dialog open={showCompletarModal} onOpenChange={setShowCompletarModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
              Completar Reunión
            </DialogTitle>
            <DialogDescription>
              Registra un resumen de lo que sucedió en la reunión. Esta información se guardará en el historial del lead.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted p-3 rounded-lg text-sm">
              <p><strong>Cliente:</strong> {cita.lead.nombre}</p>
              <p><strong>Servicio:</strong> {cita.servicio?.nombre || cita.titulo || 'Cita'}</p>
              <p><strong>Fecha:</strong> {new Date(cita.fecha_hora).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas-reunion">Resumen de la reunión *</Label>
              <Textarea
                id="notas-reunion"
                placeholder="¿Qué se habló? ¿Cuáles fueron los acuerdos? ¿Próximos pasos?"
                value={notasReunion}
                onChange={(e) => setNotasReunion(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCompletarModal(false)}
              disabled={completando}
            >
              Cancelar
            </Button>
            <Button 
              onClick={completarCita}
              disabled={completando || !notasReunion.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {completando ? 'Guardando...' : 'Completar y Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
