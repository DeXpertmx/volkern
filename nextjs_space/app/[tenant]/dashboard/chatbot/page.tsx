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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  BookOpen,
  Database,
  Search,
  FileText,
  Tag,
  Eye,
  FlaskConical,
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
  ragActivo: boolean;
}

interface Servicio {
  id: string;
  nombre: string;
  duracionMinutos: number;
  precio: number;
}

interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  vectorId: string | null;
  createdAt: string;
  updatedAt: string;
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

  // Knowledge Base
  const [kbArticles, setKbArticles] = useState<KnowledgeArticle[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSearch, setKbSearch] = useState('');
  const [kbSelectedArticle, setKbSelectedArticle] = useState<KnowledgeArticle | null>(null);

  // Probar RAG
  const [ragTestQuery, setRagTestQuery] = useState('');
  const [ragTestResults, setRagTestResults] = useState<(KnowledgeArticle & { similarity?: number })[] | null>(null);
  const [ragTestLoading, setRagTestLoading] = useState(false);

  // Bulk toggle
  const [bulkCategory, setBulkCategory] = useState<string>('Todas');
  const [bulkLoading, setBulkLoading] = useState(false);

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

  const fetchKnowledgeArticles = async () => {
    try {
      setKbLoading(true);
      const params = new URLSearchParams();
      if (kbSearch) params.set('q', kbSearch);
      const res = await fetch(`/api/knowledge?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setKbArticles(data);
      }
    } catch (error) {
      console.error('Error cargando artículos:', error);
    } finally {
      setKbLoading(false);
    }
  };

  const testRagSearch = async () => {
    if (!ragTestQuery.trim()) return;
    try {
      setRagTestLoading(true);
      setRagTestResults(null);
      const params = new URLSearchParams({ q: ragTestQuery, semantic: 'true' });
      const res = await fetch(`/api/knowledge?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRagTestResults(data);
      } else {
        toast.error('Error al probar RAG');
      }
    } catch (error) {
      toast.error('Error al probar RAG');
    } finally {
      setRagTestLoading(false);
    }
  };

  const togglePublic = async (article: KnowledgeArticle) => {
    const newValue = !article.isPublic;
    setKbArticles(prev => prev.map(a => a.id === article.id ? { ...a, isPublic: newValue } : a));
    if (kbSelectedArticle?.id === article.id) {
      setKbSelectedArticle({ ...kbSelectedArticle, isPublic: newValue });
    }
    try {
      const res = await fetch(`/api/knowledge/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: newValue }),
      });
      if (!res.ok) {
        setKbArticles(prev => prev.map(a => a.id === article.id ? { ...a, isPublic: !newValue } : a));
        if (kbSelectedArticle?.id === article.id) {
          setKbSelectedArticle(prev => prev ? { ...prev, isPublic: !newValue } : null);
        }
        toast.error('Error al cambiar visibilidad');
      } else {
        toast.success(newValue ? 'Artículo ahora es público (RAG activo)' : 'Artículo ahora es privado');
      }
    } catch {
      setKbArticles(prev => prev.map(a => a.id === article.id ? { ...a, isPublic: !newValue } : a));
      if (kbSelectedArticle?.id === article.id) {
        setKbSelectedArticle(prev => prev ? { ...prev, isPublic: !newValue } : null);
      }
      toast.error('Error al cambiar visibilidad');
    }
  };

  const toggleAllPublic = async (category: string, makePublic: boolean) => {
    const targets = category === 'Todas'
      ? kbArticles
      : kbArticles.filter(a => a.category === category);
    if (targets.length === 0) return;

    const action = makePublic ? 'públicos' : 'privados';
    if (!confirm(`¿Hacer ${action} ${targets.length} artículo(s)${category !== 'Todas' ? ' de ' + category : ''}?`)) return;

    setBulkLoading(true);
    setKbArticles(prev => prev.map(a =>
      (category === 'Todas' || a.category === category) ? { ...a, isPublic: makePublic } : a
    ));
    if (kbSelectedArticle && (category === 'Todas' || kbSelectedArticle.category === category)) {
      setKbSelectedArticle({ ...kbSelectedArticle, isPublic: makePublic });
    }

    let failed = 0;
    for (const article of targets) {
      try {
        const res = await fetch(`/api/knowledge/${article.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: makePublic }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }

    if (failed > 0) {
      toast.error(`${failed} de ${targets.length} artículos fallaron al actualizar`);
      fetchKnowledgeArticles();
    } else {
      toast.success(`${targets.length} artículo(s) ahora ${action}`);
    }
    setBulkLoading(false);
    setBulkCategory('Todas');
  };

  const publicArticles = kbArticles.filter(a => a.isPublic);
  const privateArticles = kbArticles.filter(a => !a.isPublic);

  const CATEGORY_COLORS: Record<string, string> = {
    FISCAL: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    ACCOUNTING: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    POLICY: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    SOP: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    TECHNICAL: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    CULTURE: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
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
          <TabsTrigger value="conocimiento" className="gap-2" onClick={() => { if (kbArticles.length === 0) fetchKnowledgeArticles(); }}>
            <Database className="h-4 w-4" />
            Conocimiento
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

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">RAG Activo (Knowledge Base)</p>
                  <p className="text-sm text-muted-foreground">
                    El chatbot buscará en los artículos de conocimiento para responder con información precisa de tu empresa
                  </p>
                </div>
                <Switch
                  checked={config.ragActivo}
                  onCheckedChange={(checked) => setConfig({ ...config, ragActivo: checked })}
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

        {/* Conocimiento (RAG) Tab */}
        <TabsContent value="conocimiento">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Panel izquierdo: Lista de artículos */}
            <div className="md:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        Base de Conocimiento (RAG)
                      </CardTitle>
                      <CardDescription>
                        Estos artículos son usados por el chatbot para responder con información precisa de tu empresa
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/dashboard/knowledge" className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Gestionar Artículos
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Barra de búsqueda */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar artículos..."
                      value={kbSearch}
                      onChange={(e) => setKbSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') fetchKnowledgeArticles(); }}
                      className="pl-10"
                    />
                  </div>

                  {/* Bulk actions bar */}
                  {kbArticles.length > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Select value={bulkCategory} onValueChange={setBulkCategory}>
                        <SelectTrigger className="text-xs h-8 w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Todas">Todas las categorías</SelectItem>
                          {[...new Set(kbArticles.map(a => a.category))].sort().map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex-1" />
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        disabled={bulkLoading}
                        onClick={() => toggleAllPublic(bulkCategory, true)}
                      >
                        {bulkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Hacer públicos
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        disabled={bulkLoading}
                        onClick={() => toggleAllPublic(bulkCategory, false)}
                      >
                        Hacer privados
                      </Button>
                    </div>
                  )}

                  {/* Lista de artículos */}
                  {kbLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : kbArticles.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Sin artículos de conocimiento</h3>
                      <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                        Crea artículos en el Knowledge Hub para que el chatbot pueda responder con información real de tu empresa.
                      </p>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/dashboard/knowledge">
                          <BookOpen className="h-4 w-4 mr-2" />
                          Ir al Knowledge Hub
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {kbArticles.map((article) => (
                        <div
                          key={article.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                            kbSelectedArticle?.id === article.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'hover:border-primary/50'
                          }`}
                          onClick={() => setKbSelectedArticle(article)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-sm truncate">{article.title}</h4>
                                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <span className={`text-[10px] font-medium ${article.isPublic ? 'text-green-600' : 'text-muted-foreground'}`}>
                                    {article.isPublic ? 'RAG' : 'PRIV'}
                                  </span>
                                  <Switch
                                    checked={article.isPublic}
                                    onCheckedChange={() => togglePublic(article)}
                                    className="scale-75"
                                    aria-label={article.isPublic ? 'Hacer privado' : 'Hacer público'}
                                  />
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                {article.content.substring(0, 200)}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className={`text-xs ${CATEGORY_COLORS[article.category] || ''}`}>
                                  {article.category}
                                </Badge>
                                {article.tags?.slice(0, 3).map((tag: string) => (
                                  <span key={tag} className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Tag className="h-3 w-3" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Panel derecho: Preview y stats */}
            <div className="space-y-4">
              {/* Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Estado del RAG
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Artículos RAG</span>
                    </div>
                    <span className="font-bold text-lg text-green-700 dark:text-green-300">{publicArticles.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Privados</span>
                    </div>
                    <span className="font-bold text-lg text-muted-foreground">{privateArticles.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">Con embeddings</span>
                    </div>
                    <span className="font-bold text-lg text-blue-700 dark:text-blue-300">
                      {kbArticles.filter(a => a.vectorId).length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Preview del artículo seleccionado */}
              {kbSelectedArticle ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Vista Previa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <h4 className="font-semibold">{kbSelectedArticle.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className={`text-xs ${CATEGORY_COLORS[kbSelectedArticle.category] || ''}`}>
                          {kbSelectedArticle.category}
                        </Badge>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] font-medium ${kbSelectedArticle.isPublic ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {kbSelectedArticle.isPublic ? 'RAG' : 'PRIV'}
                          </span>
                          <Switch
                            checked={kbSelectedArticle.isPublic}
                            onCheckedChange={() => togglePublic(kbSelectedArticle)}
                            className="scale-75"
                            aria-label={kbSelectedArticle.isPublic ? 'Hacer privado' : 'Hacer público'}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-3 max-h-[300px] overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {kbSelectedArticle.content}
                      </p>
                    </div>
                    {kbSelectedArticle.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {kbSelectedArticle.tags.map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Creado: {new Date(kbSelectedArticle.createdAt).toLocaleDateString('es-MX')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Selecciona un artículo para ver su contenido
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Probar RAG */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    Probar RAG
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ej: ¿Qué es el modelo 303?"
                      value={ragTestQuery}
                      onChange={(e) => setRagTestQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') testRagSearch(); }}
                      className="text-xs"
                    />
                    <Button size="sm" onClick={testRagSearch} disabled={ragTestLoading || !ragTestQuery.trim()}>
                      {ragTestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {ragTestResults !== null && (
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {ragTestResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          No se encontraron artículos relevantes para esta consulta
                        </p>
                      ) : (
                        ragTestResults.map((article, idx) => (
                          <div key={article.id} className="p-2 rounded border bg-muted/50 text-xs">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-medium truncate">{article.title}</span>
                              {article.similarity !== undefined && (
                                <Badge variant={article.similarity > 0.6 ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                                  {Math.round(article.similarity * 100)}%
                                </Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground line-clamp-2">{article.content.substring(0, 150)}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="text-[10px]">{article.category}</Badge>
                              <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cómo funciona */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">¿Cómo funciona el RAG?</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                      <p>El cliente hace una pregunta al chatbot</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                      <p>El motor busca en los artículos <strong>RAG</strong> usando similitud semántica</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                      <p>Los artículos más relevantes se inyectan en el prompt del asistente</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
                      <p>El chatbot responde con información precisa basada en tus artículos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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
