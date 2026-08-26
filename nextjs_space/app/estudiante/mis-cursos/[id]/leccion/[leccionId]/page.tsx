'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, 
  Circle, Video, FileText, File, Download, BookOpen, 
  Play, Lock, MessageSquare, ListVideo, NotepadText,
  Clock, Share2, MoreVertical
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { parseVideoUrl } from '@/lib/video-utils';

interface Leccion {
  id: string;
  titulo: string;
  descripcion: string | null;
  contenido: string | null;
  videoUrl: string | null;
  videoTipo: string | null;
  duracionMinutos: number | null;
  materialesUrl: any;
  tipoContenido: string;
  orden: number;
  completada?: boolean;
  modulo: {
    id: string;
    titulo: string;
    orden: number;
  };
}

interface LeccionNavItem {
  id: string;
  titulo: string;
  completada: boolean;
  orden: number;
  moduloTitulo: string;
}

interface Curso {
  id: string;
  titulo: string;
}

export default function ReproductorLeccionPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const [leccion, setLeccion] = useState<Leccion | null>(null);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [todasLecciones, setTodasLecciones] = useState<LeccionNavItem[]>([]);
  const [leccionAnterior, setLeccionAnterior] = useState<string | null>(null);
  const [leccionSiguiente, setLeccionSiguiente] = useState<string | null>(null);
  const [notas, setNotas] = useState('');
  const [completada, setCompletada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marcando, setMarcando] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [params.leccionId]);

  const cargarDatos = async () => {
    try {
      const [leccionRes, cursoRes, leccionesRes] = await Promise.all([
        fetch(`/api/lecciones/${params.leccionId}`),
        fetch(`/api/cursos/${params.id}`),
        fetch(`/api/cursos/${params.id}/lecciones-lista`),
      ]);

      if (leccionRes.ok) {
        const leccionData = await leccionRes.json();
        setLeccion(leccionData);
        setCompletada(leccionData.completada || false);
      }
      
      if (cursoRes.ok) {
        const cursoData = await cursoRes.json();
        setCurso(cursoData);
      }

      if (leccionesRes.ok) {
        const leccionesData = await leccionesRes.json();
        setTodasLecciones(leccionesData);
        
        const currentIndex = leccionesData.findIndex((l: LeccionNavItem) => l.id === params.leccionId);
        if (currentIndex > 0) {
          setLeccionAnterior(leccionesData[currentIndex - 1].id);
        } else {
          setLeccionAnterior(null);
        }
        if (currentIndex < leccionesData.length - 1) {
          setLeccionSiguiente(leccionesData[currentIndex + 1].id);
        } else {
          setLeccionSiguiente(null);
        }
      }

      const notasRes = await fetch(`/api/progreso/${params.leccionId}/notas`);
      if (notasRes.ok) {
        const notasData = await notasRes.json();
        setNotas(notasData.notas || '');
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const marcarComoCompletada = async () => {
    setMarcando(true);
    try {
      const response = await fetch(`/api/progreso/${params.leccionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completada: !completada }),
      });

      if (response.ok) {
        setCompletada(!completada);
        toast({
          title: completada ? 'Marcada como no completada' : '¡Lección completada!',
          description: completada ? '' : 'Sigue así, estás progresando muy bien',
        });
        cargarDatos(); 
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el progreso',
        variant: 'destructive',
      });
    } finally {
      setMarcando(false);
    }
  };

  const guardarNotas = async () => {
    try {
      await fetch(`/api/progreso/${params.leccionId}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas }),
      });
      toast({ title: 'Notas guardadas', description: 'Tus notas académicas se han guardado.' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las notas',
        variant: 'destructive',
      });
    }
  };

  const irALeccion = (leccionId: string) => {
    router.push(`/estudiante/mis-cursos/${params.id}/leccion/${leccionId}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse font-black text-[10px] uppercase tracking-widest">Preparando el reproductor...</p>
      </div>
    );
  }

  if (!leccion || !curso) {
    return (
      <div className="text-center py-20 bg-white rounded-[2.5rem] border border-slate-100 max-w-2xl mx-auto shadow-sm">
        <Lock className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
        <h2 className="text-2xl font-black text-slate-900 mb-2">Contenido no accesible</h2>
        <p className="text-muted-foreground font-medium mb-8">Esta lección no está disponible o no tienes permisos suficientes.</p>
        <Button onClick={() => router.back()} className="rounded-2xl h-12 px-8 font-black uppercase text-xs">Volver</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start max-w-7xl mx-auto pb-20">
      {/* Main Content Area */}
      <div className="flex-1 w-full space-y-6">
        {/* Lesson Header Navigation */}
        <div className="flex items-center justify-between mb-2">
           <Button variant="ghost" onClick={() => router.push(`/estudiante/mis-cursos/${params.id}`)} className="text-muted-foreground hover:text-primary font-black text-xs uppercase tracking-widest p-0 h-auto">
             <ArrowLeft className="h-4 w-4 mr-2" /> Volver al Curso
           </Button>
           <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200" onClick={() => {}}>
                <Share2 className="h-4 w-4 text-slate-400" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200" onClick={() => {}}>
                <MoreVertical className="h-4 w-4 text-slate-400" />
              </Button>
           </div>
        </div>

        {/* Video Player Section */}
        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-slate-900 group relative">
          {leccion.tipoContenido === 'video' && leccion.videoUrl ? (
            <div className="relative w-full aspect-video bg-black flex items-center justify-center shadow-inner">
               {leccion.videoTipo === 'upload' || !leccion.videoTipo ? (
                 <video
                   controls
                   className="w-full h-full max-h-[70vh]"
                   src={leccion.videoUrl}
                   controlsList="nodownload"
                   onEnded={marcarComoCompletada}
                 >
                   Tu navegador no soporta el elemento de video.
                 </video>
               ) : (
                 <iframe
                   src={parseVideoUrl(leccion.videoUrl).embedUrl || ''}
                   className="w-full h-full"
                   allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                   allowFullScreen
                   title={leccion.titulo}
                 ></iframe>
               )}
            </div>
          ) : leccion.tipoContenido === 'texto' && leccion.contenido ? (
            <div className="min-h-[400px] p-12 bg-white text-slate-900">
               <div className="prose prose-slate max-w-none">
                  <h1 className="text-4xl font-black tracking-tighter mb-8">{leccion.titulo}</h1>
                  <p className="text-lg leading-relaxed whitespace-pre-line text-slate-600 font-medium">
                    {leccion.contenido}
                  </p>
               </div>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-white/50 p-12">
               <FileText className="h-16 w-16 mb-4 opacity-20" />
               <p className="font-bold text-lg">No hay contenido visual para esta lección</p>
               <p className="text-sm">Consulta la descripción y materiales adjuntos.</p>
            </div>
          )}
          
          {/* Internal Navigation Over Video (Optional/Hidden for now) */}
        </Card>

        {/* Lesson Metadata & Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
           <div className="space-y-1">
              <Badge className="bg-primary/10 text-primary border-none font-black text-[10px] uppercase mb-1">{leccion.modulo.titulo}</Badge>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">{leccion.titulo}</h1>
           </div>
           <div className="flex items-center gap-4">
              <Button
                onClick={marcarComoCompletada}
                disabled={marcando}
                variant={completada ? 'outline' : 'default'}
                className={cn(
                  "rounded-2xl h-14 px-8 font-black uppercase text-xs tracking-widest shadow-lg transition-all",
                  completada ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "shadow-primary/20 hover:scale-105"
                )}
              >
                {completada ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Completada</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" /> Marcar como Vista</>
                )}
              </Button>
              
              <div className="flex items-center gap-2">
                 <Button 
                   variant="outline" 
                   disabled={!leccionAnterior} 
                   onClick={() => leccionAnterior && irALeccion(leccionAnterior)}
                   className="h-14 w-14 rounded-2xl border-slate-200"
                 >
                   <ChevronLeft className="h-5 w-5" />
                 </Button>
                 <Button 
                   variant="outline" 
                   disabled={!leccionSiguiente} 
                   onClick={() => leccionSiguiente && irALeccion(leccionSiguiente)}
                   className="h-14 w-14 rounded-2xl border-slate-200"
                 >
                   <ChevronRight className="h-5 w-5" />
                 </Button>
              </div>
           </div>
        </div>

        {/* Lesson Details Tabs */}
        <Tabs defaultValue="overview" className="w-full">
           <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl h-14 w-full md:w-fit mb-6 gap-2">
              <TabsTrigger value="overview" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm"><BookOpen className="h-4 w-4 mr-2" /> Descripción</TabsTrigger>
              <TabsTrigger value="notes" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm"><NotepadText className="h-4 w-4 mr-2" /> Mis Notas</TabsTrigger>
              <TabsTrigger value="resources" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm"><Download className="h-4 w-4 mr-2" /> Materiales</TabsTrigger>
           </TabsList>

           <TabsContent value="overview">
              <Card className="border-none shadow-sm rounded-[2rem]">
                 <CardContent className="p-8">
                    {leccion.descripcion ? (
                       <div className="prose prose-slate max-w-none">
                          <p className="text-slate-600 font-medium leading-relaxed whitespace-pre-line">
                            {leccion.descripcion}
                          </p>
                       </div>
                    ) : (
                       <div className="text-center py-10 opacity-30 font-black uppercase text-xs">No hay descripción detallada</div>
                    )}
                 </CardContent>
              </Card>
           </TabsContent>

           <TabsContent value="notes">
              <Card className="border-none shadow-sm rounded-[2rem]">
                 <CardContent className="p-8 space-y-6">
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2 block">Tus apuntes personales</Label>
                       <Textarea
                         value={notas}
                         onChange={(e) => setNotas(e.target.value)}
                         placeholder="Escribe aquí lo más importante de esta lección..."
                         className="rounded-[1.5rem] border-slate-100 bg-slate-50 focus:bg-white transition-colors p-6 font-medium text-slate-800 focus-visible:ring-primary/10 min-h-[300px]"
                       />
                    </div>
                    <Button onClick={guardarNotas} className="rounded-2xl h-12 px-8 font-black uppercase text-xs shadow-lg shadow-primary/10">
                       Guardar Notas Académicas
                    </Button>
                 </CardContent>
              </Card>
           </TabsContent>

           <TabsContent value="resources">
              <Card className="border-none shadow-sm rounded-[2rem]">
                 <CardContent className="p-8">
                    {leccion.materialesUrl && Object.keys(leccion.materialesUrl).length > 0 ? (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(leccion.materialesUrl).map(([key, value]) => (
                             <a
                               key={key}
                               href={value as string}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-xl hover:border-primary/20 transition-all"
                             >
                                <div className="flex items-center gap-4">
                                   <div className="h-10 w-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                                      <File className="h-5 w-5 text-primary" />
                                   </div>
                                   <span className="font-bold text-slate-900 group-hover:text-primary transition-colors">{key}</span>
                                </div>
                                <Download className="h-5 w-5 text-slate-300" />
                             </a>
                          ))}
                       </div>
                    ) : (
                       <div className="text-center py-20 opacity-30">
                          <Download className="h-12 w-12 mx-auto mb-4" />
                          <p className="font-black uppercase text-xs tracking-widest">Sin materiales descargables</p>
                       </div>
                    )}
                 </CardContent>
              </Card>
           </TabsContent>
        </Tabs>
      </div>

      {/* Course Sidebar Checklist */}
      <div className="w-full lg:w-80 sticky top-28 space-y-6">
         <Card className="border-none shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-6 px-8">
               <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-tighter flex items-center gap-2">
                    <ListVideo className="h-4 w-4 text-primary" /> Contenido
                  </h3>
                  <Badge variant="outline" className="border-slate-300 font-black text-[9px] px-1.5 h-5 rounded-md text-muted-foreground uppercase">
                    PROGRESO
                  </Badge>
               </div>
               <Progress 
                value={(todasLecciones.filter(l => l.completada).length / (todasLecciones.length || 1)) * 100} 
                className="h-1.5" 
               />
               <p className="text-[9px] font-black text-muted-foreground uppercase mt-2 tracking-widest">
                  {todasLecciones.filter(l => l.completada).length} / {todasLecciones.length} completadas
               </p>
            </CardHeader>
            <ScrollArea className="h-[calc(100vh-350px)]">
               <div className="p-4 space-y-1">
                  {todasLecciones.map((item, index) => {
                    const isActive = item.id === params.leccionId;
                    const moduloChanged = index === 0 || item.moduloTitulo !== todasLecciones[index - 1].moduloTitulo;

                    return (
                      <div key={item.id} className="space-y-1">
                        {moduloChanged && (
                          <div className="px-4 py-3 mt-4 first:mt-0">
                             <p className="text-[10px] font-black text-primary uppercase tracking-widest">{item.moduloTitulo}</p>
                          </div>
                        )}
                        <button
                          onClick={() => irALeccion(item.id)}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-2xl transition-all group/lec",
                            isActive 
                              ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                              : "hover:bg-slate-50 text-slate-600"
                          )}
                        >
                           <div className="flex items-center gap-3 text-left">
                              {item.completada ? (
                                <CheckCircle2 className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-emerald-500")} />
                              ) : (
                                <div className={cn("h-4 w-4 rounded-full border-2 shrink-0 transition-colors", isActive ? "border-white" : "border-slate-300 group-hover/lec:border-primary")} />
                              )}
                              <span className={cn("text-xs font-bold line-clamp-2 leading-tight", isActive ? "text-white" : "text-slate-700")}>
                                {item.titulo}
                              </span>
                           </div>
                           {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                        </button>
                      </div>
                    );
                  })}
               </div>
            </ScrollArea>
         </Card>

         <Card className="border-none shadow-sm rounded-[2.5rem] p-6 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white text-center">
            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Comunidad Académica</h4>
            <p className="text-sm font-bold mb-4 leading-relaxed">¿Tienes dudas sobre esta lección?
            </p>
            <Button asChild size="sm" className="w-full bg-white text-indigo-700 hover:bg-slate-100 rounded-xl font-black text-[10px] uppercase shadow-lg">
              <Link href={`/estudiante/mis-cursos/${params.id}`}>
                Abrir Comunidad del Curso
              </Link>
            </Button>
         </Card>
      </div>
    </div>
  );
}
