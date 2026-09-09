
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Save,
  ArrowLeft,
  Mail,
  MessageSquare,
  Send,
  Plus,
  X,
  Users,
  Target,
  Trash2,
  Copy,
  TestTube2,
  ImageIcon,
  Sparkles,
  Upload,
  RefreshCw,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import CanvaDesigner from '@/components/canva-designer';
import { EmailEditor } from '@/components/email-editor';
import { getCanalesDisponibles } from '@/lib/campaign-channels';

interface CampaignMessage {
  canal: string;
  asunto: string;
  contenido: string;
  mediaUrl?: string;
  orden: number;
  variante?: string;
  porcentajeTrafico?: number;
}

// Íconos de UI por canal (el catálogo vive en lib/campaign-channels.ts, sin
// dependencias de React para poder usarse también en schemas del servidor).
const canalIcons: Record<string, any> = {
  whatsapp: MessageSquare,
  email: Mail,
  sms: MessageSquare,
  telegram: Send,
  facebook: MessageSquare,
  instagram: MessageSquare,
};

const canalesDisponibles = getCanalesDisponibles().map((c) => ({
  ...c,
  icon: canalIcons[c.id],
}));

export default function NuevaCampanaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basico');
  
  // Datos básicos
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('manual');
  
  // Canales
  const [canalesSeleccionados, setCanalesSeleccionados] = useState<string[]>([]);
  
  // Segmentación
  const [targetType, setTargetType] = useState('todos');
  const [targetConfig, setTargetConfig] = useState<any>({});
  
  // Mensajes
  const [mensajes, setMensajes] = useState<CampaignMessage[]>([]);
  
  // A/B Testing
  const [variantes, setVariantes] = useState<Array<{ id: string; nombre: string; porcentaje: number }>>([
    { id: 'A', nombre: 'Variante A', porcentaje: 50 },
    { id: 'B', nombre: 'Variante B', porcentaje: 50 },
  ]);

  // Estados para imágenes
  const [showAIImageDialog, setShowAIImageDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentImageKey, setCurrentImageKey] = useState<string>(''); // Para identificar qué mensaje está siendo editado
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Canva Designer
  const [showCanvaDialog, setShowCanvaDialog] = useState(false);
  const [canvaTemplateId, setCanvaTemplateId] = useState<string>('facebook_ad');

  // Plantillas
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<string>('');

  // Efecto para cargar plantillas
  useEffect(() => {
    cargarPlantillas();
  }, []);

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

  const handlePlantillaChange = async (plantillaId: string) => {
    setPlantillaSeleccionada(plantillaId);
    
    if (!plantillaId) return;

    // Encontrar el mensaje de email actual y actualizar su contenido
    try {
      const res = await fetch(`/api/cms/templates/${plantillaId}`);
      if (!res.ok) throw new Error('Error al cargar plantilla');
      const plantilla = await res.json();
      
      // Actualizar los mensajes de email con el contenido de la plantilla
      setMensajes((prev) =>
        prev.map((m) => {
          if (m.canal === 'email') {
            return {
              ...m,
              asunto: m.asunto || plantilla.asuntoPorDefecto || '',
              contenido: plantilla.contenidoHTML || m.contenido,
            };
          }
          return m;
        })
      );
      
      toast.success('Plantilla aplicada');
    } catch (error: any) {
      toast.error('Error al aplicar plantilla');
    }
  };

  // Efecto para resetear tab activo si el tipo cambia y el tab actual ya no está disponible
  useEffect(() => {
    if (tipo !== 'a_b_test' && activeTab === 'variantes') {
      setActiveTab('basico');
    }
  }, [tipo, activeTab]);

  const toggleCanal = (canalId: string) => {
    setCanalesSeleccionados((prev) =>
      prev.includes(canalId)
        ? prev.filter((c) => c !== canalId)
        : [...prev, canalId]
    );

    // Agregar mensaje para el canal si no existe
    if (!canalesSeleccionados.includes(canalId)) {
      if (tipo === 'a_b_test') {
        // Para A/B test, crear un mensaje por cada variante
        const nuevosMensajes = variantes.map((variante, index) => ({
          canal: canalId,
          asunto: canalId === 'email' ? `Asunto ${variante.nombre}` : '',
          contenido: '',
          orden: mensajes.length + index,
          variante: variante.id,
          porcentajeTrafico: variante.porcentaje,
        }));
        setMensajes((prev) => [...prev, ...nuevosMensajes]);
      } else {
        // Para campañas normales, un mensaje por canal
        setMensajes((prev) => [
          ...prev,
          {
            canal: canalId,
            asunto: canalId === 'email' ? 'Asunto del email' : '',
            contenido: '',
            orden: prev.length,
          },
        ]);
      }
    } else {
      // Eliminar mensajes del canal
      setMensajes((prev) => prev.filter((m) => m.canal !== canalId));
    }
  };

  const agregarVariante = () => {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextId = letras[variantes.length];
    if (variantes.length >= 5) {
      toast.error('Máximo 5 variantes permitidas');
      return;
    }
    
    // Redistribuir porcentajes equitativamente
    const numVariantes = variantes.length + 1;
    const porcentajeEquitativo = Math.floor(100 / numVariantes);
    const nuevasVariantes = variantes.map((v) => ({
      ...v,
      porcentaje: porcentajeEquitativo,
    }));
    nuevasVariantes.push({
      id: nextId,
      nombre: `Variante ${nextId}`,
      porcentaje: porcentajeEquitativo,
    });
    
    setVariantes(nuevasVariantes);
    
    // Actualizar mensajes existentes con nuevos porcentajes y agregar mensajes para la nueva variante
    setMensajes((prev) => {
      const actualizados = prev.map((m) => ({
        ...m,
        porcentajeTrafico: porcentajeEquitativo,
      }));
      
      // Agregar mensajes para la nueva variante en los canales seleccionados
      const nuevosMensajes = canalesSeleccionados.map((canal) => ({
        canal,
        asunto: canal === 'email' ? `Asunto Variante ${nextId}` : '',
        contenido: '',
        orden: actualizados.length,
        variante: nextId,
        porcentajeTrafico: porcentajeEquitativo,
      }));
      
      return [...actualizados, ...nuevosMensajes];
    });
  };

  const eliminarVariante = (varianteId: string) => {
    if (variantes.length <= 2) {
      toast.error('Debe haber al menos 2 variantes');
      return;
    }
    
    // Eliminar variante
    const nuevasVariantes = variantes.filter((v) => v.id !== varianteId);
    
    // Redistribuir porcentajes
    const porcentajeEquitativo = Math.floor(100 / nuevasVariantes.length);
    const actualizadas = nuevasVariantes.map((v) => ({
      ...v,
      porcentaje: porcentajeEquitativo,
    }));
    
    setVariantes(actualizadas);
    
    // Eliminar mensajes de la variante
    setMensajes((prev) => prev.filter((m) => m.variante !== varianteId));
  };

  const actualizarPorcentajeVariante = (varianteId: string, porcentaje: number) => {
    if (porcentaje < 0 || porcentaje > 100) return;
    
    setVariantes((prev) =>
      prev.map((v) => (v.id === varianteId ? { ...v, porcentaje } : v))
    );
    
    // Actualizar porcentajes en mensajes
    setMensajes((prev) =>
      prev.map((m) => (m.variante === varianteId ? { ...m, porcentajeTrafico: porcentaje } : m))
    );
  };

  const actualizarMensaje = (canal: string, campo: string, valor: string, variante?: string) => {
    setMensajes((prev) =>
      prev.map((m) => {
        if (tipo === 'a_b_test') {
          // Para A/B test, actualizar solo el mensaje de la variante específica
          return m.canal === canal && m.variante === variante ? { ...m, [campo]: valor } : m;
        } else {
          // Para campañas normales
          return m.canal === canal ? { ...m, [campo]: valor } : m;
        }
      })
    );
  };

  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>, canal: string, variante?: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen válido');
      return;
    }

    // Validar tamaño (máx 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen debe ser menor a 5MB');
      return;
    }

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/mensajes/upload-image', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Actualizar el mensaje con la URL de la imagen
        actualizarMensaje(canal, 'mediaUrl', data.cloud_storage_path, variante);
        toast.success('Imagen subida exitosamente');
      } else {
        toast.error(data.error || 'Error al subir la imagen');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al subir la imagen');
    } finally {
      setUploadingImage(false);
      // Resetear el input file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenAIImageDialog = (canal: string, variante?: string) => {
    setCurrentImageKey(variante ? `${canal}-${variante}` : canal);
    setShowAIImageDialog(true);
  };

  const handleGenerateAIImage = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Por favor ingresa una descripción para la imagen');
      return;
    }

    try {
      setGeneratingImage(true);
      const response = await fetch('/api/mensajes/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          aspectRatio: '1:1',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Parsear el key para actualizar el mensaje correcto
        const parts = currentImageKey.split('-');
        const canal = parts[0];
        const variante = parts.length > 1 ? parts[1] : undefined;
        
        actualizarMensaje(canal, 'mediaUrl', data.imageUrl, variante);
        setShowAIImageDialog(false);
        setAiPrompt('');
        toast.success('Imagen generada exitosamente');
      } else {
        toast.error(data.error || 'Error al generar la imagen');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al generar la imagen');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleRemoveImage = (canal: string, variante?: string) => {
    actualizarMensaje(canal, 'mediaUrl', '', variante);
    toast.success('Imagen eliminada');
  };

  const handleOpenCanvaDialog = (canal: string, variante?: string) => {
    setCurrentImageKey(variante ? `${canal}-${variante}` : canal);
    setShowCanvaDialog(true);
  };

  const handleCanvaDesignPublished = (imageUrl: string) => {
    // Parsear el key para actualizar el mensaje correcto
    const parts = currentImageKey.split('-');
    const canal = parts[0];
    const variante = parts.length > 1 ? parts[1] : undefined;
    
    actualizarMensaje(canal, 'mediaUrl', imageUrl, variante);
    setShowCanvaDialog(false);
    toast.success('Diseño de Canva guardado exitosamente');
  };

  const guardarCampana = async () => {
    // Validaciones
    if (!nombre.trim()) {
      toast.error('El nombre de la campaña es obligatorio');
      return;
    }

    if (canalesSeleccionados.length === 0) {
      toast.error('Selecciona al menos un canal');
      return;
    }

    // Validar que todos los mensajes tengan contenido
    const mensajesIncompletos = mensajes.filter((m) => !m.contenido.trim());
    if (mensajesIncompletos.length > 0) {
      toast.error('Todos los mensajes deben tener contenido');
      return;
    }

    // Validaciones específicas para A/B test
    if (tipo === 'a_b_test') {
      const totalPorcentaje = variantes.reduce((sum, v) => sum + v.porcentaje, 0);
      if (totalPorcentaje !== 100) {
        toast.error(`Los porcentajes de las variantes deben sumar 100% (actual: ${totalPorcentaje}%)`);
        return;
      }
    }

    setLoading(true);

    try {
      const res = await fetch('/api/campanas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          descripcion,
          tipo,
          canales: canalesSeleccionados,
          targetType,
          targetConfig,
          mensajes,
        }),
      });

      if (res.ok) {
        toast.success('Campaña creada correctamente');
        router.push('/dashboard/campanas');
      } else {
        toast.error('Error al crear campaña');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al crear campaña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            <h1 className="text-3xl font-bold">Nueva Campaña</h1>
            <p className="text-muted-foreground mt-1">
              Crea una campaña multicanal para llegar a tu audiencia
            </p>
          </div>
        </div>
        <Button onClick={guardarCampana} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          Guardar Campaña
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="basico">Información Básica</TabsTrigger>
          <TabsTrigger value="audiencia">Audiencia</TabsTrigger>
          {tipo === 'a_b_test' && (
            <TabsTrigger value="variantes">
              <TestTube2 className="h-4 w-4 mr-2" />
              Variantes A/B
            </TabsTrigger>
          )}
          <TabsTrigger value="canales">Canales y Mensajes</TabsTrigger>
        </TabsList>

        {/* Tab: Información Básica */}
        <TabsContent value="basico">
          <Card>
            <CardHeader>
              <CardTitle>Información Básica</CardTitle>
              <CardDescription>
                Configura los detalles generales de tu campaña
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre de la Campaña *</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Campaña de Bienvenida 2024"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  placeholder="Describe el objetivo de esta campaña..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Campaña</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (única vez)</SelectItem>
                    <SelectItem value="automatica">Automática (recurrente)</SelectItem>
                    <SelectItem value="a_b_test">Prueba A/B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Audiencia */}
        <TabsContent value="audiencia">
          <Card>
            <CardHeader>
              <CardTitle>Selección de Audiencia</CardTitle>
              <CardDescription>
                Define quiénes recibirán esta campaña
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Segmento de Audiencia</Label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Todos los contactos
                      </div>
                    </SelectItem>
                    <SelectItem value="score_range">Por rango de puntuación</SelectItem>
                    <SelectItem value="estado">Por estado del lead</SelectItem>
                    <SelectItem value="curso">Estudiantes de cursos específicos</SelectItem>
                    <SelectItem value="custom">Selección personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetType === 'score_range' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Puntuación Mínima</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={targetConfig.minScore || ''}
                      onChange={(e) =>
                        setTargetConfig({ ...targetConfig, minScore: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Puntuación Máxima</Label>
                    <Input
                      type="number"
                      placeholder="1000"
                      value={targetConfig.maxScore || ''}
                      onChange={(e) =>
                        setTargetConfig({ ...targetConfig, maxScore: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              )}

              {targetType === 'estado' && (
                <div className="space-y-2">
                  <Label>Estados de Leads</Label>
                  <div className="space-y-2">
                    {['nuevo', 'contactado', 'convertido', 'perdido'].map((estado) => (
                      <div key={estado} className="flex items-center space-x-2">
                        <Checkbox
                          id={`estado-${estado}`}
                          checked={targetConfig.estados?.includes(estado)}
                          onCheckedChange={(checked) => {
                            const estados = targetConfig.estados || [];
                            setTargetConfig({
                              ...targetConfig,
                              estados: checked
                                ? [...estados, estado]
                                : estados.filter((e: string) => e !== estado),
                            });
                          }}
                        />
                        <Label htmlFor={`estado-${estado}`} className="capitalize">
                          {estado}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <Target className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Estimación de Audiencia</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Se calculará automáticamente al guardar la campaña
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Configuración de Variantes A/B */}
        {tipo === 'a_b_test' && (
          <TabsContent value="variantes">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TestTube2 className="h-5 w-5" />
                      Configuración de Variantes A/B
                    </CardTitle>
                    <CardDescription>
                      Define las variantes y distribución de tráfico para tu prueba A/B
                    </CardDescription>
                  </div>
                  <Button onClick={agregarVariante} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Variante
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Información sobre A/B Testing */}
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <TestTube2 className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          ¿Cómo funcionan las Pruebas A/B?
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Las variantes se distribuirán automáticamente entre tu audiencia según los porcentajes configurados. 
                          Podrás ver qué variante tiene mejor rendimiento en métricas como apertura, clicks y conversiones.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lista de variantes */}
                  {variantes.map((variante, index) => {
                    const colores = ['bg-blue-100 text-blue-900', 'bg-green-100 text-green-900', 'bg-orange-100 text-orange-900', 'bg-purple-100 text-purple-900', 'bg-pink-100 text-pink-900'];
                    const color = colores[index % colores.length];
                    
                    return (
                      <div key={variante.id} className="border-2 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge className={color}>{variante.id}</Badge>
                            <Input
                              value={variante.nombre}
                              onChange={(e) => {
                                setVariantes((prev) =>
                                  prev.map((v) =>
                                    v.id === variante.id ? { ...v, nombre: e.target.value } : v
                                  )
                                );
                              }}
                              className="max-w-xs"
                              placeholder={`Nombre de variante ${variante.id}`}
                            />
                          </div>
                          {variantes.length > 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => eliminarVariante(variante.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Porcentaje de Tráfico</Label>
                          <div className="flex items-center gap-4">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={variante.porcentaje}
                              onChange={(e) =>
                                actualizarPorcentajeVariante(variante.id, Number(e.target.value))
                              }
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={variante.porcentaje}
                              onChange={(e) =>
                                actualizarPorcentajeVariante(variante.id, Number(e.target.value))
                              }
                              className="w-20"
                            />
                            <span className="text-sm font-medium">%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${variante.porcentaje}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Resumen de distribución */}
                  <div className="border-2 border-dashed rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total de Tráfico Asignado:</span>
                      <Badge 
                        variant={
                          variantes.reduce((sum, v) => sum + v.porcentaje, 0) === 100
                            ? 'default'
                            : 'destructive'
                        }
                        className="text-lg"
                      >
                        {variantes.reduce((sum, v) => sum + v.porcentaje, 0)}%
                      </Badge>
                    </div>
                    {variantes.reduce((sum, v) => sum + v.porcentaje, 0) !== 100 && (
                      <p className="text-xs text-red-500 mt-2">
                        ⚠️ El total debe ser 100% para proceder
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Tab: Canales y Mensajes */}
        <TabsContent value="canales">
          <div className="space-y-6">
            {/* Selección de canales */}
            <Card>
              <CardHeader>
                <CardTitle>Canales de Comunicación</CardTitle>
                <CardDescription>
                  Selecciona los canales por los que enviarás la campaña
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {canalesDisponibles.map((canal) => {
                    const Icon = canal.icon;
                    const isSelected = canalesSeleccionados.includes(canal.id);
                    return (
                      <button
                        key={canal.id}
                        onClick={() => toggleCanal(canal.id)}
                        className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-gray-500'}`} />
                        <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-gray-700'}`}>
                          {canal.nombre}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Mensajes por canal */}
            {canalesSeleccionados.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Contenido de los Mensajes</CardTitle>
                  <CardDescription>
                    {tipo === 'a_b_test'
                      ? 'Personaliza el mensaje de cada variante para cada canal'
                      : 'Personaliza el mensaje para cada canal. Puedes usar variables como {nombre}, {email}'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {tipo === 'a_b_test' ? (
                    // Para A/B tests: agrupar por canal y mostrar variantes
                    canalesSeleccionados.map((canalId) => {
                      const canal = canalesDisponibles.find((c) => c.id === canalId);
                      const Icon = canal?.icon || MessageSquare;
                      const mensajesCanal = mensajes.filter((m) => m.canal === canalId);

                      return (
                        <div key={canalId} className="border-2 rounded-lg p-4 space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <Icon className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-lg">{canal?.nombre}</h3>
                          </div>

                          {/* Variantes del canal */}
                          <div className="space-y-4">
                            {variantes.map((variante, index) => {
                              const mensaje = mensajesCanal.find((m) => m.variante === variante.id);
                              if (!mensaje) return null;

                              const colores = [
                                'border-blue-200 bg-blue-50',
                                'border-green-200 bg-green-50',
                                'border-orange-200 bg-orange-50',
                                'border-purple-200 bg-purple-50',
                                'border-pink-200 bg-pink-50',
                              ];
                              const color = colores[index % colores.length];

                              return (
                                <div key={variante.id} className={`border-2 ${color} rounded-lg p-4 space-y-3`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge>{variante.id}</Badge>
                                      <span className="font-medium">{variante.nombre}</span>
                                      <Badge variant="outline">{variante.porcentaje}% tráfico</Badge>
                                    </div>
                                  </div>

                                  {canalId === 'email' && (
                                    <div className="space-y-2">
                                      <Label>Asunto del Email</Label>
                                      <Input
                                        placeholder={`Ej: Asunto para ${variante.nombre}`}
                                        value={mensaje.asunto}
                                        onChange={(e) =>
                                          actualizarMensaje(canalId, 'asunto', e.target.value, variante.id)
                                        }
                                      />
                                      <div className="space-y-2">
                                        <Label>Contenido del Email</Label>
                                        <EmailEditor
                                          value={mensaje.contenido}
                                          onChange={(value) =>
                                            actualizarMensaje(canalId, 'contenido', value, variante.id)
                                          }
                                          placeholder={`Escribe el contenido para ${variante.nombre}...`}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {canalId !== 'email' && (
                                  <div className="space-y-2">
                                    <Label>Mensaje</Label>
                                    <Textarea
                                      placeholder={`Escribe el mensaje para ${variante.nombre}... Usa {nombre} para personalizar`}
                                      value={mensaje.contenido}
                                      onChange={(e) =>
                                        actualizarMensaje(canalId, 'contenido', e.target.value, variante.id)
                                      }
                                      rows={6}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      {mensaje.contenido.length} caracteres
                                    </p>
                                  </div>
                                  )}

                                  {/* Botones de imagen para A/B */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <input
                                      ref={fileInputRef}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => handleUploadImage(e, canalId, variante.id)}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => fileInputRef.current?.click()}
                                      disabled={uploadingImage}
                                    >
                                      {uploadingImage ? (
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                      )}
                                      Subir Imagen
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenAIImageDialog(canalId, variante.id)}
                                      disabled={generatingImage}
                                    >
                                      <Sparkles className="h-4 w-4 mr-2" />
                                      Generar con IA
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenCanvaDialog(canalId, variante.id)}
                                    >
                                      <Palette className="h-4 w-4 mr-2" />
                                      Diseñar con Canva
                                    </Button>
                                  </div>

                                  {/* Preview de imagen para A/B */}
                                  {mensaje.mediaUrl && (
                                    <div className="relative border rounded-lg p-2 bg-muted">
                                      <div className="flex items-start gap-3">
                                        <div className="relative w-20 h-20 rounded overflow-hidden bg-gray-200">
                                          <Image
                                            src={mensaje.mediaUrl}
                                            alt="Imagen adjunta"
                                            fill
                                            className="object-cover"
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">Imagen adjunta</p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {mensaje.mediaUrl}
                                          </p>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleRemoveImage(canalId, variante.id)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Para campañas normales: un mensaje por canal
                    mensajes.map((mensaje) => {
                      const canal = canalesDisponibles.find((c) => c.id === mensaje.canal);
                      const Icon = canal?.icon || MessageSquare;

                      return (
                        <div key={mensaje.canal} className="border rounded-lg p-4 space-y-4">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold">{canal?.nombre}</h3>
                          </div>

                          {mensaje.canal === 'email' && (
                            <div className="space-y-2">
                              <div className="space-y-2">
                                <Label>Plantilla (opcional)</Label>
                                <Select value={plantillaSeleccionada} onValueChange={handlePlantillaChange}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una plantilla" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ninguna">Sin plantilla</SelectItem>
                                    {plantillas.map((p: any) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.nombre} ({p.categoria})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <Label>Asunto del Email</Label>
                              <Input
                                placeholder="Ej: ¡Bienvenido a Volkern!"
                                value={mensaje.asunto}
                                onChange={(e) =>
                                  actualizarMensaje(mensaje.canal, 'asunto', e.target.value)
                                }
                              />
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label>Contenido del Email</Label>
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="text-purple-600 font-bold h-auto p-0 flex items-center gap-1 hover:text-purple-700"
                                    onClick={() => router.push('/template-editor/email/new')}
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Editor Visual
                                  </Button>
                                </div>
                                <EmailEditor
                                  value={mensaje.contenido}
                                  onChange={(value) =>
                                    actualizarMensaje(mensaje.canal, 'contenido', value)
                                  }
                                  placeholder="Escribe el contenido de tu email aquí..."
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label>Mensaje</Label>
                            <Textarea
                              placeholder="Escribe tu mensaje aquí... Usa {nombre} para personalizar"
                              value={mensaje.contenido}
                              onChange={(e) =>
                                actualizarMensaje(mensaje.canal, 'contenido', e.target.value)
                              }
                              rows={6}
                            />
                            <p className="text-xs text-muted-foreground">
                              {mensaje.contenido.length} caracteres
                            </p>
                          </div>

                          {/* Botones de imagen para campañas normales */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleUploadImage(e, mensaje.canal)}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingImage}
                            >
                              {uploadingImage ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <ImageIcon className="h-4 w-4 mr-2" />
                              )}
                              Subir Imagen
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAIImageDialog(mensaje.canal)}
                              disabled={generatingImage}
                            >
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generar con IA
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenCanvaDialog(mensaje.canal)}
                            >
                              <Palette className="h-4 w-4 mr-2" />
                              Diseñar con Canva
                            </Button>
                          </div>

                          {/* Preview de imagen para campañas normales */}
                          {mensaje.mediaUrl && (
                            <div className="relative border rounded-lg p-2 bg-muted">
                              <div className="flex items-start gap-3">
                                <div className="relative w-20 h-20 rounded overflow-hidden bg-gray-200">
                                  <Image
                                    src={mensaje.mediaUrl}
                                    alt="Imagen adjunta"
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">Imagen adjunta</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {mensaje.mediaUrl}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveImage(mensaje.canal)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de Diseñador de Canva */}
      <Dialog open={showCanvaDialog} onOpenChange={setShowCanvaDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Diseñar con Canva
            </DialogTitle>
            <DialogDescription>
              Crea diseños profesionales directamente desde tu CRM usando el editor de Canva
            </DialogDescription>
          </DialogHeader>
          <CanvaDesigner
            templateId={canvaTemplateId}
            onDesignPublished={handleCanvaDesignPublished}
            onClose={() => setShowCanvaDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog de Generar Imagen con IA */}
      <Dialog open={showAIImageDialog} onOpenChange={setShowAIImageDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generar Imagen con IA
            </DialogTitle>
            <DialogDescription>
              Describe la imagen que quieres generar y la IA la creará por ti
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Descripción de la imagen
              </Label>
              <Textarea
                placeholder="Ej: Un atardecer en la playa con palmeras y un cielo naranja..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="min-h-[100px]"
                disabled={generatingImage}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAIImageDialog(false);
                setAiPrompt('');
              }}
              disabled={generatingImage}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateAIImage}
              disabled={!aiPrompt.trim() || generatingImage}
            >
              {generatingImage ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar Imagen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
