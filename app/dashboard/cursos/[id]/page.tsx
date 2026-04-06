'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Plus, Edit, Trash2, GripVertical, Upload, File, Video,
  Save, DollarSign, Calendar, Users, BarChart3, Star, Award,
  Clock, Eye, Download, Mail, CheckCircle2, XCircle, Tag, BookOpen,
  Trophy, MessageSquareText, Link as LinkIcon, Youtube, Info
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { parseVideoUrl } from '@/lib/video-utils';

interface Leccion {
  id: string;
  moduloId: string;
  titulo: string;
  descripcion: string | null;
  contenido: string | null;
  videoUrl: string | null;
  videoTipo: string | null;
  duracionMinutos: number | null;
  materialesUrl: any;
  orden: number;
  tipoContenido: string;
  esGratuita: boolean;
}

interface Modulo {
  id: string;
  titulo: string;
  descripcion: string | null;
  orden: number;
  lecciones: Leccion[];
}

interface Estudiante {
  id: string;
  nombre: string;
  email: string;
  fechaInscripcion: string;
  progreso: number;
  ultimoAcceso: string;
}

interface Cupon {
  id: string;
  codigo: string;
  tipo: string;
  valor: number;
  usos: number;
  usosMaximos: number | null;
  activo: boolean;
  fechaExpiracion: string | null;
}

interface Review {
  id: string;
  calificacion: number;
  comentario: string | null;
  estudianteNombre: string;
  fecha: string;
}

interface Curso {
  id: string;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  descripcionLarga: string | null;
  imagenDestacada: string | null;
  categoria: string | null;
  precio: number;
  moneda: string;
  duracionEstimadaHoras: number | null;
  nivel: string;
  publicado: boolean;
  tipoMonetizacion: string;
  precioSuscripcion: number | null;
  permiteCupones: boolean;
  tipoAcceso: string;
  fechaInicio: string | null;
  diasExpiracion: number | null;
  instructorNombre: string | null;
  instructorBio: string | null;
  instructorImagen: string | null;
  modulos: Modulo[];
  _count?: {
    inscripciones: number;
    reviews: number;
  };
  promedioCalificacion?: number;
  gamificacionActiva?: boolean;
  puntosPorLeccion?: number;
  comunidadActiva?: boolean;
}

