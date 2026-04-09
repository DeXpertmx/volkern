
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Send, 
  Eye, 
  Save,
  Calendar,
  Users,
  Plus,
  Sparkles
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmailEditor } from '@/components/email-editor';

interface Plantilla {
  id: string;
  nombre: string;
  categoria: string;
  asuntoPorDefecto: string;
  contenidoHTML: string;
}

interface Audiencia {
  id: string;
  nombre: string;
  totalLeads: number;
}

export default function NuevaCampanaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [audiencias, setAudiencias] = useState<Audiencia[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [previewAsunto, setPreviewAsunto] = useState('');

  const [formData, setFormData] = useState({
    nombre: '',
    asunto: '',
    remitente: '',
    remitenteEmail: '',
    responderA: '',
    contenidoHTML: '',
    contenidoTexto: '',
    plantillaId: '',
    audienciaId: '',
    tipoProgramacion: 'inmediato',
    fechaEnvio: ''
  });

  useEffect(() => {
    cargarPlantillas();
    cargarAudiencias();
  }, []);

  const cargarPlantillas = async () => {
    try {
      const res = await fetch('/api/email-campanas/templates');
      if (!res.ok) throw new Error('Error al cargar plantillas');
      const data = await res.json();
      setPlantillas(data);
    } catch (error: any) {
      console.error('Error cargando plantillas:', error);
      toast.error('Error al cargar plantillas');
    }
  };

  const cargarAudiencias = async () => {
    try {
      const res = await fetch('/api/email-campanas/audiences');
      if (!res.ok) throw new Error('Error al cargar audiencias');
      const data = await res.json();
      setAudiencias(data);
    } catch (error: any) {
      console.error('Error cargando audiencias:', error);
      toast.error('Error al cargar audiencias');
    }
  };

  const handlePlantillaChange = async (plantillaId: string) => {
    setFormData(prev => ({ ...prev, plantillaId }));
    
    if (plantillaId) {
      try {
        const res = await fetch(`/api/email-campanas/templates/${plantillaId}`);
        if (!res.ok) throw new Error('Error al cargar plantilla');
        const plantilla = await res.json();
        
        setFormData(prev => ({
          ...prev,
          asunto: plantilla.asuntoPorDefecto || prev.asunto,
          contenidoHTML: plantilla.contenidoHTML,
          contenidoTexto: plantilla.contenidoTexto || ''
        }));
        
        toast.success('Plantilla cargada');
      } catch (error: any) {
        toast.error('Error al cargar plantilla');
      }
    }
  };

  const insertarVariable = (variable: string) => {
    const varTag = `{${variable}}`;
    setFormData(prev => ({
      ...prev,
      contenidoHTML: prev.contenidoHTML + varTag
    }));
    toast.success(`Variable {${variable}} insertada`);
  };

  const generarVistaPrevia = async () => {
    try {
      const res = await fetch('/api/email-campanas/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asunto: formData.asunto,
          contenidoHTML: formData.contenidoHTML
        })
      });

      if (!res.ok) throw new Error('Error al generar vista previa');
      const data = await res.json();
      
      setPreviewAsunto(data.asunto);
      setPreviewHTML(data.contenidoHTML);
      setShowPreview(true);
    } catch (error: any) {
      toast.error('Error al generar vista previa');
    }
  };

  const guardarBorrador = async () => {
    if (!formData.nombre || !formData.asunto || !formData.contenidoHTML) {
      toast.error('Completa los campos requeridos: nombre, asunto y contenido');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/email-campanas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      const campana = await res.json();
      toast.success('Campaña guardada como borrador');
      router.push('/dashboard/email-campanas');
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar campaña');
    } finally {
      setLoading(false);
    }
  };

  const enviarCampana = async () => {
    if (!formData.nombre || !formData.asunto || !formData.contenidoHTML) {
      toast.error('Completa los campos requeridos');
      return;
    }

    if (!formData.audienciaId) {
      toast.error('Selecciona una audiencia');
      return;
    }

    setLoading(true);
    try {
      // Primero crear la campaña
      const resCreate = await fetch('/api/email-campanas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!resCreate.ok) throw new Error('Error al crear campaña');
      const campana = await resCreate.json();

      // Luego enviarla
      const resSend = await fetch(`/api/email-campanas/${campana.id}/send`, {
        method: 'POST'
      });

      if (!resSend.ok) {
        const error = await resSend.json();
        throw new Error(error.error);
      }

      const result = await resSend.json();
      toast.success(result.message);
      router.push('/dashboard/email-campanas');
    } catch (error: any) {
      toast.error(error.message || 'Error al enviar campaña');
    } finally {
      setLoading(false);
    }
  };

  const programarCampana = async () => {
    if (!formData.fechaEnvio) {
      toast.error('Selecciona una fecha y hora');
      return;
    }

    setLoading(true);
    try {
      const resCreate = await fetch('/api/email-campanas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tipoProgramacion: 'programado'
        })
      });

      if (!resCreate.ok) throw new Error('Error al crear campaña');
      const campana = await resCreate.json();

      const resSend = await fetch(`/api/email-campanas/${campana.id}/send`, {
        method: 'POST'
      });

      if (!resSend.ok) throw new Error('Error al programar campaña');
      
      const result = await resSend.json();
      toast.success(result.message);
      router.push('/dashboard/email-campanas');
    } catch (error: any) {
      toast.error(error.message || 'Error al programar campaña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Campaña de Email</h1>
          <p className="text-muted-foreground mt-1">
            Crea y configura tu campaña de email marketing
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card>
            <CardHeader>
              <CardTitle>Información Básica</CardTitle>
              <CardDescription>
                Define el nombre y remitente de tu campaña
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre de la campaña *</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Newsletter Febrero 2025"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="remitente">Nombre del remitente</Label>
                  <Input
                    id="remitente"
                    placeholder="Ej: Volkern CRM"
                    value={formData.remitente}
                    onChange={(e) => setFormData(prev => ({ ...prev, remitente: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="remitenteEmail">Email del remitente</Label>
                  <Input
                    id="remitenteEmail"
                    type="email"
                    placeholder="noreply@tudominio.com"
                    value={formData.remitenteEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, remitenteEmail: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responderA">Responder a (opcional)</Label>
                <Input
                  id="responderA"
                  type="email"
                  placeholder="soporte@tudominio.com"
                  value={formData.responderA}
                  onChange={(e) => setFormData(prev => ({ ...prev, responderA: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contenido del email */}
          <Card>
            <CardHeader>
              <CardTitle>Contenido del Email</CardTitle>
              <CardDescription>
                Escribe el asunto y contenido de tu campaña
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plantilla">Plantilla (opcional)</Label>
                <Select value={formData.plantillaId} onValueChange={handlePlantillaChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una plantilla" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">Sin plantilla</SelectItem>
                    {plantillas.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre} ({p.categoria})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="asunto">Asunto del email *</Label>
                <Input
                  id="asunto"
                  placeholder="Ej: ¡Descubre nuestras novedades!"
                  value={formData.asunto}
                  onChange={(e) => setFormData(prev => ({ ...prev, asunto: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Usa variables: {'{nombre}'}, {'{email}'}, {'{empresa}'}, {'{cargo}'}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="contenidoHTML">Contenido HTML *</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="text-purple-600 font-bold h-auto p-0 flex items-center gap-1 hover:text-purple-700"
                      onClick={() => router.push('/template-editor/email/new')}
                    >
                      <Sparkles className="w-3 h-3" />
                      Diseñar con Editor Avanzado
                    </Button>
                    <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertarVariable('nombre')}
                    >
                      + {'{nombre}'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertarVariable('email')}
                    >
                      + {'{email}'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertarVariable('empresa')}
                    >
                      + {'{empresa}'}
                    </Button>
                  </div>
                </div>
                <EmailEditor
                  value={formData.contenidoHTML}
                  onChange={(value) => setFormData(prev => ({ ...prev, contenidoHTML: value }))}
                  placeholder="Escribe el contenido de tu email aquí..."
                />
              </div>

              <Button
                variant="outline"
                onClick={generarVistaPrevia}
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                Vista Previa
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar de configuración */}
        <div className="space-y-6">
          {/* Audiencia */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Audiencia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="audiencia">Seleccionar audiencia</Label>
                <Select 
                  value={formData.audienciaId} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, audienciaId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una audiencia" />
                  </SelectTrigger>
                  <SelectContent>
                    {audiencias.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nombre} ({a.totalLeads} leads)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push('/dashboard/email-campanas/audiencias')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Gestionar Audiencias
              </Button>
            </CardContent>
          </Card>

          {/* Programación */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Programación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs 
                value={formData.tipoProgramacion} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, tipoProgramacion: value }))}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="inmediato">Inmediato</TabsTrigger>
                  <TabsTrigger value="programado">Programar</TabsTrigger>
                </TabsList>

                <TabsContent value="inmediato" className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    La campaña se enviará inmediatamente después de confirmar
                  </p>
                </TabsContent>

                <TabsContent value="programado" className="space-y-2">
                  <Label htmlFor="fechaEnvio">Fecha y hora de envío</Label>
                  <Input
                    id="fechaEnvio"
                    type="datetime-local"
                    value={formData.fechaEnvio}
                    onChange={(e) => setFormData(prev => ({ ...prev, fechaEnvio: e.target.value }))}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Acciones */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button
                className="w-full"
                onClick={formData.tipoProgramacion === 'inmediato' ? enviarCampana : programarCampana}
                disabled={loading}
              >
                {loading ? (
                  'Procesando...'
                ) : formData.tipoProgramacion === 'inmediato' ? (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Ahora
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Programar Envío
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={guardarBorrador}
                disabled={loading}
              >
                <Save className="h-4 w-4 mr-2" />
                Guardar Borrador
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de vista previa */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa del Email</DialogTitle>
            <DialogDescription>
              Así se verá tu email con datos de ejemplo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border-b pb-4">
              <div className="text-sm text-muted-foreground mb-1">Asunto:</div>
              <div className="font-semibold">{previewAsunto}</div>
            </div>
            
            <div 
              className="border rounded-lg p-6 bg-white"
              dangerouslySetInnerHTML={{ __html: previewHTML }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
