
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Phone, Mail, MessageSquare, FileText, ThumbsUp, ThumbsDown, Minus, Users, Check, CheckCheck, AlertCircle, RotateCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Interaction {
  id: string;
  tipo: string;
  contenido: string;
  resultado: string | null;
  creadoPor: string | null;
  fechaCreacion: string;
  metadatos: Record<string, unknown> | null;
}

interface CotizacionTimelineEvent {
  id: string;
  numero: string;
  titulo: string;
  estado: string;
  total: number;
  moneda: string;
  descuentoMonto: number;
  descuentoPorcentaje: number;
  fechaCreacion: string;
}

interface AuditLog {
  id: string;
  createdAt: string;
  action: string;
  description: string;
  user: {
    name: string | null;
    email: string;
  };
}

interface WhatsAppMensaje {
  id: string;
  contenido: string;
  direccion: string;
  estado: string;
  errorMensaje: string | null;
  fechaCreacion: string;
  metadatos: Record<string, unknown> | null;
}

interface TimelineEvent {
  id: string;
  type: 'interaction' | 'audit' | 'quote' | 'message';
  date: Date;
  data: Interaction | AuditLog | CotizacionTimelineEvent | WhatsAppMensaje;
}

// Estado real del mensaje de WhatsApp. Lo actualiza el webhook de Evolution
// (MESSAGES_UPDATE): enviado → entregado → leído, o fallido con motivo.
const estadosMensaje: Record<
  string,
  { label: string; clase: string; icono: 'check' | 'doble' | 'alerta' }
> = {
  pendiente: { label: 'Pendiente', clase: 'bg-gray-100 text-gray-700', icono: 'check' },
  enviado: { label: 'Enviado', clase: 'bg-slate-100 text-slate-700', icono: 'check' },
  entregado: { label: 'Entregado', clase: 'bg-emerald-100 text-emerald-800', icono: 'doble' },
  leido: { label: 'Leído', clase: 'bg-blue-100 text-blue-800', icono: 'doble' },
  error: { label: 'Fallido', clase: 'bg-red-100 text-red-800', icono: 'alerta' },
};

interface UnifiedTimelineProps {
  leadId?: string;
  contactId?: string;
  companyId?: string;
}