export default function EditarCursoPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [curso, setCurso] = useState<Curso | null>(null);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Dialogs state
  const [showModuloDialog, setShowModuloDialog] = useState(false);
  const [showLeccionDialog, setShowLeccionDialog] = useState(false);
  const [showCuponDialog, setShowCuponDialog] = useState(false);
  const [moduloActual, setModuloActual] = useState<string | null>(null);
  const [leccionIdEdicion, setLeccionIdEdicion] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);

  const [nuevoModulo, setNuevoModulo] = useState({ titulo: '', descripcion: '' });
  const [nuevaLeccion, setNuevaLeccion] = useState({
    titulo: '',
    descripcion: '',
    contenido: '',
    duracionMinutos: '',
    tipoContenido: 'video',
    videoUrl: '',
    videoTipo: 'upload',
    materialesUrl: {} as Record<string, string>,
    esGratuita: false,
  });
  const [nuevoCupon, setNuevoCupon] = useState({
    codigo: '',
    tipo: 'porcentaje',
    valor: 0,
    usosMaximos: '',
    fechaExpiracion: '',
  });

  useEffect(() => {
    cargarDatos();
  }, [params.id]);

  const cargarDatos = async () => {
    try {
      const [cursoRes, estudiantesRes, cuponesRes, reviewsRes] = await Promise.all([
        fetch(`/api/cursos/${params.id}`),
        fetch(`/api/cursos/${params.id}/estudiantes`),
        fetch(`/api/cursos/${params.id}/cupones`),
        fetch(`/api/cursos/${params.id}/reviews`),
      ]);

      if (cursoRes.ok) setCurso(await cursoRes.json());
      if (estudiantesRes.ok) setEstudiantes(await estudiantesRes.json());
      if (cuponesRes.ok) setCupones(await cuponesRes.json());
      if (reviewsRes.ok) setReviews(await reviewsRes.json());
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const actualizarCurso = async () => {
    if (!curso) return;
    setSaving(true);

    try {
      const response = await fetch(`/api/cursos/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(curso),
      });

      if (response.ok) {
        toast({ title: 'Guardado', description: 'Los cambios han sido guardados exitosamente' });
      } else {
        throw new Error('Error al actualizar');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el curso', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const crearModulo = async () => {
    try {
      const response = await fetch(`/api/cursos/${params.id}/modulos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoModulo),
      });

      if (response.ok) {
        toast({ title: 'Módulo creado exitosamente' });
        setShowModuloDialog(false);
        setNuevoModulo({ titulo: '', descripcion: '' });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo crear el módulo', variant: 'destructive' });
    }
  };

  const crearLeccion = async () => {
    if (!moduloActual) return;

    try {
      const isEditing = !!leccionIdEdicion;
      const url = isEditing 
        ? `/api/lecciones/${leccionIdEdicion}`
        : `/api/modulos/${moduloActual}/lecciones`;
      
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...nuevaLeccion,
          duracionMinutos: nuevaLeccion.duracionMinutos ? parseInt(nuevaLeccion.duracionMinutos) : null,
        }),
      });

      if (response.ok) {
        toast({ title: isEditing ? 'Lección actualizada' : 'Lección creada exitosamente' });
        setShowLeccionDialog(false);
        setLeccionIdEdicion(null);
        setNuevaLeccion({ 
          titulo: '', 
          descripcion: '', 
          contenido: '', 
          duracionMinutos: '', 
          tipoContenido: 'video', 
          videoUrl: '',
          videoTipo: 'upload',
          materialesUrl: {},
          esGratuita: false 
        });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo crear la lección', variant: 'destructive' });
    }
  };

  const crearCupon = async () => {
    try {
      const response = await fetch(`/api/cursos/${params.id}/cupones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...nuevoCupon,
          usosMaximos: nuevoCupon.usosMaximos ? parseInt(nuevoCupon.usosMaximos) : null,
        }),
      });

      if (response.ok) {
        toast({ title: 'Cupón creado exitosamente' });
        setShowCuponDialog(false);
        setNuevoCupon({ codigo: '', tipo: 'porcentaje', valor: 0, usosMaximos: '', fechaExpiracion: '' });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo crear el cupón', variant: 'destructive' });
    }
  };

  const eliminarModulo = async (moduloId: string) => {
    if (!confirm('¿Eliminar este módulo y todas sus lecciones?')) return;

    try {
      const response = await fetch(`/api/modulos/${moduloId}`, { method: 'DELETE' });
      if (response.ok) {
        toast({ title: 'Módulo eliminado' });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const eliminarLeccion = async (leccionId: string) => {
    if (!confirm('¿Eliminar esta lección?')) return;

    try {
      const response = await fetch(`/api/lecciones/${leccionId}`, { method: 'DELETE' });
      if (response.ok) {
        toast({ title: 'Lección eliminada' });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const toggleCupon = async (cuponId: string, activo: boolean) => {
    try {
      const response = await fetch(`/api/cupones/${cuponId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !activo }),
      });

      if (response.ok) {
        toast({ title: activo ? 'Cupón desactivado' : 'Cupón activado' });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const subirImagen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'image');

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setCurso(curso ? { ...curso, imagenDestacada: data.cloud_storage_path } : null);
        toast({ title: 'Imagen subida exitosamente' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo subir la imagen', variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const subirVideo = async (event: React.ChangeEvent<HTMLInputElement>, leccionId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'video');

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        await fetch(`/api/lecciones/${leccionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: data.cloud_storage_path, videoTipo: 'upload' }),
        });
        toast({ title: 'Video subido exitosamente' });
        cargarDatos();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo subir el video', variant: 'destructive' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const subirMaterial = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingMaterial(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'document');

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const fileName = file.name;
        setNuevaLeccion({
          ...nuevaLeccion,
          materialesUrl: {
            ...nuevaLeccion.materialesUrl,
            [fileName]: data.cloud_storage_path,
          }
        });
        toast({ title: 'Material subido exitosamente' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo subir el material', variant: 'destructive' });
    } finally {
      setUploadingMaterial(false);
    }
  };

  const abrirEdicionLeccion = (leccion: Leccion) => {
    setModuloActual(leccion.moduloId); // Necesitamos el moduloId si el API lo requiere, aunque sea para PUT
    setLeccionIdEdicion(leccion.id);
    setNuevaLeccion({
      titulo: leccion.titulo,
      descripcion: leccion.descripcion || '',
      contenido: leccion.contenido || '',
      duracionMinutos: leccion.duracionMinutos?.toString() || '',
      tipoContenido: leccion.tipoContenido,
      videoUrl: leccion.videoUrl || '',
      videoTipo: leccion.videoTipo || 'upload',
      materialesUrl: leccion.materialesUrl || {},
      esGratuita: leccion.esGratuita || false,
    });
    setShowLeccionDialog(true);
  };

  const eliminarMaterial = (nombre: string) => {
    const nuevosMateriales = { ...nuevaLeccion.materialesUrl };
    delete nuevosMateriales[nombre];
    setNuevaLeccion({ ...nuevaLeccion, materialesUrl: nuevosMateriales });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!curso) {
    return <div className="text-center py-12">Curso no encontrado</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/cursos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{curso.titulo}</h1>
              {curso.publicado ? (
                <Badge variant="default" className="bg-green-600">
                  <Eye className="h-3 w-3 mr-1" /> Publicado
                </Badge>
              ) : (
                <Badge variant="secondary">Borrador</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {curso._count?.inscripciones || 0} estudiantes • {curso.modulos.length} módulos
            </p>
          </div>
        </div>
        <Button onClick={actualizarCurso} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estudiantes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{curso._count?.inscripciones || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calificación</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {curso.promedioCalificacion ? curso.promedioCalificacion.toFixed(1) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {curso._count?.reviews || 0} reviews
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Precio</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {curso.precio > 0 ? `${curso.moneda} $${curso.precio}` : 'Gratis'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duración</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {curso.duracionEstimadaHoras || 'N/A'}h
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 h-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="estructura">Estructura</TabsTrigger>
          <TabsTrigger value="monetizacion">Ventas</TabsTrigger>
          <TabsTrigger value="acceso">Acceso</TabsTrigger>
          <TabsTrigger value="gamificacion">Gamificación</TabsTrigger>
          <TabsTrigger value="comunidad">Comunidad</TabsTrigger>
          <TabsTrigger value="estudiantes">Alumnos</TabsTrigger>
          <TabsTrigger value="analytics">Métricas</TabsTrigger>
        </TabsList>

        {/* Tab: General */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
              <CardDescription>Configura los detalles básicos de tu curso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título del Curso *</Label>
                <Input
                  id="titulo"
                  value={curso.titulo}
                  onChange={(e) => setCurso({ ...curso, titulo: e.target.value })}
                  placeholder="Ej: Marketing Digital Avanzado"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitulo">Subtítulo</Label>
                <Input
                  id="subtitulo"
                  value={curso.subtitulo || ''}
                  onChange={(e) => setCurso({ ...curso, subtitulo: e.target.value })}
                  placeholder="Un subtítulo atractivo para tu curso"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción Corta</Label>
                <Textarea
                  id="descripcion"
                  value={curso.descripcion || ''}
                  onChange={(e) => setCurso({ ...curso, descripcion: e.target.value })}
                  rows={3}
                  placeholder="Una descripción breve que aparecerá en las listas de cursos"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcionLarga">Descripción Detallada</Label>
                <Textarea
                  id="descripcionLarga"
                  value={curso.descripcionLarga || ''}
                  onChange={(e) => setCurso({ ...curso, descripcionLarga: e.target.value })}
                  rows={6}
                  placeholder="Describe en detalle lo que los estudiantes aprenderán..."
                />
              </div>

              <div className="space-y-2">
                <Label>Imagen Destacada</Label>
                {curso.imagenDestacada && (
                  <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden mb-2">
                    <Image
                      src={curso.imagenDestacada}
                      alt={curso.titulo}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <label>
                  <Button variant="outline" asChild disabled={uploadingImage}>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={subirImagen}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoría</Label>
                  <Input
                    id="categoria"
                    value={curso.categoria || ''}
                    onChange={(e) => setCurso({ ...curso, categoria: e.target.value })}
                    placeholder="Ej: Marketing, Programación"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nivel">Nivel</Label>
                  <Select
                    value={curso.nivel}
                    onValueChange={(value) => setCurso({ ...curso, nivel: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principiante">Principiante</SelectItem>
                      <SelectItem value="intermedio">Intermedio</SelectItem>
                      <SelectItem value="avanzado">Avanzado</SelectItem>
                      <SelectItem value="todos">Todos los niveles</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duracion">Duración Estimada (horas)</Label>
                <Input
                  id="duracion"
                  type="number"
                  value={curso.duracionEstimadaHoras || ''}
                  onChange={(e) =>
                    setCurso({
                      ...curso,
                      duracionEstimadaHoras: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="publicado"
                  checked={curso.publicado}
                  onCheckedChange={(checked) => setCurso({ ...curso, publicado: checked })}
                />
                <Label htmlFor="publicado" className="cursor-pointer">
                  Publicar curso (visible para estudiantes)
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información del Instructor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="instructorNombre">Nombre del Instructor</Label>
                <Input
                  id="instructorNombre"
                  value={curso.instructorNombre || ''}
                  onChange={(e) => setCurso({ ...curso, instructorNombre: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructorBio">Biografía</Label>
                <Textarea
                  id="instructorBio"
                  value={curso.instructorBio || ''}
                  onChange={(e) => setCurso({ ...curso, instructorBio: e.target.value })}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Monetización */}
        <TabsContent value="monetizacion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Precios</CardTitle>
              <CardDescription>Define cómo quieres monetizar este curso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Tipo de Monetización</Label>
                <Select
                  value={curso.tipoMonetizacion}
                  onValueChange={(value) => setCurso({ ...curso, tipoMonetizacion: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Gratis</SelectItem>
                    <SelectItem value="one_time">Pago Único</SelectItem>
                    <SelectItem value="subscription">Suscripción</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {curso.tipoMonetizacion === 'one_time' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="precio">Precio</Label>
                    <Input
                      id="precio"
                      type="number"
                      step="0.01"
                      value={curso.precio}
                      onChange={(e) =>
                        setCurso({ ...curso, precio: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="moneda">Moneda</Label>
                    <Select
                      value={curso.moneda}
                      onValueChange={(value) => setCurso({ ...curso, moneda: value })}
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

              {curso.tipoMonetizacion === 'subscription' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="precioSuscripcion">Precio Mensual</Label>
                    <Input
                      id="precioSuscripcion"
                      type="number"
                      step="0.01"
                      value={curso.precioSuscripcion || ''}
                      onChange={(e) =>
                        setCurso({
                          ...curso,
                          precioSuscripcion: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="moneda">Moneda</Label>
                    <Select
                      value={curso.moneda}
                      onValueChange={(value) => setCurso({ ...curso, moneda: value })}
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

              <div className="flex items-center space-x-2">
                <Switch
                  id="permiteCupones"
                  checked={curso.permiteCupones}
                  onCheckedChange={(checked) => setCurso({ ...curso, permiteCupones: checked })}
                />
                <Label htmlFor="permiteCupones">Permitir cupones de descuento</Label>
              </div>
            </CardContent>
          </Card>

          {/* Cupones */}
          {curso.permiteCupones && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Cupones de Descuento</CardTitle>
                    <CardDescription>Gestiona los cupones para este curso</CardDescription>
                  </div>
                  <Dialog open={showCuponDialog} onOpenChange={setShowCuponDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Crear Cupón
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Nuevo Cupón</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Código</Label>
                          <Input
                            value={nuevoCupon.codigo}
                            onChange={(e) =>
                              setNuevoCupon({ ...nuevoCupon, codigo: e.target.value.toUpperCase() })
                            }
                            placeholder="DESCUENTO20"
                          />
                        </div>
                        <div>
                          <Label>Tipo de Descuento</Label>
                          <Select
                            value={nuevoCupon.tipo}
                            onValueChange={(value) => setNuevoCupon({ ...nuevoCupon, tipo: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="porcentaje">Porcentaje</SelectItem>
                              <SelectItem value="fijo">Monto Fijo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>
                            Valor {nuevoCupon.tipo === 'porcentaje' ? '(%)' : `(${curso.moneda})`}
                          </Label>
                          <Input
                            type="number"
                            value={nuevoCupon.valor}
                            onChange={(e) =>
                              setNuevoCupon({ ...nuevoCupon, valor: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div>
                          <Label>Usos Máximos (opcional)</Label>
                          <Input
                            type="number"
                            value={nuevoCupon.usosMaximos}
                            onChange={(e) =>
                              setNuevoCupon({ ...nuevoCupon, usosMaximos: e.target.value })
                            }
                            placeholder="Dejar vacío para ilimitado"
                          />
                        </div>
                        <div>
                          <Label>Fecha de Expiración (opcional)</Label>
                          <Input
                            type="date"
                            value={nuevoCupon.fechaExpiracion}
                            onChange={(e) =>
                              setNuevoCupon({ ...nuevoCupon, fechaExpiracion: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={crearCupon}>Crear Cupón</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {cupones.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay cupones creados aún
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descuento</TableHead>
                        <TableHead>Usos</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cupones.map((cupon) => (
                        <TableRow key={cupon.id}>
                          <TableCell className="font-mono font-bold">{cupon.codigo}</TableCell>
                          <TableCell>
                            {cupon.tipo === 'porcentaje'
                              ? `${cupon.valor}%`
                              : `${curso.moneda} $${cupon.valor}`}
                          </TableCell>
                          <TableCell>
                            {cupon.usos} / {cupon.usosMaximos || '∞'}
                          </TableCell>
                          <TableCell>
                            {cupon.activo ? (
                              <Badge variant="default" className="bg-green-600">Activo</Badge>
                            ) : (
                              <Badge variant="secondary">Inactivo</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCupon(cupon.id, cupon.activo)}
                            >
                              {cupon.activo ? 'Desactivar' : 'Activar'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Acceso */}
        <TabsContent value="acceso" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Control de Acceso</CardTitle>
              <CardDescription>
                Configura cuándo y cómo los estudiantes pueden acceder al curso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Tipo de Acceso</Label>
                <Select
                  value={curso.tipoAcceso}
                  onValueChange={(value) => setCurso({ ...curso, tipoAcceso: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Acceso Inmediato</SelectItem>
                    <SelectItem value="scheduled">Fecha Programada</SelectItem>
                    <SelectItem value="drip">Contenido Progresivo (Drip)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {curso.tipoAcceso === 'scheduled' && (
                <div className="space-y-2">
                  <Label htmlFor="fechaInicio">Fecha de Inicio</Label>
                  <Input
                    id="fechaInicio"
                    type="datetime-local"
                    value={curso.fechaInicio || ''}
                    onChange={(e) => setCurso({ ...curso, fechaInicio: e.target.value })}
                  />
                  <p className="text-sm text-muted-foreground">
                    El curso estará disponible a partir de esta fecha
                  </p>
                </div>
              )}

              {curso.tipoAcceso === 'drip' && (
                <div className="space-y-2">
                  <Label>Desbloquear nuevo contenido cada (días)</Label>
                  <Input
                    type="number"
                    value={curso.diasExpiracion || ''}
                    onChange={(e) =>
                      setCurso({
                        ...curso,
                        diasExpiracion: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    placeholder="7"
                  />
                  <p className="text-sm text-muted-foreground">
                    Las lecciones se desbloquearán progresivamente
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Expiración del Acceso (días)</Label>
                <Input
                  type="number"
                  value={curso.diasExpiracion || ''}
                  onChange={(e) =>
                    setCurso({
                      ...curso,
                      diasExpiracion: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Dejar vacío para acceso ilimitado"
                />
                <p className="text-sm text-muted-foreground">
                  Tiempo que el estudiante tendrá acceso después de inscribirse
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Estructura */}
        <TabsContent value="estructura" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Contenido del Curso</h3>
              <p className="text-sm text-muted-foreground">
                Organiza los módulos y lecciones de tu curso
              </p>
            </div>
            <Dialog open={showModuloDialog} onOpenChange={setShowModuloDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Módulo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo Módulo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Título del Módulo</Label>
                    <Input
                      value={nuevoModulo.titulo}
                      onChange={(e) => setNuevoModulo({ ...nuevoModulo, titulo: e.target.value })}
                      placeholder="Ej: Introducción al Marketing"
                    />
                  </div>
                  <div>
                    <Label>Descripción</Label>
                    <Textarea
                      value={nuevoModulo.descripcion}
                      onChange={(e) =>
                        setNuevoModulo({ ...nuevoModulo, descripcion: e.target.value })
                      }
                      placeholder="¿Qué aprenderán en este módulo?"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={crearModulo}>Crear Módulo</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {curso.modulos.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  No hay módulos. Crea el primero para comenzar a estructurar tu curso.
                </p>
                <Button onClick={() => setShowModuloDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Primer Módulo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {curso.modulos.map((modulo, index) => (
                <Card key={modulo.id}>
                  <CardHeader className="bg-muted/50">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 mt-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                          <Badge variant="outline">Módulo {index + 1}</Badge>
                        </div>
                        <div>
                          <CardTitle className="text-lg">{modulo.titulo}</CardTitle>
                          <CardDescription className="mt-1">{modulo.descripcion}</CardDescription>
                          <p className="text-xs text-muted-foreground mt-2">
                            {modulo.lecciones.length} lecciones
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setModuloActual(modulo.id);
                            setShowLeccionDialog(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Lección
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => eliminarModulo(modulo.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {modulo.lecciones.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Sin lecciones. Agrega la primera lección.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {modulo.lecciones.map((leccion, lecIndex) => (
                          <div
                            key={leccion.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                              {leccion.tipoContenido === 'video' ? (
                                <Video className="h-5 w-5 text-primary" />
                              ) : (
                                <File className="h-5 w-5 text-primary" />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{leccion.titulo}</p>
                                  {leccion.esGratuita && (
                                    <Badge variant="secondary" className="text-xs">
                                      Gratis
                                    </Badge>
                                  )}
                                </div>
                                {leccion.duracionMinutos && (
                                  <p className="text-xs text-muted-foreground">
                                    {leccion.duracionMinutos} minutos
                                  </p>
                                )}
                                {leccion.videoUrl && (
                                  <p className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Video subido
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => abrirEdicionLeccion(leccion)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {leccion.tipoContenido === 'video' && !leccion.videoUrl && (
                                <label>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                    disabled={uploadingVideo}
                                  >
                                    <span>
                                      <Upload className="h-4 w-4 mr-1" />
                                      Video
                                    </span>
                                  </Button>
                                  <input
                                    type="file"
                                    accept="video/*"
                                    className="hidden"
                                    onChange={(e) => subirVideo(e, leccion.id)}
                                  />
                                </label>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => eliminarLeccion(leccion.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Dialog: Nueva Lección */}
          <Dialog open={showLeccionDialog} onOpenChange={setShowLeccionDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva Lección</DialogTitle>
                <DialogDescription>Crea una nueva lección en este módulo</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label>Título de la Lección *</Label>
                    <Input
                      value={nuevaLeccion.titulo}
                      onChange={(e) => setNuevaLeccion({ ...nuevaLeccion, titulo: e.target.value })}
                      placeholder="Ej: Introducción a las Redes Sociales"
                    />
                  </div>
                  <div>
                    <Label>Descripción</Label>
                    <Input
                      value={nuevaLeccion.descripcion}
                      onChange={(e) =>
                        setNuevaLeccion({ ...nuevaLeccion, descripcion: e.target.value })
                      }
                      placeholder="Breve descripción de la lección"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Duración (minutos)</Label>
                      <Input
                        type="number"
                        value={nuevaLeccion.duracionMinutos}
                        onChange={(e) =>
                          setNuevaLeccion({ ...nuevaLeccion, duracionMinutos: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Tipo de Contenido</Label>
                      <Select
                        value={nuevaLeccion.tipoContenido}
                        onValueChange={(value) =>
                          setNuevaLeccion({ ...nuevaLeccion, tipoContenido: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="texto">Texto</SelectItem>
                          <SelectItem value="archivo">Archivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {nuevaLeccion.tipoContenido === 'video' && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Video className="h-4 w-4" /> Configuración de Video
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Tabs 
                        value={nuevaLeccion.videoTipo} 
                        onValueChange={(v) => setNuevaLeccion({...nuevaLeccion, videoTipo: v})}
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="upload" className="flex items-center gap-2">
                            <Upload className="h-3.5 w-3.5" /> Subir Archivo
                          </TabsTrigger>
                          <TabsTrigger value="external" className="flex items-center gap-2">
                            <LinkIcon className="h-3.5 w-3.5" /> Enlace Externo
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="upload" className="pt-4 text-center">
                          <p className="text-xs text-muted-foreground mb-4">
                            Sube un archivo de video directamente a nuestros servidores (S3/Cloud).
                          </p>
                          <Badge variant="outline" className="font-normal text-xs mb-2">
                            El video se subirá después de crear la lección.
                          </Badge>
                        </TabsContent>
                        
                        <TabsContent value="external" className="pt-4 space-y-4">
                          <div className="space-y-2">
                            <Label className="text-xs">URL del Video (YouTube, Vimeo, Dailymotion)</Label>
                            <div className="flex gap-2">
                              <Input 
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={nuevaLeccion.videoUrl}
                                onChange={(e) => {
                                  const url = e.target.value;
                                  const info = parseVideoUrl(url);
                                  setNuevaLeccion({
                                    ...nuevaLeccion,
                                    videoUrl: url,
                                    // Guardamos el tipo específico si se reconoce
                                    videoTipo: info.provider === 'unknown' ? 'external' : info.provider
                                  });
                                }}
                              />
                            </div>
                            {nuevaLeccion.videoUrl && (
                              <div className="flex items-center gap-2 mt-1">
                                {parseVideoUrl(nuevaLeccion.videoUrl).provider !== 'unknown' ? (
                                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> URL Válida: {parseVideoUrl(nuevaLeccion.videoUrl).provider}
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="flex items-center gap-1">
                                    <XCircle className="h-3 w-3" /> URL No reconocida
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                )}

                {nuevaLeccion.tipoContenido === 'texto' && (
                  <div>
                    <Label>Contenido</Label>
                    <Textarea
                      value={nuevaLeccion.contenido}
                      onChange={(e) =>
                        setNuevaLeccion({ ...nuevaLeccion, contenido: e.target.value })
                      }
                      rows={6}
                      placeholder="Escribe el contenido de la lección..."
                    />
                  </div>
                )}

                {/* Materiales Adicionales Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <File className="h-4 w-4 text-primary" /> Materiales Adicionales
                    </Label>
                    <label className="cursor-pointer">
                      <Button variant="outline" size="sm" asChild disabled={uploadingMaterial}>
                        <span>
                          <Plus className="h-3 w-3 mr-1" /> Adjuntar
                        </span>
                      </Button>
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={subirMaterial}
                        accept=".pdf,.doc,.docx,.zip,.rar,.png,.jpg"
                      />
                    </label>
                  </div>
                  
                  <div className="bg-slate-50 rounded-xl p-4 border border-dashed border-slate-200">
                    {Object.keys(nuevaLeccion.materialesUrl).length === 0 ? (
                      <p className="text-xs text-center text-muted-foreground py-2">
                        No hay materiales adjuntos para esta lección.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(nuevaLeccion.materialesUrl).map(([nombre, url]) => (
                          <div key={nombre} className="flex items-center justify-between bg-white p-2 rounded-lg border text-xs">
                            <div className="flex items-center gap-2 truncate pr-4">
                              <Download className="h-3 w-3 text-slate-400" />
                              <span className="truncate font-medium">{nombre}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-destructive"
                              onClick={() => eliminarMaterial(nombre)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="esGratuita"
                    checked={nuevaLeccion.esGratuita}
                    onCheckedChange={(checked) =>
                      setNuevaLeccion({ ...nuevaLeccion, esGratuita: checked })
                    }
                  />
                  <Label htmlFor="esGratuita">Lección gratuita (preview)</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setShowLeccionDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={crearLeccion}>
                  {leccionIdEdicion ? 'Guardar Cambios' : 'Crear Lección'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab: Gamificación */}
        <TabsContent value="gamificacion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Sistema de Recompensas
              </CardTitle>
              <CardDescription>
                Motiva a tus estudiantes otorgando puntos e insignias por completar lecciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">Activar Gamificación</Label>
                  <p className="text-sm text-muted-foreground">
                    Los estudiantes verán su progreso, nivel y medallas ganadas
                  </p>
                </div>
                <Switch
                  checked={curso.gamificacionActiva || false}
                  onCheckedChange={(checked) => setCurso({ ...curso, gamificacionActiva: checked })}
                />
              </div>

              {curso.gamificacionActiva && (
                <div className="space-y-6 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Puntos por lección completada</Label>
                      <Input
                        type="number"
                        value={curso.puntosPorLeccion || 10}
                        onChange={(e) => setCurso({ ...curso, puntosPorLeccion: parseInt(e.target.value) || 10 })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Insignia por finalizar el curso</Label>
                      <div className="flex items-center gap-4 p-3 border rounded-lg">
                        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                          <Award className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium">Certificado de Excelencia</p>
                          <p className="text-xs text-muted-foreground">Se otorga al llegar al 100%</p>
                        </div>
                        <Button variant="outline" size="sm" className="ml-auto">Cambiar</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Comunidad e Interacción */}
        <TabsContent value="comunidad" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-blue-500" />
                Cohortes y Foros
              </CardTitle>
              <CardDescription>
                Fomenta la discusión y el aprendizaje colaborativo dentro del curso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">Activar Foros en Módulos</Label>
                  <p className="text-sm text-muted-foreground">
                    Permite a los estudiantes dejar comentarios y preguntas en cada lección
                  </p>
                </div>
                <Switch
                  checked={curso.comunidadActiva || false}
                  onCheckedChange={(checked) => setCurso({ ...curso, comunidadActiva: checked })}
                />
              </div>

              {curso.comunidadActiva && (
                <div className="p-4 border border-blue-100 dark:border-blue-900 rounded-lg">
                  <h4 className="font-semibold mb-2">Características Habilitadas:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    <li>Cajas de comentarios al final de la visualización de una lección.</li>
                    <li>Notificaciones al instructor por cada nueva duda.</li>
                    <li>Los alumnos pueden votarse respuestas mutuamente (+1 punto de gamificación).</li>
                  </ul>
                  <Link href={`/dashboard/comunidad?cursoId=${params.id}`}>
                    <Button variant="secondary" className="mt-4 w-full md:w-auto">
                      Ir a Moderar Comentarios
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Estudiantes */}
        <TabsContent value="estudiantes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estudiantes Inscritos</CardTitle>
              <CardDescription>
                Gestiona y monitorea a tus estudiantes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {estudiantes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Aún no hay estudiantes inscritos
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estudiante</TableHead>
                      <TableHead>Inscripción</TableHead>
                      <TableHead>Progreso</TableHead>
                      <TableHead>Último Acceso</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estudiantes.map((estudiante) => (
                      <TableRow key={estudiante.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{estudiante.nombre}</p>
                            <p className="text-sm text-muted-foreground">{estudiante.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(estudiante.fechaInscripcion).toLocaleDateString('es-MX')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={estudiante.progreso} className="w-20" />
                            <span className="text-sm">{estudiante.progreso}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(estudiante.ultimoAcceso).toLocaleDateString('es-MX')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Mail className="h-4 w-4 mr-1" />
                            Enviar Email
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Tasa de Finalización</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {estudiantes.length > 0
                    ? (
                      (estudiantes.filter((e) => e.progreso === 100).length /
                        estudiantes.length) *
                      100
                    ).toFixed(1)
                    : 0}
                  %
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {estudiantes.filter((e) => e.progreso === 100).length} estudiantes completaron
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Progreso Promedio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {estudiantes.length > 0
                    ? (
                      estudiantes.reduce((acc, e) => acc + e.progreso, 0) / estudiantes.length
                    ).toFixed(1)
                    : 0}
                  %
                </div>
                <Progress
                  value={
                    estudiantes.length > 0
                      ? estudiantes.reduce((acc, e) => acc + e.progreso, 0) / estudiantes.length
                      : 0
                  }
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {curso.moneda} ${((curso._count?.inscripciones || 0) * curso.precio).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Basado en {curso._count?.inscripciones || 0} inscripciones
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Reseñas de Estudiantes</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${star <= (curso.promedioCalificacion || 0)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                        }`}
                    />
                  ))}
                </div>
                <span className="text-lg font-semibold">
                  {curso.promedioCalificacion?.toFixed(1) || 'N/A'}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({curso._count?.reviews || 0} reviews)
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Aún no hay reseñas para este curso
                </p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b pb-4 last:border-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{review.estudianteNombre}</p>
                          <div className="flex items-center gap-1 mt-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${star <= review.calificacion
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                                  }`}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(review.fecha).toLocaleDateString('es-MX')}
                        </span>
                      </div>
                      {review.comentario && (
                        <p className="text-sm text-muted-foreground">{review.comentario}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
