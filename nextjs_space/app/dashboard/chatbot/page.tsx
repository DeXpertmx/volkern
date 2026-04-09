'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ChatTestWidget } from '@/components/chatbot/ChatTestWidget';
import { HorariosEditor } from '@/components/chatbot/HorariosEditor';
import {
  Bot,
  Settings,
  Calendar,
  MessageSquare,
  Users,
  Clock,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  BarChart3,
  Zap,
  Code,
  Copy,
  Check,
  Globe,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TimeRange {
  inicio: string;
  fin: string;
}

interface HorariosPersonalizados {
  [key: string]: TimeRange[];
}

interface ChatbotConfig {
  id: string;
  activo: boolean;
  nombreAsistente: string;
  mensajeBienvenida: string | null;
  mensajeFueraHorario: string | null;
  personalidad: string | null;
  contextoNegocio: string | null;
  horarioInicio: number;
  horarioFin: number;
  diasActivos: string;
  timezone: string;
  horariosPersonalizados: HorariosPersonalizados | null;
  puedeAgendarCitas: boolean;
  puedeMostrarServicios: boolean;
  puedeTransferirHumano: boolean;
  maxMensajesPorConversacion: number;
  tiempoEsperaTransferencia: number;
  totalConversaciones: number;
  totalCitasAgendadas: number;
  totalTransferencias: number;
}

interface Servicio {
  id: string;
  nombre: string;
  duracionMinutos: number;
  precio: number;
}

export default function ChatbotPage() {
  const { data: session } = useSession() || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tenantNombre, setTenantNombre] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [isHired, setIsHired] = useState(true);
  const [copied, setCopied] = useState(false);

  // Cargar configuración
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/chatbot/config');
      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setConfig(data.config);
      setServicios(data.servicios || []);
      setTenantNombre(data.tenantNombre || '');
      setTenantId(data.tenantId || '');
      setIsHired(data.isHired !== false);
    } catch (error) {
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      const res = await fetch('/api/chatbot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Configuración guardada correctamente');
      setConfig(data.config);
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No se pudo cargar la configuración del chatbot.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            Chatbot WhatsApp
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura tu asistente virtual para atender clientes automáticamente
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="activo">Chatbot Activo</Label>
            <Switch
              id="activo"
              checked={config.activo}
              disabled={!isHired || saving}
              onCheckedChange={(checked) => setConfig({ ...config, activo: checked })}
            />
          </div>
          <Button onClick={saveConfig} disabled={saving || !isHired}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar
          </Button>
        </div>
      </div>
      
      {/* Subscription Warning */}
      {!isHired && (
        <Alert variant="destructive" className="border-2">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-bold">Servicio no contratado</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3">
            <p>
              El módulo de Chatbot IA (WhatsApp & Web) no está incluido en tu plan actual. 
              Para activarlo y empezar a automatizar tus conversaciones, necesitas mejorar tu plan o adquirir el Add-on correspondiente.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="bg-destructive/10 hover:bg-destructive/20" asChild>
                <a href="/dashboard/configuracion/planes" className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Ver Planes y Precios
                </a>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Status Banner */}
      <Card className={config.activo ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'}>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            {config.activo ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-yellow-600" />
            )}
            <div>
              <p className="font-medium">
                {config.activo ? 'Chatbot Activo' : 'Chatbot Inactivo'}
              </p>
              <p className="text-sm text-muted-foreground">
                {config.activo
                  ? 'El chatbot está respondiendo mensajes de WhatsApp automáticamente'
                  : 'Activa el chatbot para que responda mensajes automáticamente'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{config.totalConversaciones}</p>
                <p className="text-sm text-muted-foreground">Conversaciones</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{config.totalCitasAgendadas}</p>
                <p className="text-sm text-muted-foreground">Citas Agendadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg dark:bg-purple-900">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{config.totalTransferencias}</p>
                <p className="text-sm text-muted-foreground">Transferencias</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg dark:bg-orange-900">
                <Zap className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{servicios.length}</p>
                <p className="text-sm text-muted-foreground">Servicios Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="personalidad" className="gap-2">
            <Bot className="h-4 w-4" />
            Personalidad
          </TabsTrigger>
          <TabsTrigger value="horarios" className="gap-2">
            <Clock className="h-4 w-4" />
            Horarios
          </TabsTrigger>
          <TabsTrigger value="funciones" className="gap-2">
            <Zap className="h-4 w-4" />
            Funciones
          </TabsTrigger>
          <TabsTrigger value="embeber" className="gap-2">
            <Code className="h-4 w-4" />
            Embeber
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Configuración General</CardTitle>
              <CardDescription>
                Configura los datos básicos de tu asistente virtual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombreAsistente">Nombre del Asistente</Label>
                <Input
                  id="nombreAsistente"
                  value={config.nombreAsistente}
                  onChange={(e) => setConfig({ ...config, nombreAsistente: e.target.value })}
                  placeholder="Ej: Ana, tu asistente virtual"
                />
                <p className="text-sm text-muted-foreground">
                  Este nombre se usará para presentarse con los clientes
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mensajeBienvenida">Mensaje de Bienvenida (Opcional)</Label>
                <Textarea
                  id="mensajeBienvenida"
                  value={config.mensajeBienvenida || ''}
                  onChange={(e) => setConfig({ ...config, mensajeBienvenida: e.target.value })}
                  placeholder="¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte hoy?"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mensajeFueraHorario">Mensaje Fuera de Horario (Opcional)</Label>
                <Textarea
                  id="mensajeFueraHorario"
                  value={config.mensajeFueraHorario || ''}
                  onChange={(e) => setConfig({ ...config, mensajeFueraHorario: e.target.value })}
                  placeholder="Gracias por escribirnos. Nuestro horario de atención es de 9am a 6pm. Te responderemos pronto."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personalidad Tab */}
        <TabsContent value="personalidad">
          <Card>
            <CardHeader>
              <CardTitle>Personalidad e Instrucciones</CardTitle>
              <CardDescription>
                Define cómo debe comportarse y qué debe saber tu asistente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contextoNegocio">Contexto del Negocio</Label>
                <Textarea
                  id="contextoNegocio"
                  value={config.contextoNegocio || ''}
                  onChange={(e) => setConfig({ ...config, contextoNegocio: e.target.value })}
                  placeholder="Somos una clínica dental especializada en ortodoncia y estética dental. Ofrecemos tratamientos de alta calidad con tecnología de vanguardia..."
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  Describe tu negocio, servicios principales y cualquier información relevante
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="personalidad">Personalidad y Tono</Label>
                <Textarea
                  id="personalidad"
                  value={config.personalidad || ''}
                  onChange={(e) => setConfig({ ...config, personalidad: e.target.value })}
                  placeholder="Sé amable, profesional y empático. Usa un tono cercano pero respetuoso. Responde de forma concisa y clara..."
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  Define cómo quieres que se comunique el asistente
                </p>
              </div>

              {/* Servicios disponibles */}
              <div className="space-y-2">
                <Label>Servicios Disponibles</Label>
                <div className="border rounded-lg p-4 space-y-2">
                  {servicios.length > 0 ? (
                    servicios.map((servicio) => (
                      <div key={servicio.id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="font-medium">{servicio.nombre}</span>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{servicio.duracionMinutos} min</Badge>
                          <Badge variant="outline">${servicio.precio}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay servicios configurados. Ve a Servicios para agregar.
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Estos son los servicios que el chatbot puede ofrecer y agendar
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Horarios Tab */}
        <TabsContent value="horarios">
          <Card>
            <CardHeader>
              <CardTitle>Horarios de Atención</CardTitle>
              <CardDescription>
                Configura cuándo debe responder el chatbot. Puedes definir múltiples rangos de horarios por día con intervalos de 15 minutos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HorariosEditor
                value={config.horariosPersonalizados}
                onChange={(horarios) => setConfig({ ...config, horariosPersonalizados: horarios })}
                legacyHorarioInicio={config.horarioInicio}
                legacyHorarioFin={config.horarioFin}
                legacyDiasActivos={config.diasActivos}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funciones Tab */}
        <TabsContent value="funciones">
          <Card>
            <CardHeader>
              <CardTitle>Funcionalidades</CardTitle>
              <CardDescription>
                Activa o desactiva las capacidades del chatbot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Agendar Citas</p>
                  <p className="text-sm text-muted-foreground">
                    Permite al chatbot agendar citas con los servicios disponibles
                  </p>
                </div>
                <Switch
                  checked={config.puedeAgendarCitas}
                  onCheckedChange={(checked) => setConfig({ ...config, puedeAgendarCitas: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Mostrar Servicios</p>
                  <p className="text-sm text-muted-foreground">
                    Permite al chatbot informar sobre los servicios y precios
                  </p>
                </div>
                <Switch
                  checked={config.puedeMostrarServicios}
                  onCheckedChange={(checked) => setConfig({ ...config, puedeMostrarServicios: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Transferir a Humano</p>
                  <p className="text-sm text-muted-foreground">
                    Permite al cliente solicitar hablar con un agente humano
                  </p>
                </div>
                <Switch
                  checked={config.puedeTransferirHumano}
                  onCheckedChange={(checked) => setConfig({ ...config, puedeTransferirHumano: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxMensajes">Máximo de mensajes por conversación</Label>
                <Input
                  id="maxMensajes"
                  type="number"
                  min={10}
                  max={200}
                  value={config.maxMensajesPorConversacion}
                  onChange={(e) => setConfig({ ...config, maxMensajesPorConversacion: parseInt(e.target.value) })}
                />
                <p className="text-sm text-muted-foreground">
                  Después de este límite, el chatbot sugerirá transferir a un humano
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embeber Tab */}
        <TabsContent value="embeber">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Embeber en tu Sitio Web
                </CardTitle>
                <CardDescription>
                  Copia y pega este código en tu sitio web para agregar el chatbot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Código de Integración</Label>
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                      <code>{`<script 
  src="https://volkern.app/chatbot-widget.js" 
  data-widget-key="${tenantId}"
></script>`}</code>
                    </pre>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        const code = `<script src="https://volkern.app/chatbot-widget.js" data-widget-key="${tenantId}"></script>`;
                        navigator.clipboard.writeText(code);
                        setCopied(true);
                        toast.success('Código copiado al portapapeles');
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Opciones Adicionales</Label>
                  <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                    <p><strong>data-color</strong>: Color principal del widget (ej: #2563eb)</p>
                    <p><strong>data-position</strong>: Posición (left o right, default: right)</p>
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Nota:</strong> El chatbot debe estar <strong>activo</strong> para funcionar en sitios externos.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Instrucciones de Instalación</CardTitle>
                <CardDescription>
                  Sigue estos pasos para agregar el chatbot a tu sitio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      1
                    </div>
                    <p className="text-sm">Copia el código de integración</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      2
                    </div>
                    <p className="text-sm">Pega el código antes de cerrar la etiqueta <code className="bg-muted px-1 rounded">&lt;/body&gt;</code></p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      3
                    </div>
                    <p className="text-sm">Guarda y publica tu sitio web</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      4
                    </div>
                    <p className="text-sm">¡Listo! El widget aparecerá en la esquina inferior</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label className="text-muted-foreground">Ejemplo con opciones:</Label>
                  <pre className="bg-muted p-3 rounded-lg text-xs mt-2 overflow-x-auto">
                    <code>{`<script 
  src="https://volkern.app/chatbot-widget.js" 
  data-widget-key="${tenantId}"
  data-color="#10B981"
  data-position="left"
></script>`}</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Widget de Pruebas */}
      <ChatTestWidget 
        nombreAsistente={config.nombreAsistente} 
        activo={config.activo} 
      />
    </div>
  );
}
