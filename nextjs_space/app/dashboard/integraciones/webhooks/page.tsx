
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Webhook,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Eye,
  Power,
  PowerOff,
  Send,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface Webhook {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  accion: string;
  mapeoNombre: string | null;
  mapeoEmail: string | null;
  mapeoTelefono: string | null;
  mapeoEmpresa: string | null;
  mapeoNotas: string | null;
  automationId: string | null;
  automation?: {
    id: string;
    nombre: string;
    activo: boolean;
  } | null;
  totalRecibidos: number;
  ultimoRecibido: Date | null;
  url: string;
  totalEntregas: number;
  secretKey?: string | null;
  fechaCreacion: Date;
}

interface Automation {
  id: string;
  nombre: string;
  activo: boolean;
}

interface WebhookDelivery {
  id: string;
  metodo: string;
  headers: any;
  payload: any;
  ipAddress: string | null;
  userAgent: string | null;
  estado: string;
  errorMensaje: string | null;
  leadCreado: string | null;
  tareaCreada: string | null;
  automationRun: string | null;
  fechaRecepcion: Date;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deliveriesDialogOpen, setDeliveriesDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [creatingWebhook, setCreatingWebhook] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    accion: 'crear_lead',
    mapeoNombre: 'nombre',
    mapeoEmail: 'email',
    mapeoTelefono: 'telefono',
    mapeoEmpresa: 'empresa',
    mapeoNotas: 'notas',
    automationId: '',
    generarSecret: false
  });

  useEffect(() => {
    fetchWebhooks();
    fetchAutomations();
  }, []);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/webhooks/incoming');
      const data = await response.json();
      
      if (response.ok) {
        setWebhooks(data.webhooks);
      } else {
        toast.error('Error al cargar webhooks');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar webhooks');
    } finally {
      setLoading(false);
    }
  };

  const fetchAutomations = async () => {
    try {
      const response = await fetch('/api/automatizaciones');
      const data = await response.json();
      
      if (response.ok) {
        setAutomations(data.automations || []);
      }
    } catch (error) {
      console.error('Error cargando automatizaciones:', error);
    }
  };

  const fetchDeliveries = async (webhookId: string) => {
    try {
      setLoadingDeliveries(true);
      const response = await fetch(`/api/webhooks/incoming/${webhookId}/deliveries?limit=20`);
      const data = await response.json();
      
      if (response.ok) {
        setDeliveries(data.entregas);
      } else {
        toast.error('Error al cargar entregas');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar entregas');
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleCreate = async () => {
    try {
      if (!formData.nombre) {
        toast.error('El nombre es requerido');
        return;
      }

      setCreatingWebhook(true);
      
      const response = await fetch('/api/webhooks/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Webhook creado exitosamente');
        setDialogOpen(false);
        resetForm();
        fetchWebhooks();
      } else {
        toast.error(data.error || 'Error al crear webhook');
        console.error('Error del servidor:', data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear webhook');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar el webhook "${nombre}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/webhooks/incoming/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Webhook eliminado');
        fetchWebhooks();
      } else {
        toast.error('Error al eliminar webhook');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar webhook');
    }
  };

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      const response = await fetch(`/api/webhooks/incoming/${webhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !webhook.activo })
      });

      if (response.ok) {
        toast.success(webhook.activo ? 'Webhook desactivado' : 'Webhook activado');
        fetchWebhooks();
      } else {
        toast.error('Error al actualizar webhook');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar webhook');
    }
  };

  const handleTest = async (webhookId: string, nombre: string) => {
    try {
      setTestingId(webhookId);
      const response = await fetch(`/api/webhooks/incoming/${webhookId}/test`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Webhook "${nombre}" probado exitosamente`);
      } else {
        toast.error(data.message || 'Error al probar webhook');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al probar webhook');
    } finally {
      setTestingId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('URL copiada al portapapeles');
    
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      descripcion: '',
      accion: 'crear_lead',
      mapeoNombre: 'nombre',
      mapeoEmail: 'email',
      mapeoTelefono: 'telefono',
      mapeoEmpresa: 'empresa',
      mapeoNotas: 'notas',
      automationId: '',
      generarSecret: false
    });
  };

  const getAccionLabel = (accion: string) => {
    const labels: Record<string, string> = {
      crear_lead: 'Crear Lead',
      actualizar_lead: 'Actualizar Lead',
      crear_tarea: 'Crear Tarea',
      disparar_automatizacion: 'Disparar Automatización',
      webhook_personalizado: 'Webhook Personalizado'
    };
    return labels[accion] || accion;
  };

  const getAccionIcon = (accion: string) => {
    switch (accion) {
      case 'crear_lead':
        return '👤';
      case 'actualizar_lead':
        return '✏️';
      case 'crear_tarea':
        return '✅';
      case 'disparar_automatizacion':
        return '⚡';
      default:
        return '🔧';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Webhooks de Entrada</h1>
          <p className="text-gray-600 mt-2">
            Recibe datos desde n8n, Make, Zapier y otras plataformas de automatización
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Webhook</DialogTitle>
              <DialogDescription>
                Configura un webhook para recibir datos externos
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <Label htmlFor="nombre">Nombre del Webhook *</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Leads desde n8n"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>

              {/* Descripción */}
              <div>
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  placeholder="Describe el propósito de este webhook"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Acción */}
              <div>
                <Label htmlFor="accion">Acción a Realizar *</Label>
                <Select 
                  value={formData.accion} 
                  onValueChange={(value) => setFormData({ ...formData, accion: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crear_lead">👤 Crear Lead</SelectItem>
                    <SelectItem value="actualizar_lead">✏️ Actualizar Lead</SelectItem>
                    <SelectItem value="crear_tarea">✅ Crear Tarea</SelectItem>
                    <SelectItem value="disparar_automatizacion">⚡ Disparar Automatización</SelectItem>
                    <SelectItem value="webhook_personalizado">🔧 Webhook Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mapeo de campos (solo para crear_lead y actualizar_lead) */}
              {(formData.accion === 'crear_lead' || formData.accion === 'actualizar_lead') && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-sm">Mapeo de Campos</h3>
                  <p className="text-xs text-gray-600">
                    Especifica qué campos del payload corresponden a los datos del lead
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="mapeoNombre" className="text-xs">Campo Nombre</Label>
                      <Input
                        id="mapeoNombre"
                        placeholder="nombre"
                        value={formData.mapeoNombre}
                        onChange={(e) => setFormData({ ...formData, mapeoNombre: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="mapeoEmail" className="text-xs">Campo Email</Label>
                      <Input
                        id="mapeoEmail"
                        placeholder="email"
                        value={formData.mapeoEmail}
                        onChange={(e) => setFormData({ ...formData, mapeoEmail: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="mapeoTelefono" className="text-xs">Campo Teléfono</Label>
                      <Input
                        id="mapeoTelefono"
                        placeholder="telefono"
                        value={formData.mapeoTelefono}
                        onChange={(e) => setFormData({ ...formData, mapeoTelefono: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="mapeoEmpresa" className="text-xs">Campo Empresa</Label>
                      <Input
                        id="mapeoEmpresa"
                        placeholder="empresa"
                        value={formData.mapeoEmpresa}
                        onChange={(e) => setFormData({ ...formData, mapeoEmpresa: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <Label htmlFor="mapeoNotas" className="text-xs">Campo Notas</Label>
                      <Input
                        id="mapeoNotas"
                        placeholder="notas"
                        value={formData.mapeoNotas}
                        onChange={(e) => setFormData({ ...formData, mapeoNotas: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Selección de automatización */}
              {formData.accion === 'disparar_automatizacion' && (
                <div>
                  <Label htmlFor="automationId">Automatización a Disparar *</Label>
                  <Select 
                    value={formData.automationId} 
                    onValueChange={(value) => setFormData({ ...formData, automationId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una automatización" />
                    </SelectTrigger>
                    <SelectContent>
                      {automations.filter(a => a.activo).map((automation) => (
                        <SelectItem key={automation.id} value={automation.id}>
                          {automation.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Seguridad */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="generarSecret"
                  checked={formData.generarSecret}
                  onChange={(e) => setFormData({ ...formData, generarSecret: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="generarSecret" className="text-sm">
                  Generar Secret Key para validación HMAC (recomendado)
                </Label>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  El Secret Key se generará automáticamente y se mostrará después de crear el webhook.
                  Úsalo para firmar tus requests y garantizar la seguridad.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creatingWebhook}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creatingWebhook}>
                {creatingWebhook ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear Webhook'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de Webhooks */}
      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay webhooks configurados
            </h3>
            <p className="text-gray-600 mb-4 text-center max-w-md">
              Crea tu primer webhook para empezar a recibir datos desde plataformas externas
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
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getAccionIcon(webhook.accion)}</span>
                      <div>
                        <CardTitle className="text-lg">{webhook.nombre}</CardTitle>
                        <CardDescription>
                          {webhook.descripcion || 'Sin descripción'}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={webhook.activo ? 'default' : 'secondary'}>
                      {webhook.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleActive(webhook)}
                    >
                      {webhook.activo ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(webhook.id, webhook.nombre)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Información del webhook */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Acción</p>
                    <p className="font-medium">{getAccionLabel(webhook.accion)}</p>
                  </div>
                  
                  {webhook.automation && (
                    <div>
                      <p className="text-gray-600">Automatización</p>
                      <p className="font-medium">{webhook.automation.nombre}</p>
                    </div>
                  )}
                  
                  <div>
                    <p className="text-gray-600">Entregas</p>
                    <p className="font-medium">{webhook.totalRecibidos}</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-600">Último Recibido</p>
                    <p className="font-medium">
                      {webhook.ultimoRecibido 
                        ? new Date(webhook.ultimoRecibido).toLocaleDateString() 
                        : 'Nunca'}
                    </p>
                  </div>
                </div>

                {/* URL del webhook */}
                <div className="space-y-2">
                  <Label className="text-xs text-gray-600">URL del Webhook</Label>
                  <div className="flex gap-2">
                    <Input
                      value={webhook.url}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(webhook.url, webhook.id)}
                    >
                      {copiedId === webhook.id ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(webhook.id, webhook.nombre)}
                    disabled={!webhook.activo || testingId === webhook.id}
                  >
                    {testingId === webhook.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Probar
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedWebhook(webhook);
                      fetchDeliveries(webhook.id);
                      setDeliveriesDialogOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Entregas ({webhook.totalEntregas})
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`https://webhook.site/#!/${webhook.id}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Docs
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Entregas */}
      <Dialog open={deliveriesDialogOpen} onOpenChange={setDeliveriesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Entregas de: {selectedWebhook?.nombre}
            </DialogTitle>
            <DialogDescription>
              Historial de webhooks recibidos
            </DialogDescription>
          </DialogHeader>
          
          {loadingDeliveries ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No hay entregas registradas
            </div>
          ) : (
            <div className="space-y-4">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={delivery.estado === 'exitoso' ? 'default' : 'destructive'}>
                      {delivery.estado}
                    </Badge>
                    <span className="text-xs text-gray-600">
                      {new Date(delivery.fechaRecepcion).toLocaleString()}
                    </span>
                  </div>
                  
                  {delivery.errorMensaje && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {delivery.errorMensaje}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-600">IP:</span> {delivery.ipAddress || 'N/A'}
                    </div>
                    <div>
                      <span className="text-gray-600">Método:</span> {delivery.metodo}
                    </div>
                    {delivery.leadCreado && (
                      <div>
                        <span className="text-gray-600">Lead:</span> {delivery.leadCreado}
                      </div>
                    )}
                    {delivery.tareaCreada && (
                      <div>
                        <span className="text-gray-600">Tarea:</span> {delivery.tareaCreada}
                      </div>
                    )}
                  </div>
                  
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      Ver Payload
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">
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
