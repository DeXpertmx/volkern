
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, BookOpen, Users, Clock, DollarSign, Eye, Edit, Trash2, Star, Tag } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Curso {
  id: string;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  imagenDestacada: string | null;
  categoria: string | null;
  precio: number;
  moneda: string;
  duracionEstimadaHoras: number | null;
  nivel: string;
  publicado: boolean;
  tipoMonetizacion: string;
  modulos: Array<{
    id: string;
    lecciones: Array<{ id: string }>;
  }>;
  _count: {
    inscripciones: number;
    reviews: number;
  };
  promedioCalificacion?: number;
  totalReviews?: number;
}

export default function CursosPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursoAEliminar, setCursoAEliminar] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    cargarCursos();
  }, []);

  const cargarCursos = async () => {
    try {
      const response = await fetch('/api/cursos');
      if (response.ok) {
        const data = await response.json();
        setCursos(data);
      }
    } catch (error) {
      console.error('Error al cargar cursos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los cursos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const eliminarCurso = async () => {
    if (!cursoAEliminar) return;

    try {
      const response = await fetch(`/api/cursos/${cursoAEliminar}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Curso eliminado',
          description: 'El curso ha sido eliminado exitosamente',
        });
        cargarCursos();
      } else {
        throw new Error('Error al eliminar el curso');
      }
    } catch (error) {
      console.error('Error al eliminar curso:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el curso',
        variant: 'destructive',
      });
    } finally {
      setCursoAEliminar(null);
    }
  };

  const calcularTotalLecciones = (curso: Curso) => {
    return curso.modulos.reduce((acc, modulo) => acc + modulo.lecciones.length, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Cursos</h1>
          <p className="text-muted-foreground">
            Gestiona tus cursos, módulos y contenido educativo
          </p>
        </div>
        <Link href="/dashboard/cursos/nuevo">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Crear Curso
          </Button>
        </Link>
      </div>

      {cursos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay cursos todavía</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Comienza creando tu primer curso
            </p>
            <Link href="/dashboard/cursos/nuevo">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Crear Primer Curso
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cursos.map((curso) => (
            <Card key={curso.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                  <div className="flex gap-2">
                    <Badge variant={curso.publicado ? 'default' : 'secondary'}>
                      {curso.publicado ? 'Publicado' : 'Borrador'}
                    </Badge>
                    <Badge variant="outline">{curso.nivel}</Badge>
                  </div>
                  {curso.categoria && (
                    <Badge variant="secondary" className="gap-1">
                      <Tag className="h-3 w-3" />
                      {curso.categoria}
                    </Badge>
                  )}
                </div>
                <CardTitle className="line-clamp-2">{curso.titulo}</CardTitle>
                {curso.subtitulo && (
                  <CardDescription className="line-clamp-1 font-medium">
                    {curso.subtitulo}
                  </CardDescription>
                )}
                <CardDescription className="line-clamp-2">
                  {curso.descripcion || 'Sin descripción'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {(curso.promedioCalificacion !== undefined && curso.promedioCalificacion > 0) && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="ml-1 font-semibold">{curso.promedioCalificacion.toFixed(1)}</span>
                    </div>
                    <span className="text-muted-foreground">
                      ({curso.totalReviews || curso._count.reviews} {(curso.totalReviews || curso._count.reviews) === 1 ? 'review' : 'reviews'})
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center text-sm">
                    <BookOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{curso.modulos.length} módulos</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Eye className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{calcularTotalLecciones(curso)} lecciones</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{curso._count.inscripciones} estudiantes</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>
                      {curso.tipoMonetizacion === 'free' 
                        ? 'Gratis'
                        : curso.tipoMonetizacion === 'subscription'
                        ? 'Suscripción'
                        : curso.precio > 0
                        ? `${curso.precio.toFixed(2)} ${curso.moneda}`
                        : 'Gratis'}
                    </span>
                  </div>
                </div>

                {curso.duracionEstimadaHoras && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 mr-2" />
                    <span>~{curso.duracionEstimadaHoras} horas</span>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Link href={`/dashboard/cursos/${curso.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCursoAEliminar(curso.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!cursoAEliminar} onOpenChange={() => setCursoAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el curso, todos sus módulos, lecciones y el progreso de los
              estudiantes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarCurso} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
