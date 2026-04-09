'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

export default function NuevoCursoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Form state
  const [formData, setFormData] = useState({
    // General Info
    titulo: '',
    subtitulo: '',
    descripcion: '',
    descripcionLarga: '',
    imagenDestacada: '',
    categoria: '',
    nivel: 'principiante',
    duracionEstimadaHoras: 0,
    
    // Instructor Info
    instructorNombre: '',
    instructorBio: '',
    instructorImagen: '',
    
    // Monetization
    tipoMonetizacion: 'one_time',
    precio: 0,
    precioSuscripcion: 0,
    moneda: 'MXN',
    permiteCupones: true,
    
    // Access
    tipoAcceso: 'immediate',
    fechaInicio: '',
    diasExpiracion: 0,
    
    // Settings
    publicado: false,
    permiteComentarios: true,
    permiteCalificaciones: true,
    certificadoHabilitado: true,
    puntuajeMinimoCertificado: 80,
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.titulo) {
      toast({
        title: 'Error',
        description: 'El título del curso es requerido',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/cursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Error al crear curso');

      const curso = await response.json();
      toast({
        title: 'Curso creado',
        description: 'El curso ha sido creado exitosamente',
      });
      router.push(`/dashboard/cursos/${curso.id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el curso',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/cursos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Crear Nuevo Curso</h1>
            <p className="text-muted-foreground">
              Configura tu curso profesional paso a paso
            </p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Guardando...' : 'Guardar Curso'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="monetization">Monetización</TabsTrigger>
          <TabsTrigger value="access">Acceso</TabsTrigger>
          <TabsTrigger value="settings">Configuración</TabsTrigger>
        </TabsList>

        {/* General Info Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
              <CardDescription>
                Información básica sobre tu curso que verán los estudiantes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título del Curso *</Label>
                <Input
                  id="titulo"
                  value={formData.titulo}
                  onChange={(e) => handleInputChange('titulo', e.target.value)}
                  placeholder="ej: Marketing Digital Avanzado"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitulo">Subtítulo</Label>
                <Input
                  id="subtitulo"
                  value={formData.subtitulo}
                  onChange={(e) => handleInputChange('subtitulo', e.target.value)}
                  placeholder="ej: Domina las estrategias más efectivas"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción Corta</Label>
                <Textarea
                  id="descripcion"
                  value={formData.descripcion}
                  onChange={(e) => handleInputChange('descripcion', e.target.value)}
                  placeholder="Breve descripción del curso"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcionLarga">Descripción Larga (Landing Page)</Label>
                <Textarea
                  id="descripcionLarga"
                  value={formData.descripcionLarga}
                  onChange={(e) => handleInputChange('descripcionLarga', e.target.value)}
                  placeholder="Descripción completa para la página de ventas"
                  rows={8}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoría</Label>
                  <Select
                    value={formData.categoria}
                    onValueChange={(value) => handleInputChange('categoria', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="desarrollo">Desarrollo Web</SelectItem>
                      <SelectItem value="diseno">Diseño</SelectItem>
                      <SelectItem value="negocios">Negocios</SelectItem>
                      <SelectItem value="fotografia">Fotografía</SelectItem>
                      <SelectItem value="coaching">Coaching</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nivel">Nivel</Label>
                  <Select
                    value={formData.nivel}
                    onValueChange={(value) => handleInputChange('nivel', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principiante">Principiante</SelectItem>
                      <SelectItem value="intermedio">Intermedio</SelectItem>
                      <SelectItem value="avanzado">Avanzado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duracion">Duración Estimada (horas)</Label>
                <Input
                  id="duracion"
                  type="number"
                  value={formData.duracionEstimadaHoras}
                  onChange={(e) => handleInputChange('duracionEstimadaHoras', parseInt(e.target.value) || 0)}
                  min="0"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información del Instructor</CardTitle>
              <CardDescription>
                Esta información aparecerá en la página del curso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instructorNombre">Nombre del Instructor</Label>
                <Input
                  id="instructorNombre"
                  value={formData.instructorNombre}
                  onChange={(e) => handleInputChange('instructorNombre', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructorBio">Biografía del Instructor</Label>
                <Textarea
                  id="instructorBio"
                  value={formData.instructorBio}
                  onChange={(e) => handleInputChange('instructorBio', e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monetization Tab */}
        <TabsContent value="monetization" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Monetización</CardTitle>
              <CardDescription>
                Define cómo los estudiantes accederán a tu curso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tipoMonetizacion">Tipo de Monetización</Label>
                <Select
                  value={formData.tipoMonetizacion}
                  onValueChange={(value) => handleInputChange('tipoMonetizacion', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">Pago Único</SelectItem>
                    <SelectItem value="subscription">Suscripción Mensual</SelectItem>
                    <SelectItem value="free">Gratis</SelectItem>
                    <SelectItem value="membership">Requiere Membresía</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.tipoMonetizacion === 'one_time' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="precio">Precio</Label>
                    <Input
                      id="precio"
                      type="number"
                      value={formData.precio}
                      onChange={(e) => handleInputChange('precio', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="moneda">Moneda</Label>
                    <Select
                      value={formData.moneda}
                      onValueChange={(value) => handleInputChange('moneda', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MXN">MXN (Peso Mexicano)</SelectItem>
                        <SelectItem value="USD">USD (Dólar)</SelectItem>
                        <SelectItem value="EUR">EUR (Euro)</SelectItem>
                        <SelectItem value="COP">COP (Peso Colombiano)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {formData.tipoMonetizacion === 'subscription' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="precioSuscripcion">Precio Mensual</Label>
                    <Input
                      id="precioSuscripcion"
                      type="number"
                      value={formData.precioSuscripcion}
                      onChange={(e) => handleInputChange('precioSuscripcion', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="moneda">Moneda</Label>
                    <Select
                      value={formData.moneda}
                      onValueChange={(value) => handleInputChange('moneda', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MXN">MXN</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="COP">COP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="permiteCupones">Permitir Cupones</Label>
                  <p className="text-sm text-muted-foreground">
                    Habilita códigos de descuento para este curso
                  </p>
                </div>
                <Switch
                  id="permiteCupones"
                  checked={formData.permiteCupones}
                  onCheckedChange={(checked) => handleInputChange('permiteCupones', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Control Tab */}
        <TabsContent value="access" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Control de Acceso</CardTitle>
              <CardDescription>
                Define cuándo y cómo los estudiantes pueden acceder al curso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tipoAcceso">Tipo de Acceso</Label>
                <Select
                  value={formData.tipoAcceso}
                  onValueChange={(value) => handleInputChange('tipoAcceso', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Acceso Inmediato</SelectItem>
                    <SelectItem value="scheduled">Acceso Programado</SelectItem>
                    <SelectItem value="expires_after_days">Expira Después de X Días</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.tipoAcceso === 'scheduled' && (
                <div className="space-y-2">
                  <Label htmlFor="fechaInicio">Fecha de Inicio</Label>
                  <Input
                    id="fechaInicio"
                    type="datetime-local"
                    value={formData.fechaInicio}
                    onChange={(e) => handleInputChange('fechaInicio', e.target.value)}
                  />
                </div>
              )}

              {formData.tipoAcceso === 'expires_after_days' && (
                <div className="space-y-2">
                  <Label htmlFor="diasExpiracion">Días hasta Expiración</Label>
                  <Input
                    id="diasExpiracion"
                    type="number"
                    value={formData.diasExpiracion}
                    onChange={(e) => handleInputChange('diasExpiracion', parseInt(e.target.value) || 0)}
                    min="1"
                  />
                  <p className="text-sm text-muted-foreground">
                    El acceso expirará automáticamente después de este número de días desde la inscripción
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración del Curso</CardTitle>
              <CardDescription>
                Opciones avanzadas y configuración general
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="publicado">Publicar Curso</Label>
                  <p className="text-sm text-muted-foreground">
                    Hacer visible el curso para los estudiantes
                  </p>
                </div>
                <Switch
                  id="publicado"
                  checked={formData.publicado}
                  onCheckedChange={(checked) => handleInputChange('publicado', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="permiteComentarios">Permitir Comentarios</Label>
                  <p className="text-sm text-muted-foreground">
                    Los estudiantes pueden comentar en las lecciones
                  </p>
                </div>
                <Switch
                  id="permiteComentarios"
                  checked={formData.permiteComentarios}
                  onCheckedChange={(checked) => handleInputChange('permiteComentarios', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="permiteCalificaciones">Permitir Calificaciones</Label>
                  <p className="text-sm text-muted-foreground">
                    Los estudiantes pueden calificar el curso
                  </p>
                </div>
                <Switch
                  id="permiteCalificaciones"
                  checked={formData.permiteCalificaciones}
                  onCheckedChange={(checked) => handleInputChange('permiteCalificaciones', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="certificadoHabilitado">Habilitar Certificados</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar certificados al completar el curso
                  </p>
                </div>
                <Switch
                  id="certificadoHabilitado"
                  checked={formData.certificadoHabilitado}
                  onCheckedChange={(checked) => handleInputChange('certificadoHabilitado', checked)}
                />
              </div>

              {formData.certificadoHabilitado && (
                <div className="space-y-2">
                  <Label htmlFor="puntuajeMinimo">Puntuación Mínima para Certificado (%)</Label>
                  <Input
                    id="puntuajeMinimo"
                    type="number"
                    value={formData.puntuajeMinimoCertificado}
                    onChange={(e) => handleInputChange('puntuajeMinimoCertificado', parseInt(e.target.value) || 80)}
                    min="0"
                    max="100"
                  />
                  <p className="text-sm text-muted-foreground">
                    Los estudiantes deben alcanzar esta puntuación para recibir el certificado
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-4">
        <Link href="/dashboard/cursos">
          <Button variant="outline">Cancelar</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Guardando...' : 'Guardar Curso'}
        </Button>
      </div>
    </div>
  );
}
