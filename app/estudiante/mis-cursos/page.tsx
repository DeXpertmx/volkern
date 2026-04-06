'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  BookOpen, Play, Clock, Award, Search, 
  CheckCircle2, TrendingUp, Calendar, 
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

interface Inscripcion {
  id: string;
  fechaInscripcion: string;
  ultimoAcceso: string | null;
  progreso: number;
  completado: boolean;
  curso: {
    id: string;
    titulo: string;
    subtitulo: string | null;
    descripcion: string | null;
    imagenDestacada: string | null;
    nivel: string;
    duracionEstimadaHoras: number | null;
    instructorNombre: string | null;
    _count: {
      modulos: number;
    };
    modulos: Array<{
      lecciones: Array<{ id: string }>;
    }>;
  };
}

export default function MisCursosPage() {
  const { data: session, status } = useSession() || {};
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [estudiante, setEstudiante] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('todos');

  useEffect(() => {
    if (status === 'authenticated') {
      cargarMisCursos();
      cargarPerfil();
    }
  }, [status]);

  const cargarPerfil = async () => {
    try {
      const res = await fetch('/api/estudiantes/perfil');
      if (res.ok) {
        const data = await res.json();
        setEstudiante(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const cargarMisCursos = async () => {
    try {
      const response = await fetch('/api/inscripciones/mis-cursos');
      if (response.ok) {
        const data = await response.json();
        setInscripciones(data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTotalLecciones = (curso: Inscripcion['curso']) => {
    return curso.modulos.reduce((acc, mod) => acc + mod.lecciones.length, 0);
  };

  const cursosActivos = inscripciones.filter((i) => !i.completado);
  const cursosCompletados = inscripciones.filter((i) => i.completado);

  const cursosFiltrados = inscripciones.filter((inscripcion) => {
    const matchesSearch = inscripcion.curso.titulo
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    if (filterTab === 'todos') return matchesSearch;
    if (filterTab === 'en-progreso') return matchesSearch && !inscripcion.completado && inscripcion.progreso > 0;
    if (filterTab === 'nuevos') return matchesSearch && inscripcion.progreso === 0;
    if (filterTab === 'completados') return matchesSearch && inscripcion.completado;
    
    return matchesSearch;
  });

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="text-muted-foreground animate-pulse font-bold uppercase text-[10px] tracking-widest">Preparando tu aula virtual...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* Welcome Hero Section */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 border border-white/10 shadow-2xl p-8 lg:p-12 mb-8">
        <div className="absolute top-0 right-0 -m-12 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -m-12 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1 text-center md:text-left">
            <Badge className="bg-primary/20 text-primary border-primary/20 hover:bg-primary/30 mb-6 px-4 py-1 rounded-full font-black text-xs uppercase tracking-widest">
               Academia Volkern
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-black text-white tracking-tighter leading-tight mb-4">
               ¡Hola de nuevo, <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">{estudiante?.primerNombre || session?.user?.name?.split(' ')[0]}</span>!
            </h1>
            <p className="text-slate-400 text-lg lg:text-xl font-medium max-w-xl leading-relaxed mb-8">
               Tu camino hacia el éxito digital continúa. Tienes <span className="text-white font-black">{cursosActivos.length} cursos</span> activos por terminar hoy.
            </p>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
               {cursosActivos.length > 0 && (
                  <Button size="lg" asChild className="bg-white text-slate-900 hover:bg-slate-100 font-black rounded-2xl h-14 px-8 shadow-xl hover:scale-105 transition-all">
                    <Link href={`/estudiante/mis-cursos/${cursosActivos[0].curso.id}`}>
                      Continuar Aprendiendo
                    </Link>
                  </Button>
               )}
               <Button variant="outline" size="lg" className="border-white/10 text-white hover:bg-white/5 font-bold rounded-2xl h-14 px-8 backdrop-blur-sm">
                 Explorar Catálogo
               </Button>
            </div>
          </div>
          
          <div className="hidden lg:flex flex-col gap-4">
             <Card className="bg-white/5 border-white/10 backdrop-blur-md p-6 rounded-3xl min-w-[240px]">
                <div className="flex items-center gap-3 mb-4">
                   <div className="p-2 bg-emerald-500/20 rounded-xl">
                      <TrendingUp className="h-5 w-5 text-emerald-400" />
                   </div>
                   <span className="text-xs font-black text-white uppercase">Salud Académica</span>
                </div>
                <p className="text-3xl font-black text-white mb-1">
                   {inscripciones.length > 0
                     ? Math.round(
                         inscripciones.reduce((acc, i) => acc + i.progreso, 0) / inscripciones.length
                       )
                     : 0}%
                </p>
                <Progress value={inscripciones.reduce((acc, i) => acc + i.progreso, 0) / (inscripciones.length || 1)} className="h-2 bg-white/10" />
             </Card>
          </div>
        </div>
      </section>

      {/* Stats Summary Grid */}
      <div className="grid gap-6 md:grid-cols-4">
        {[
          { label: 'Cursos Activos', value: cursosActivos.length, icon: Play, color: 'blue' },
          { label: 'Completados', value: cursosCompletados.length, icon: Award, color: 'emerald' },
          { label: 'Horas Totales', value: inscripciones.reduce((acc, i) => acc + (i.curso.duracionEstimadaHoras || 0), 0), icon: Clock, color: 'orange' },
          { label: 'Certificados', value: estudiante?._count?.certificados || 0, icon: CheckCircle2, color: 'purple' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm p-6 overflow-hidden relative group hover:bg-white transition-colors">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-12 -mt-12 bg-${stat.color}-500/5 rounded-full group-hover:bg-${stat.color}-500/10 transition-colors`} />
            <div className={cn("p-3 w-fit rounded-2xl mb-4", {
              "bg-blue-500/10": stat.color === 'blue',
              "bg-emerald-500/10": stat.color === 'emerald',
              "bg-orange-500/10": stat.color === 'orange',
              "bg-purple-500/10": stat.color === 'purple',
            })}>
               <stat.icon className={cn("h-6 w-6", {
                 "text-blue-600": stat.color === 'blue',
                 "text-emerald-600": stat.color === 'emerald',
                 "text-orange-600": stat.color === 'orange',
                 "text-purple-600": stat.color === 'purple',
               })} />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
            <p className="text-3xl font-black mt-1 text-slate-900">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 w-full space-y-8">
           {/* Section Title & Search */}
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                 <h2 className="text-2xl font-black text-slate-900 tracking-tight">Mis Cursos</h2>
                 <p className="text-sm text-muted-foreground font-medium">Gestiona tu progreso académico</p>
              </div>
              
              <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100 min-w-[300px]">
                 <Search className="h-5 w-5 text-slate-400 ml-2" />
                 <Input
                    placeholder="Buscar curso por título..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-none bg-transparent focus-visible:ring-0 text-sm font-bold placeholder:text-slate-400 shadow-none ring-0 focus:ring-0"
                 />
              </div>
           </div>

           {/* Tabs and Categories */}
           <Tabs value={filterTab} onValueChange={setFilterTab} className="w-full">
              <TabsList className="bg-slate-100 p-1.5 rounded-2xl h-14 w-full md:w-fit mb-8 gap-2">
                 <TabsTrigger value="todos" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">Todos</TabsTrigger>
                 <TabsTrigger value="en-progreso" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">En Progreso</TabsTrigger>
                 <TabsTrigger value="nuevos" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">Nuevos</TabsTrigger>
                 <TabsTrigger value="completados" className="rounded-xl px-6 font-black text-xs uppercase tracking-widest h-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">Completados</TabsTrigger>
              </TabsList>

              <TabsContent value={filterTab} className="mt-0 ring-offset-background border-none outline-none">
                 {cursosFiltrados.length === 0 ? (
                    <Card className="border-none shadow-sm py-20 text-center bg-white rounded-[2.5rem]">
                       <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                          <BookOpen className="h-10 w-10 text-slate-300" />
                       </div>
                       <h3 className="text-xl font-black text-slate-900 mb-2">
                          {searchTerm ? 'Ups, no encontramos ese curso' : 'Aún no tienes cursos en esta categoría'}
                       </h3>
                       <p className="text-muted-foreground font-medium max-w-sm mx-auto">
                          {searchTerm ? 'Prueba con otra palabra clave o explora el catálogo completo.' : 'Explora nuevos temas y comienza tu viaje hoy mismo.'}
                       </p>
                       <Button className="mt-8 rounded-2xl font-black px-8 h-12">Explorar Academia</Button>
                    </Card>
                 ) : (
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                       {cursosFiltrados.map((inscripcion) => (
                          <Card key={inscripcion.id} className="group border-none shadow-sm rounded-[2rem] overflow-hidden bg-white hover:shadow-2xl hover:shadow-primary/5 transition-all hover:-translate-y-1">
                             <Link href={`/estudiante/mis-cursos/${inscripcion.curso.id}`}>
                                <div className="relative aspect-[16/10] overflow-hidden">
                                   <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent z-10" />
                                   {inscripcion.curso.imagenDestacada ? (
                                      <Image
                                         src={inscripcion.curso.imagenDestacada}
                                         alt={inscripcion.curso.titulo}
                                         fill
                                         className="object-cover group-hover:scale-110 transition-transform duration-700"
                                      />
                                   ) : (
                                      <div className="bg-slate-100 flex items-center justify-center h-full">
                                         <BookOpen className="h-16 w-16 text-slate-200" />
                                      </div>
                                   )}
                                   
                                   <div className="absolute top-4 left-4 z-20 flex gap-2">
                                      <Badge className="bg-white/20 backdrop-blur-md text-white border-white/20 font-black text-[10px] uppercase">
                                         {inscripcion.curso.nivel}
                                      </Badge>
                                      {inscripcion.completado && (
                                         <Badge className="bg-emerald-500 text-white border-none font-black text-[10px] uppercase">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Completado
                                         </Badge>
                                      )}
                                   </div>

                                   <div className="absolute bottom-4 left-4 right-4 z-20">
                                      <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">{inscripcion.curso.instructorNombre || 'Instructor Volkern'}</p>
                                      <h4 className="text-white text-xl font-black leading-tight line-clamp-2">{inscripcion.curso.titulo}</h4>
                                   </div>
                                </div>
                             </Link>
                             
                             <CardContent className="p-6">
                                <div className="space-y-6">
                                   <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-muted-foreground">
                                      <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5" /> {inscripcion.curso._count.modulos} Módulos</span>
                                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {inscripcion.curso.duracionEstimadaHoras}h</span>
                                   </div>

                                   <div className="space-y-3">
                                      <div className="flex justify-between items-end">
                                         <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Progreso actual</span>
                                         <span className="text-lg font-black text-slate-900">{inscripcion.progreso}%</span>
                                      </div>
                                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                         <div 
                                            className={cn(
                                              "h-full transition-all duration-500",
                                              inscripcion.completado ? "bg-emerald-500" : "bg-primary"
                                            )}
                                            style={{ width: `${inscripcion.progreso}%` }}
                                         />
                                      </div>
                                   </div>

                                   <Link href={`/estudiante/mis-cursos/${inscripcion.curso.id}`}>
                                      <Button className={cn(
                                         "w-full h-14 rounded-2xl font-black text-xs uppercase tracking-widest group/btn shadow-lg transition-all",
                                         inscripcion.completado 
                                           ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-emerald-500/10 border-none" 
                                           : "bg-slate-900 text-white hover:bg-black shadow-slate-900/10"
                                      )}>
                                         {inscripcion.progreso === 0 ? (
                                            <>Comenzar ahora <ChevronRight className="h-4 w-4 ml-2 group-hover/btn:translate-x-1 transition-transform" /></>
                                         ) : inscripcion.completado ? (
                                            <>Ver Certificado <Award className="h-4 w-4 ml-2" /></>
                                         ) : (
                                            <>Continuar lección <Play className="h-4 w-4 ml-2 fill-current" /></>
                                         )}
                                      </Button>
                                   </Link>
                                </div>
                             </CardContent>
                          </Card>
                       ))}
                    </div>
                 )}
              </TabsContent>
           </Tabs>
        </div>

        {/* Sidebar/Achievements Widget */}
        <div className="w-full lg:w-[350px] space-y-8 sticky top-28">
           <Card className="border-none shadow-sm rounded-[2rem] p-8 bg-gradient-to-br from-indigo-600 to-primary text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 -m-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative z-10">
                 <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                    <Award className="h-6 w-6 text-white" />
                 </div>
                 <h3 className="text-2xl font-black mb-2 tracking-tight">Tu Certificación</h3>
                 <p className="text-indigo-100 text-sm font-medium mb-8 leading-relaxed">
                    Has desbloqueado <span className="text-white font-black">{cursosCompletados.length} certificados</span> oficiales. Sigue así para subir de nivel.
                 </p>
                 <Button className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-black rounded-xl h-12">
                   Ver Mis Logros
                 </Button>
              </div>
           </Card>

           <Card className="border-none shadow-sm rounded-[2rem] p-6 bg-white">
              <h4 className="font-black text-slate-800 uppercase text-[10px] tracking-widest mb-6 flex items-center gap-2">
                 <Calendar className="h-4 w-4 text-primary" /> Próximos Eventos
              </h4>
              <div className="space-y-6">
                 {[1, 2].map((i) => (
                    <div key={i} className="flex gap-4 group cursor-pointer">
                       <div className="flex flex-col items-center justify-center w-12 h-14 bg-slate-50 rounded-2xl border border-slate-100 group-hover:bg-primary/5 group-hover:border-primary/20 transition-colors">
                          <span className="text-[10px] font-black text-muted-foreground uppercase leading-none mb-1">Abr</span>
                          <span className="text-lg font-black text-slate-900 leading-none">0{i+4}</span>
                       </div>
                       <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors truncate">Live mentoring Q&A</h5>
                          <p className="text-[10px] font-bold text-muted-foreground mt-1">10:00 AM - Online</p>
                       </div>
                    </div>
                 ))}
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}
