'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ArrowLeft, Play, CheckCircle2, Lock, Clock, BookOpen, 
  Award, FileText, Video, Star, Download, ChevronRight,
  User, MessageSquare, Share2, Send, Reply, Heart,
  Users, Loader2
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Leccion {
  id: string;
  titulo: string;
  descripcion: string | null;
  duracionMinutos: number | null;
  tipoContenido: string;
  esGratuita: boolean;
  orden: number;
  completada?: boolean;
}

interface Modulo {
  id: string;
  titulo: string;
  descripcion: string | null;
  orden: number;
  lecciones: Leccion[];
}

interface Comentario {
  id: string;
  estudiante: {
    primerNombre: string;
    apellidoPaterno: string;
    email?: string;
  };
  comentario: string;
  fechaCreacion: string;
  votosPositivos: number;
  respuestas: Comentario[];
}

interface Curso {
  id: string;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  descripcionLarga: string | null;
  imagenDestacada: string | null;
  nivel: string;
  duracionEstimadaHoras: number | null;
  instructorNombre: string | null;
  instructorBio: string | null;
  instructorImagen: string | null;
  promedioCalificacion: number | null;
  modulos: Modulo[];
}

interface Inscripcion {
  id: string;
  progreso: number;
  completado: boolean;
  fechaInscripcion: string;
}

export default function DetalleCursoEstudiantePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [curso, setCurso] = useState<Curso | null>(null);
  const [inscripcion, setInscripcion] = useState<Inscripcion | null>(null);
  const [comunidades, setComunidades] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingComunidad, setLoadingComunidad] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
  }, [params.id]);

  const cargarDatos = async () => {
    try {
      const [cursoRes, inscripcionRes] = await Promise.all([
        fetch(`/api/cursos/${params.id}`),
        fetch(`/api/inscripciones/${params.id}`),
      ]);

      if (cursoRes.ok) {
        const cursoData = await cursoRes.json();
        setCurso(cursoData);
      }
      
      if (inscripcionRes.ok) {
        const inscripcionData = await inscripcionRes.json();
        setInscripcion(inscripcionData);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del curso',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const cargarComunidad = async () => {
    setLoadingComunidad(true);
    try {
      const res = await fetch(`/api/cursos/${params.id}/comunidad`);
      if (res.ok) {
        const data = await res.json();
        setComunidades(data);
      }
    } catch (error) {
      console.error('Error community:', error);
    } finally {
      setLoadingComunidad(false);
    }
  };

  const handlePostComment = async () => {
    if (!nuevoComentario.trim()) return;
    setEnviandoComentario(true);
    try {
      const res = await fetch(`/api/cursos/${params.id}/comunidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          comentario: nuevoComentario,
          comentarioPadreId: replyTo
        }),
      });

      if (res.ok) {
        toast({ title: 'Mensaje enviado', description: 'Tu comentario ha sido publicado en la comunidad.' });
        setNuevoComentario('');
        setReplyTo(null);
        await cargarComunidad();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo enviar el comentario.', variant: 'destructive' });
    } finally {
      setEnviandoComentario(false);
    }
  };

  const getTotalLecciones = () => {
    if (!curso) return 0;
    return curso.modulos.reduce((acc, mod) => acc + mod.lecciones.length, 0);
  };

  const getLeccionesCompletadas = () => {
    if (!curso) return 0;
    let completadas = 0;
    curso.modulos.forEach(mod => {
      mod.lecciones.forEach(lec => {
        if (lec.completada) completadas++;
      });
    });
    return completadas;
  };

  const iniciarCurso = () => {
    if (curso && curso.modulos.length > 0 && curso.modulos[0].lecciones.length > 0) {
      const primeraLeccion = curso.modulos[0].lecciones[0];
      router.push(`/estudiante/mis-cursos/${params.id}/leccion/${primeraLeccion.id}`);
    }
  };

  const continuarCurso = () => {
    if (!curso) return;
    for (const modulo of curso.modulos) {
      const leccionPendiente = modulo.lecciones.find((l) => !l.completada);
      if (leccionPendiente) {
        router.push(`/estudiante/mis-cursos/${params.id}/leccion/${leccionPendiente.id}`);
        return;
      }
    }
    iniciarCurso();
  };

  const descargarCertificado = async () => {
    try {
      const response = await fetch(`/api/certificados/${params.id}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificado-${curso?.titulo}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo descargar el certificado',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse font-bold uppercase text-[10px] tracking-widest">Cargando contenido...</p>
      </div>
    );
  }

  if (!curso || !inscripcion) {
    return (
      <div className="text-center py-20 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 max-w-2xl mx-auto">
        <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
           <Lock className="h-10 w-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Acceso Restringido</h2>
        <p className="text-muted-foreground font-medium mb-8">No hemos encontrado este curso en tus inscripciones activas.</p>
        <Button asChild className="rounded-2xl h-12 px-8 font-black uppercase text-xs">
          <Link href="/estudiante/mis-cursos">Ir a Mis Cursos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* Navigation & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" className="rounded-xl h-12 w-12 border-slate-200" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
             <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-primary/10 text-primary border-none font-black text-[10px] uppercase">{curso.nivel}</Badge>
                <div className="flex items-center text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-2">
                   <Clock className="h-3 w-3 mr-1" /> {curso.duracionEstimadaHoras}H ESTIMADAS
                </div>
             </div>
             <h1 className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{curso.titulo}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="outline" className="rounded-xl border-slate-200 font-bold h-12">
             <Share2 className="h-4 w-4 mr-2" /> Compartir
           </Button>
           <Button variant="outline" className="rounded-xl border-slate-200 font-bold h-12">
             <MessageSquare className="h-4 w-4 mr-2" /> Soporte
           </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Course Overview */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Hero Card */}
          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-slate-900 text-white group">
             <div className="grid md:grid-cols-5 h-full">
                <div className="md:col-span-2 relative aspect-video md:aspect-auto">
                   <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-transparent to-transparent z-10 hidden md:block" />
                   {curso.imagenDestacada ? (
                      <Image
                        src={curso.imagenDestacada}
                        alt={curso.titulo}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-1000"
                      />
                   ) : (
                      <div className="bg-slate-800 flex items-center justify-center h-full">
                         <BookOpen className="h-20 w-20 text-slate-700" />
                      </div>
                   )}
                </div>
                <div className="md:col-span-3 p-8 lg:p-10 flex flex-col justify-center">
                   <h2 className="text-2xl font-black mb-4 leading-tight">{curso.subtitulo || 'Domina esta habilidad hoy'}</h2>
                   <div className="space-y-6 mb-8">
                      <div className="flex justify-between items-end mb-1">
                         <span className="text-[10px] font-black uppercase text-white/50 tracking-widest">Progreso del curso</span>
                         <span className="text-2xl font-black text-primary">{inscripcion.progreso}%</span>
                      </div>
                      <Progress value={inscripcion.progreso} className="h-3 bg-white/10" />
                      <p className="text-xs font-bold text-white/60">Has completado {getLeccionesCompletadas()} de {getTotalLecciones()} lecciones.</p>
                   </div>
                   
                   <div className="flex flex-wrap gap-4">
                      {inscripcion.completado ? (
                        <Button onClick={descargarCertificado} className="bg-white text-slate-900 hover:bg-slate-100 h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">
                          <Award className="h-5 w-5 mr-3" /> Descargar Certificado
                        </Button>
                      ) : (
                        <Button onClick={inscripcion.progreso === 0 ? iniciarCurso : continuarCurso} className="bg-primary text-white hover:bg-primary/90 h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20">
                          <Play className="h-5 w-5 mr-3 fill-current" /> {inscripcion.progreso === 0 ? 'Comenzar ahora' : 'Continuar lección'}
                        </Button>
                      )}
                   </div>
                </div>
             </div>
          </Card>

          {/* New Tabbed interface for content and community */}
          <Tabs defaultValue="contenido" className="w-full" onValueChange={(val) => val === 'comunidad' && cargarComunidad()}>
            <TabsList className="bg-slate-100/50 p-1 rounded-2xl h-14 w-full md:w-fit mb-6 gap-2">
               <TabsTrigger value="contenido" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <BookOpen className="h-4 w-4 mr-2" /> Estructura
               </TabsTrigger>
               <TabsTrigger value="comunidad" className="rounded-xl px-8 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Users className="h-4 w-4 mr-2" /> Comunidad
               </TabsTrigger>
            </TabsList>

            <TabsContent value="contenido" className="mt-0 space-y-6">
               <Accordion type="multiple" className="space-y-4">
                  {curso.modulos.map((modulo, index) => (
                    <AccordionItem key={modulo.id} value={`modulo-${modulo.id}`} className="border-none bg-white rounded-3xl shadow-sm overflow-hidden px-6">
                      <AccordionTrigger className="hover:no-underline py-6 group">
                        <div className="flex items-center gap-5 text-left w-full">
                          <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center font-black text-slate-900 border border-slate-100 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="font-black text-slate-900 text-lg leading-tight group-hover:text-primary transition-colors">{modulo.titulo}</p>
                            <div className="flex items-center gap-3 mt-1.5 font-bold text-muted-foreground text-[10px] uppercase tracking-widest">
                               <span>{modulo.lecciones.length} lecciones</span>
                               <div className="w-1 h-1 bg-slate-200 rounded-full" />
                               <span className="text-emerald-600">{modulo.lecciones.filter(l => l.completada).length} completadas</span>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-6 pt-0">
                        <div className="space-y-2 mt-2">
                          {modulo.lecciones.map((leccion) => (
                            <Link
                              key={leccion.id}
                              href={`/estudiante/mis-cursos/${params.id}/leccion/${leccion.id}`}
                              className="group/item flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all"
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "h-9 w-9 rounded-xl flex items-center justify-center transition-colors",
                                  leccion.completada ? "bg-emerald-100" : "bg-slate-100 group-hover/item:bg-white"
                                )}>
                                  {leccion.completada ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                  ) : (
                                    <Play className="h-4 w-4 text-slate-400 group-hover/item:text-primary" />
                                  )}
                                </div>
                                <div>
                                  <p className={cn("font-black text-sm transition-colors", leccion.completada ? "text-emerald-700" : "text-slate-700 group-hover/item:text-slate-900")}>
                                    {leccion.titulo}
                                    {leccion.esGratuita && <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[8px] uppercase px-1.5 h-4 ml-2 align-middle">Teaser</Badge>}
                                  </p>
                                  {leccion.duracionMinutos && (
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mt-0.5">
                                      <Clock className="h-2.5 w-2.5" /> {leccion.duracionMinutos} min
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                  {leccion.tipoContenido === 'video' ? <Video className="h-4 w-4 text-slate-300" /> : <FileText className="h-4 w-4 text-slate-300" />}
                                  <ChevronRight className="h-4 w-4 text-slate-200 group-hover/item:translate-x-1 transition-transform" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
               </Accordion>
            </TabsContent>

            <TabsContent value="comunidad" className="mt-0 space-y-6">
               <Card className="border-none shadow-sm rounded-[2rem] p-8">
                  <div className="flex items-center gap-4 mb-6">
                     <Avatar className="h-12 w-12 border-2 border-primary/10">
                        <AvatarFallback className="bg-primary/5 text-primary font-black">
                           {curso.instructorNombre?.[0] || 'U'}
                        </AvatarFallback>
                     </Avatar>
                     <div className="flex-1">
                        <p className="text-xs font-black uppercase text-primary tracking-widest mb-1">Nueva Consulta</p>
                        <Textarea 
                          placeholder="Comparte tus dudas con la comunidad..." 
                          value={nuevoComentario}
                          onChange={(e) => setNuevoComentario(e.target.value)}
                          className="rounded-2xl border-slate-100 bg-slate-50 focus:bg-white min-h-[100px] p-4 text-sm font-medium"
                        />
                        {replyTo && (
                          <p className="text-[10px] font-black text-muted-foreground uppercase mt-2">
                             Respondiendo a un comentario <Button variant="link" className="h-auto p-0 text-[10px] font-black uppercase text-red-500" onClick={() => setReplyTo(null)}>Cancelar</Button>
                          </p>
                        )}
                        <div className="flex justify-end mt-4">
                           <Button 
                             onClick={handlePostComment} 
                             disabled={enviandoComentario || !nuevoComentario.trim()}
                             className="rounded-xl h-12 px-8 font-black uppercase text-xs tracking-widest"
                           >
                              {enviandoComentario ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                              Publicar
                           </Button>
                        </div>
                     </div>
                  </div>

                  <Separator className="mb-8" />

                  <div className="space-y-8">
                     {loadingComunidad ? (
                        <div className="text-center py-20">
                           <Loader2 className="h-10 w-10 animate-spin text-primary/20 mx-auto mb-4" />
                           <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Cargando discusiones...</p>
                        </div>
                     ) : comunidades.length === 0 ? (
                        <div className="text-center py-20 opacity-30">
                           <MessageSquare className="h-16 w-16 mx-auto mb-4" />
                           <p className="font-black uppercase text-xs tracking-widest">Aún no hay discusiones</p>
                           <p className="text-[10px] font-bold">Sé el primero en iniciar la conversación.</p>
                        </div>
                     ) : (
                        comunidades.map((thread) => (
                           <div key={thread.id} className="group/thread">
                              <div className="flex gap-4">
                                 <Avatar className="h-10 w-10">
                                    <AvatarFallback className="bg-slate-100 text-slate-600 font-bold">
                                       {thread.estudiante.primerNombre[0]}
                                    </AvatarFallback>
                                 </Avatar>
                                 <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="font-black text-sm text-slate-900">{thread.estudiante.primerNombre} {thread.estudiante.apellidoPaterno}</span>
                                       <span className="text-[10px] font-bold text-muted-foreground uppercase">{new Date(thread.fechaCreacion).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed mb-3">{thread.comentario}</p>
                                    <div className="flex items-center gap-6">
                                       <button className="flex items-center gap-1.5 text-[10px] font-black uppercase text-muted-foreground hover:text-primary transition-colors">
                                          <Heart className="h-3 w-3" /> {thread.votosPositivos || 0} Likes
                                       </button>
                                       <button 
                                         onClick={() => { setReplyTo(thread.id); window.scrollTo({ top: 500, behavior: 'smooth' }); }}
                                         className="flex items-center gap-1.5 text-[10px] font-black uppercase text-muted-foreground hover:text-primary transition-colors"
                                       >
                                          <Reply className="h-3 w-3" /> Responder
                                       </button>
                                    </div>

                                    {/* Nested Replies */}
                                    {thread.respuestas && thread.respuestas.length > 0 && (
                                       <div className="mt-6 space-y-6 pl-4 border-l-2 border-slate-50">
                                          {thread.respuestas.map((reply) => (
                                             <div key={reply.id} className="flex gap-3">
                                                <Avatar className="h-8 w-8">
                                                   <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-black">
                                                      {reply.estudiante.primerNombre[0]}
                                                   </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                   <div className="flex items-center gap-2 mb-1">
                                                      <span className="font-black text-xs text-slate-900">{reply.estudiante.primerNombre} {reply.estudiante.apellidoPaterno}</span>
                                                      <span className="text-[9px] font-bold text-muted-foreground uppercase">{new Date(reply.fechaCreacion).toLocaleDateString()}</span>
                                                   </div>
                                                   <p className="text-xs text-slate-600 leading-relaxed">{reply.comentario}</p>
                                                </div>
                                             </div>
                                          ))}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
               </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Instructor & Resources */}
        <div className="space-y-8">
           {/* Instructor Profile Card */}
           {curso.instructorNombre && (
             <Card className="border-none shadow-sm rounded-[2.5rem] p-8 bg-white relative overflow-hidden">
                <div className="absolute top-0 right-0 -m-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
                <h4 className="font-black text-[10px] uppercase text-muted-foreground tracking-[0.2em] mb-6 flex items-center gap-2">
                   <User className="h-4 w-4 text-primary" /> TU EXPERTO
                </h4>
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-24 h-24 rounded-3xl overflow-hidden mb-6 border-4 border-slate-50 shadow-xl">
                    {curso.instructorImagen ? (
                      <Image src={curso.instructorImagen} alt={curso.instructorNombre} fill className="object-cover" />
                    ) : (
                      <div className="bg-slate-100 flex items-center justify-center h-full">
                         <User className="h-10 w-10 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <h5 className="text-xl font-black text-slate-900 leading-tight mb-2">{curso.instructorNombre}</h5>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed italic">
                    "{curso.instructorBio || 'Experto internacional en marketing digital y automatización.'}"
                  </p>
                  <Button variant="outline" className="w-full mt-8 rounded-2xl border-slate-100 hover:bg-slate-50 h-12 font-bold transition-all">
                    Ver Perfil Completo
                  </Button>
                </div>
             </Card>
           )}

           {/* Resources Card */}
           <Card className="border-none shadow-sm rounded-[2.5rem] p-8 bg-white">
              <h4 className="font-black text-[10px] uppercase text-muted-foreground tracking-[0.2em] mb-6">RECURSOS EXCLUSIVOS</h4>
              <div className="space-y-4">
                 {[
                   { name: 'Guía PDF de bienvenida', icon: FileText, size: '2.4 MB' },
                   { name: 'Plantillas n8n Pro', icon: FileText, size: '156 KB' },
                   { name: 'Acceso a Comunidad V.I.P', icon: MessageSquare, size: 'Discord' }
                 ].map((res, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group cursor-pointer hover:bg-white hover:shadow-lg transition-all">
                       <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                             <res.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 leading-none mb-1 group-hover:text-primary transition-colors">{res.name}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">{res.size}</p>
                          </div>
                       </div>
                       <Download className="h-4 w-4 text-slate-300 group-hover:text-primary" />
                    </div>
                 ))}
              </div>
           </Card>

           {/* Quick Stats */}
           <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-600 rounded-[2rem] p-6 text-white text-center shadow-lg shadow-emerald-500/20">
                 <p className="text-[2rem] font-black leading-none mb-1">{getLeccionesCompletadas()}</p>
                 <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Lecciones completadas</p>
              </div>
              <div className="bg-indigo-600 rounded-[2rem] p-6 text-white text-center shadow-lg shadow-indigo-500/20">
                 <p className="text-[2rem] font-black leading-none mb-1">05</p>
                 <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-100">Días en racha</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