const interactionTypes = [
  { value: 'llamada', label: 'Llamada', icon: Phone, color: 'text-blue-600' },
  { value: 'email', label: 'Email', icon: Mail, color: 'text-purple-600' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600' },
  { value: 'reunion', label: 'Reunión', icon: Users, color: 'text-orange-600' },
  { value: 'nota', label: 'Nota Interna', icon: FileText, color: 'text-gray-600' }
];

const resultados = [
  { value: 'positivo', label: 'Positivo', icon: ThumbsUp, color: 'bg-green-100 text-green-800' },
  { value: 'neutro', label: 'Neutro', icon: Minus, color: 'bg-gray-100 text-gray-800' },
  { value: 'negativo', label: 'Negativo', icon: ThumbsDown, color: 'bg-red-100 text-red-800' }
];

export function UnifiedTimeline({ leadId, contactId, companyId }: UnifiedTimelineProps) {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reintentando, setReintentando] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tipo: 'llamada',
    contenido: '',
    resultado: '',
    fechaCreacion: new Date().toISOString().slice(0, 16)
  });

  const entityId = leadId || contactId || companyId;
  const entityType = leadId ? 'Lead' : 'Contact';
  const apiBase = leadId ? `/api/leads/${leadId}` : `/api/contacts/${contactId || companyId}`;
  const quotesApi = leadId
    ? `/api/cotizaciones?leadId=${leadId}`
    : companyId
      ? `/api/cotizaciones?companyId=${companyId}`
      : `/api/cotizaciones?contactId=${contactId}`;

  useEffect(() => {
    if (entityId) fetchTimelineData();
  }, [leadId, contactId, companyId]);

  // Los ACK de WhatsApp (entregado/leído) llegan por webhook después del
  // envío: se refresca mientras la ficha está abierta para no dejar el
  // mensaje congelado en "enviado".
  useEffect(() => {
    if (!entityId) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchTimelineData();
    }, 60_000);
    return () => clearInterval(id);
  }, [entityId, leadId, contactId, companyId]);

  const fetchTimelineData = async () => {
    try {
      // Cargar interacciones
      const interactionsRes = await fetch(`${apiBase}/interactions`);
      const interactionsData = interactionsRes.ok ? await interactionsRes.json() : [];
      // Soportar tanto el formato antiguo (array) como el nuevo ({ interactions: [...] })
      const interactions: Interaction[] = Array.isArray(interactionsData) ? interactionsData : (interactionsData.interactions || []);

      // Cargar audit logs, cotizaciones y mensajes de WhatsApp de la ficha.
      const mensajesTipo = leadId ? 'lead' : contactId ? 'contact' : null;
      const [auditLogsRes, cotizacionesRes, mensajesRes] = await Promise.all([
        fetch(`/api/audit-logs?entityId=${entityId}&entity=${entityType}`),
        fetch(quotesApi),
        mensajesTipo
          ? fetch(`/api/mensajes/ficha?tipo=${mensajesTipo}&entityId=${entityId}`)
          : Promise.resolve(null),
      ]);
      const auditData = auditLogsRes.ok ? await auditLogsRes.json() : { logs: [] };
      const auditLogs: AuditLog[] = auditData.logs || [];
      const cotizacionesData = cotizacionesRes.ok ? await cotizacionesRes.json() : { cotizaciones: [] };
      const cotizaciones: CotizacionTimelineEvent[] = cotizacionesData.cotizaciones || [];

      const mensajesData = mensajesRes && mensajesRes.ok ? await mensajesRes.json() : { mensajes: [] };
      const mensajes: WhatsAppMensaje[] = mensajesData.mensajes || [];

      // enviar-ficha registra además una interacción con el mismo texto: si el
      // mensaje ya se pinta con su estado real, se evita el duplicado.
      const idsMensajes = new Set(mensajes.map((m) => m.id));
      const interaccionesVisibles = interactions.filter(
        (i) =>
          !(
            i.tipo === 'whatsapp' &&
            i.metadatos &&
            idsMensajes.has(String((i.metadatos as any).messageId))
          )
      );

      // Combinar y ordenar eventos
      const events: TimelineEvent[] = [
        ...interaccionesVisibles.map(interaction => ({
          id: interaction.id,
          type: 'interaction' as const,
          date: new Date(interaction.fechaCreacion),
          data: interaction
        })),
        ...mensajes.map(mensaje => ({
          id: `mensaje-${mensaje.id}`,
          type: 'message' as const,
          date: new Date(mensaje.fechaCreacion),
          data: mensaje
        })),
        ...auditLogs.map(log => ({
          id: log.id,
          type: 'audit' as const,
          date: new Date(log.createdAt),
          data: log
        })),
        ...cotizaciones.map(cotizacion => ({
          id: `cotizacion-${cotizacion.id}`,
          type: 'quote' as const,
          date: new Date(cotizacion.fechaCreacion),
          data: cotizacion
        }))
      ].sort((a, b) => b.date.getTime() - a.date.getTime());

      setTimelineEvents(events);
    } catch (error) {
      console.error('Error fetching timeline data:', error);
      toast.error('Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  };

  // Reintenta un mensaje fallido sin crear otra fila: reutiliza texto y
  // conversación, y el backend evita duplicados si el primer intento llegó.
  const handleReintentar = async (mensaje: WhatsAppMensaje) => {
    setReintentando(mensaje.id);
    try {
      const res = await fetch('/api/mensajes/reintentar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: mensaje.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        toast.error(data.error || 'No se pudo reintentar el envío', { duration: 8000 });
      } else if (data.yaEnviado) {
        toast.success('Ya había un envío con el mismo texto: no se duplicó');
      } else {
        toast.success(
          data.proveedor === 'hub'
            ? 'Reenviado por el hub (Chatwoot)'
            : 'Reenviado por WhatsApp'
        );
      }
      fetchTimelineData();
    } catch (error: any) {
      toast.error(error?.message || 'Error de conexión');
    } finally {
      setReintentando(null);
    }
  };

  const handleCreateInteraction = async () => {
    if (!formData.contenido) {
      toast.error('Por favor ingresa el contenido de la interacción');
      return;
    }

    try {
      const res = await fetch(`${apiBase}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: formData.tipo,
          contenido: formData.contenido,
          resultado: formData.resultado || null
        })
      });

      if (!res.ok) throw new Error('Error al crear interacción');

      toast.success('Interacción registrada correctamente');
      setIsDialogOpen(false);
      setFormData({ 
        tipo: 'llamada', 
        contenido: '', 
        resultado: '',
        fechaCreacion: new Date().toISOString().slice(0, 16)
      });
      fetchTimelineData();
    } catch (error) {
      console.error('Error creating interaction:', error);
      toast.error('Error al registrar la interacción');
    }
  };

  const getInteractionIcon = (tipo: string) => {
    const interactionType = interactionTypes.find(t => t.value === tipo);
    return interactionType ? interactionType.icon : MessageSquare;
  };

  const getInteractionColor = (tipo: string) => {
    const interactionType = interactionTypes.find(t => t.value === tipo);
    return interactionType ? interactionType.color : 'text-gray-600';
  };

  const getResultadoBadge = (resultado: string | null) => {
    if (!resultado) return null;
    const res = resultados.find(r => r.value === resultado);
    if (!res) return null;

    const ResIcon = res.icon;
    return (
      <Badge className={`${res.color} text-xs`}>
        <ResIcon className="h-3 w-3 mr-1" />
        {res.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              Línea de Tiempo Unificada ({timelineEvents.length})
            </CardTitle>
            <CardDescription>
              Historial completo de interacciones y eventos del sistema
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Registrar Interacción
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Nueva Interacción</DialogTitle>
                <DialogDescription>
                  Documenta una comunicación o nota sobre este lead
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="tipo">Tipo de Interacción *</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {interactionTypes.map(type => {
                        const TypeIcon = type.icon;
                        return (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center">
                              <TypeIcon className={`h-4 w-4 mr-2 ${type.color}`} />
                              {type.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fechaCreacion">Fecha y Hora</Label>
                  <Input
                    id="fechaCreacion"
                    type="datetime-local"
                    value={formData.fechaCreacion}
                    onChange={(e) => setFormData({ ...formData, fechaCreacion: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="contenido">Contenido *</Label>
                  <Textarea
                    id="contenido"
                    value={formData.contenido}
                    onChange={(e) => setFormData({ ...formData, contenido: e.target.value })}
                    placeholder="Describe qué sucedió en esta interacción..."
                    rows={4}
                  />
                </div>
                <div>
                  <Label htmlFor="resultado">Resultado (Opcional)</Label>
                  <Select value={formData.resultado} onValueChange={(v) => setFormData({ ...formData, resultado: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un resultado" />
                    </SelectTrigger>
                    <SelectContent>
                      {resultados.map(res => {
                        const ResIcon = res.icon;
                        return (
                          <SelectItem key={res.value} value={res.value}>
                            <div className="flex items-center">
                              <ResIcon className="h-4 w-4 mr-2" />
                              {res.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateInteraction} className="w-full">
                  Registrar Interacción
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : timelineEvents.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay eventos registrados</p>
            <p className="text-sm text-muted-foreground mt-1">
              Comienza a documentar las comunicaciones con este lead
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Línea vertical del timeline */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

            <div className="space-y-6">
              {timelineEvents.map((event) => {
                if (event.type === 'quote') {
                  const cotizacion = event.data as CotizacionTimelineEvent;
                  const formattedTotal = new Intl.NumberFormat('es-MX', {
                    style: 'currency',
                    currency: cotizacion.moneda || 'EUR'
                  }).format(cotizacion.total || 0);
                  const hasDiscount = (cotizacion.descuentoMonto || 0) > 0;

                  return (
                    <a
                      key={event.id}
                      href={`/dashboard/cotizaciones/${cotizacion.id}`}
                      className="block relative pl-14"
                    >
                      <div className="absolute left-4 top-1 w-5 h-5 rounded-full bg-white border-2 border-blue-400 flex items-center justify-center">
                        <FileText className="h-3 w-3 text-blue-600" />
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs bg-white">Cotización</Badge>
                            <Badge className="text-xs bg-blue-100 text-blue-800">{cotizacion.estado}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(event.date, "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm font-semibold">{cotizacion.numero} · {cotizacion.titulo}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-700">
                          <span>Total: <strong>{formattedTotal}</strong></span>
                          {hasDiscount && (
                            <span className="text-emerald-700">
                              Descuento: -{new Intl.NumberFormat('es-MX', { style: 'currency', currency: cotizacion.moneda || 'EUR' }).format(cotizacion.descuentoMonto)}
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                }

                if (event.type === 'message') {
                  const mensaje = event.data as WhatsAppMensaje;
                  const saliente = mensaje.direccion === 'saliente';
                  const estado = saliente
                    ? estadosMensaje[mensaje.estado] || estadosMensaje.enviado
                    : null;

                  return (
                    <div key={event.id} className="relative pl-14">
                      <div className="absolute left-4 top-1 w-5 h-5 rounded-full bg-white border-2 border-green-400 flex items-center justify-center">
                        <MessageSquare className="h-3 w-3 text-green-600" />
                      </div>
                      <div className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              WhatsApp
                            </Badge>
                            {estado ? (
                              <Badge className={`text-xs gap-1 ${estado.clase}`}>
                                {estado.icono === 'check' ? (
                                  <Check className="h-3 w-3" />
                                ) : estado.icono === 'doble' ? (
                                  <CheckCheck className="h-3 w-3" />
                                ) : (
                                  <AlertCircle className="h-3 w-3" />
                                )}
                                {estado.label}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700">
                                Recibido
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(event.date, "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{mensaje.contenido}</p>
                        {mensaje.errorMensaje && (
                          <p className="text-xs text-red-700 mt-2">
                            <span className="font-semibold">Motivo del fallo:</span>{' '}
                            {mensaje.errorMensaje}
                          </p>
                        )}
                        {mensaje.estado === 'error' && saliente && (
                          <div className="mt-3 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-2"
                              onClick={() => handleReintentar(mensaje)}
                              disabled={reintentando !== null}
                            >
                              {reintentando === mensaje.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCw className="h-3.5 w-3.5" />
                              )}
                              {reintentando === mensaje.id ? 'Reintentando…' : 'Reintentar envío'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (event.type === 'interaction') {
                  const interaction = event.data as Interaction;
                  const InteractionIcon = getInteractionIcon(interaction.tipo);
                  const colorClass = getInteractionColor(interaction.tipo);

                  if (interaction.tipo === 'email') {
                    const meta = interaction.metadatos as Record<string, unknown> | null;
                    const sender = (meta?.direccion || meta?.from || '') as string;
                    const subject = (meta?.asunto || meta?.subject || '') as string;
                    const body = interaction.contenido;

                    return (
                      <div key={event.id} className="relative pl-14">
                        <div className={`absolute left-4 top-1 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center ${colorClass.replace('text-', 'border-')}`}>
                          <InteractionIcon className={`h-3 w-3 ${colorClass}`} />
                        </div>
                        <div className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">Email</Badge>
                              {interaction.resultado && getResultadoBadge(interaction.resultado)}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(event.date, "dd MMM yyyy, HH:mm", { locale: es })}
                            </span>
                          </div>
                          {sender && (
                            <p className="text-xs text-muted-foreground mb-1">
                              <span className="font-semibold">De:</span> {sender}
                            </p>
                          )}
                          {subject && (
                            <p className="text-sm font-medium mb-2">
                              <span className="font-semibold">Asunto:</span> {subject}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap text-gray-700 line-clamp-3">{body}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={event.id} className="relative pl-14">
                      {/* Círculo del timeline */}
                      <div className={`absolute left-4 top-1 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center ${colorClass.replace('text-', 'border-')}`}>
                        <InteractionIcon className={`h-3 w-3 ${colorClass}`} />
                      </div>

                      <div className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {interactionTypes.find(t => t.value === interaction.tipo)?.label}
                            </Badge>
                            {interaction.resultado && getResultadoBadge(interaction.resultado)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(event.date, "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{interaction.contenido}</p>
                      </div>
                    </div>
                  );
                } else {
                  // Audit log event
                  const auditLog = event.data as AuditLog;
                  
                  return (
                    <div key={event.id} className="relative pl-14">
                      {/* Círculo del timeline */}
                      <div className="absolute left-4 top-1 w-5 h-5 rounded-full bg-white border-2 border-amber-400 flex items-center justify-center">
                        <FileText className="h-3 w-3 text-amber-600" />
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs bg-white">
                              Evento del Sistema
                            </Badge>
                            <Badge className="text-xs bg-amber-100 text-amber-800">
                              {auditLog.action}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(event.date, "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-sm">
                          <span className="font-medium">{auditLog.user.name || auditLog.user.email}</span>
                          {' '}{auditLog.description}
                        </p>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
