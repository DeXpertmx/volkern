'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Send,
  Trash2,
  Power,
  Copy,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCcw,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAvailableEvents } from '@/lib/outgoing-webhooks';

interface OutgoingWebhook {
  id: string;
  nombre: string;
  descripcion?: string;
  url: string;
  activo: boolean;
  eventos: string[];
  metodoHttp: string;
  totalEnviados: number;
  totalExitosos: number;
  totalFallidos: number;
  ultimoEnvio?: string;
  fechaCreacion: string;
  creadoPor?: { name?: string; email?: string };
  totalDeliveries: number;
}

interface Delivery {
  id: string;
  evento: string;
  estado: string;
  estadoHttp?: number;
  errorMensaje?: string;
  tiempoRespuesta?: number;
  payload: any;
  fechaEnvio: string;
  intentos: number;
}

export default function WebhooksSalientesPage() {
  const [webhooks, setWebhooks] = useState<OutgoingWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deliveriesDialogOpen, setDeliveriesDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<OutgoingWebhook | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    url: '',
    eventos: [] as string[],
    metodoHttp: 'POST',
    generarSecret: true,
    maxReintentos: 3,
    timeoutSegundos: 30,
  });

  const eventosDisponibles = getAvailableEvents();

  useEffect(() => {
    cargarWebhooks();
  }, []);

  const cargarWebhooks = async () => {
    try {
      const res = await fetch('/api/webhooks/outgoing');
      const data = await res.json();
      if (data.webhooks) {
        setWebhooks(data.webhooks);
      }
    } catch (error) {
      console.error('Error al cargar webhooks:', error);
      toast.error('Error al cargar webhooks salientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.nombre || !formData.url || formData.eventos.length === 0) {
      toast.error('Completa todos los campos requeridos');
      return;
    }

    try {
      const res = await fetch('/api/webhooks/outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al crear webhook');
      }

      toast.success('Webhook saliente creado exitosamente');
      setDialogOpen(false);
      setFormData({
        nombre: '',
        descripcion: '',
        url: '',
        eventos: [],
        metodoHttp: 'POST',
        generarSecret: true,
        maxReintentos: 3,
        timeoutSegundos: 30,
      });
      cargarWebhooks();
    } catch (error: any) {
      console.error('Error al crear webhook:', error);
      toast.error(error.message || 'Error al crear webhook');
    }
  };

  const toggleActivo = async (id: string, activo: boolean) => {
    try {
      const res = await fetch(`/api/webhooks/outgoing/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !activo }),
      });

      if (!res.ok) throw new Error('Error al actualizar webhook');

      toast.success(`Webhook ${!activo ? 'activado' : 'desactivado'}`);
      cargarWebhooks();
    } catch (error) {
      console.error('Error al actualizar webhook:', error);
      toast.error('Error al actualizar webhook');
    }
  };

  const eliminarWebhook = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar el webhook "${nombre}"?`)) return;

    try {
      const res = await fetch(`/api/webhooks/outgoing/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Error al eliminar webhook');

      toast.success('Webhook eliminado exitosamente');
      cargarWebhooks();
    } catch (error) {
      console.error('Error al eliminar webhook:', error);
      toast.error('Error al eliminar webhook');
    }
  };

  const probarWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/outgoing/${id}/test`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Error al probar webhook');

      const data = await res.json();
      toast.success(`Webhook de prueba enviado: ${data.evento}`);
    } catch (error) {
      console.error('Error al probar webhook:', error);
      toast.error('Error al enviar webhook de prueba');
    }
  };

  const verDeliveries = async (webhook: OutgoingWebhook) => {
    setSelectedWebhook(webhook);
    setDeliveriesDialogOpen(true);
    setLoadingDeliveries(true);

    try {
      const res = await fetch(`/api/webhooks/outgoing/${webhook.id}/deliveries`);
      const data = await res.json();
      setDeliveries(data.deliveries || []);
    } catch (error) {
      console.error('Error al cargar deliveries:', error);
      toast.error('Error al cargar historial');
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const copiarURL = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copiada al portapapeles');
    } catch (error) {
      toast.error('Error al copiar URL');
    }
  };

  const toggleEvento = (evento: string) => {
    setFormData((prev) => ({
      ...prev,
      eventos: prev.eventos.includes(evento)
        ? prev.eventos.filter((e) => e !== evento)
        : [...prev.eventos, evento],
    }));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Webhooks Salientes</h1>
          <p className="text-muted-foreground mt-2">
            Envía notificaciones automáticas a n8n, Make, Zapier u otras herramientas cuando ocurran eventos en tu CRM.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Webhook Saliente</DialogTitle>
              <DialogDescription>
                Los webhooks salientes notificarán automáticamente a tu URL cuando ocurran los eventos seleccionados.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del Webhook *</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Notificación a n8n"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  placeholder="¿Para qué usarás este webhook?"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">URL de Destino *</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://webhook.dimension.expert/webhook/f1c1a0ea..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  La URL de tu webhook en n8n, Make, Zapier, etc.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Eventos a Notificar *</Label>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-3 border rounded-md">
                  {eventosDisponibles.map((evento) => (
                    <div key={evento.value} className="flex items-start space-x-2">
                      <input
                        type="checkbox"
                        id={evento.value}
                        checked={formData.eventos.includes(evento.value)}
                        onChange={() => toggleEvento(evento.value)}
                        className="mt-1"
                      />
                      <label htmlFor={evento.value} className="text-sm cursor-pointer">
                        <div className="font-medium">{evento.label}</div>
                        <div className="text-xs text-muted-foreground">{evento.description}</div>
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecciona al menos un evento. {formData.eventos.length} seleccionado(s).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="metodoHttp">Método HTTP</Label>
                  <select
                    id="metodoHttp"
                    value={formData.metodoHttp}
                    onChange={(e) => setFormData({ ...formData, metodoHttp: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxReintentos">Reintentos Máximos</Label>
                  <Input
                    id="maxReintentos"
                    type="number"
                    min="0"
                    max="10"
                    value={formData.maxReintentos}
                    onChange={(e) => setFormData({ ...formData, maxReintentos: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-md">
                <input
                  type="checkbox"
                  id="generarSecret"
                  checked={formData.generarSecret}
                  onChange={(e) => setFormData({ ...formData, generarSecret: e.target.checked })}
                />
                <label htmlFor="generarSecret" className="text-sm cursor-pointer flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span>Generar clave secreta para firma HMAC (recomendado)</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                Crear Webhook
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay webhooks salientes configurados</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              Crea tu primer webhook saliente para enviar notificaciones automáticas cuando ocurran eventos en tu CRM.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primer Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-xl">{webhook.nombre}</CardTitle>
                      <Badge variant={webhook.activo ? 'default' : 'secondary'}>
                        {webhook.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                    {webhook.descripcion && (
                      <CardDescription>{webhook.descripcion}</CardDescription>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {webhook.url.length > 60 ? webhook.url.substring(0, 60) + '...' : webhook.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copiarURL(webhook.url)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActivo(webhook.id, webhook.activo)}
                    >
                      <Power className={`h-4 w-4 ${webhook.activo ? 'text-green-600' : 'text-gray-400'}`} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => probarWebhook(webhook.id)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verDeliveries(webhook)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => eliminarWebhook(webhook.id, webhook.nombre)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Eventos</div>
                    <div className="text-2xl font-bold">{webhook.eventos.length}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Total Enviados</div>
                    <div className="text-2xl font-bold">{webhook.totalEnviados}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-green-600">Exitosos</div>
                    <div className="text-2xl font-bold text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-5 w-5" />
                      {webhook.totalExitosos}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-red-600">Fallidos</div>
                    <div className="text-2xl font-bold text-red-600 flex items-center gap-1">
                      <XCircle className="h-5 w-5" />
                      {webhook.totalFallidos}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Último Envío</div>
                    <div className="text-sm">
                      {webhook.ultimoEnvio
                        ? new Date(webhook.ultimoEnvio).toLocaleDateString('es-MX')
                        : 'Nunca'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1">
                  {(webhook.eventos as string[]).map((evento) => (
                    <Badge key={evento} variant="outline" className="text-xs">
                      {eventosDisponibles.find((e) => e.value === evento)?.label || evento}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Deliveries */}
      <Dialog open={deliveriesDialogOpen} onOpenChange={setDeliveriesDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Entregas</DialogTitle>
            <DialogDescription>
              {selectedWebhook?.nombre} - {deliveries.length} entrega(s) registrada(s)
            </DialogDescription>
          </DialogHeader>

          {loadingDeliveries ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay entregas registradas aún.
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          delivery.estado === 'exitoso' ? 'default' :
                          delivery.estado === 'fallido' ? 'destructive' :
                          'secondary'
                        }>
                          {delivery.estado}
                        </Badge>
                        <span className="font-medium">{delivery.evento}</span>
                        {delivery.estadoHttp && (
                          <Badge variant="outline">HTTP {delivery.estadoHttp}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(delivery.fechaEnvio).toLocaleString('es-MX')}
                        {delivery.tiempoRespuesta && (
                          <span className="ml-2">• {delivery.tiempoRespuesta}ms</span>
                        )}
                        <span className="ml-2">• Intento {delivery.intentos}</span>
                      </div>
                    </div>
                  </div>

                  {delivery.errorMensaje && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertDescription className="text-xs">
                        {delivery.errorMensaje}
                      </AlertDescription>
                    </Alert>
                  )}

                  <details className="mt-2">
                    <summary className="text-sm font-medium cursor-pointer hover:text-blue-600">
                      Ver Payload
                    </summary>
                    <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-x-auto">
                      {JSON.stringify(delivery.payload, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
