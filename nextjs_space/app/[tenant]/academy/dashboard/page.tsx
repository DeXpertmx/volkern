'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  GraduationCap, 
  BookOpen, 
  Award, 
  BarChart3, 
  Clock, 
  ChevronRight,
  Search,
  Filter,
  LogOut,
  Bell,
  PlayCircle,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

export default function AcademyDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/academy/auth/me');
        const { session } = await response.json();
        
        // Cargar perfil real del estudiante
        const profileRes = await fetch('/api/estudiantes/perfil');
        if (profileRes.ok) {
          const studentData = await profileRes.json();
          setUser({
            ...studentData,
            firstName: studentData.primerNombre || studentData.nombre.split(' ')[0],
            lastName: studentData.apellidoPaterno || '',
            role: session.role,
            progress: studentData.progresoGlobal || 0,
            certificates: studentData._count?.certificados || 0
          });
        } else {
          setUser({
            firstName: 'Estudiante',
            lastName: 'Operativo',
            role: session.role,
            progress: 0,
            certificates: 0
          });
        }
      } catch (error) {
        router.push('/academy/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/academy/auth/logout', { method: 'POST' });
    toast.success('Sesión cerrada');
    router.push('/academy/login');
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center animate-bounce">
          <GraduationCap className="w-10 h-10 text-white" />
        </div>
        <p className="text-slate-500 font-bold tracking-widest uppercase text-xs">Abriendo Aula...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 z-50 px-8 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="font-black text-xl tracking-tight italic">VOLKERN <span className="text-emerald-600 not-italic font-bold text-sm">ACADEMIA</span></span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <NavLink label="Mis Cursos" active />
            <NavLink label="Catálogo" />
            <NavLink label="Certificados" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100">
            <Search className="w-5 h-5 text-slate-500" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100 relative">
            <Bell className="w-5 h-5 text-slate-500" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </Button>
          <div className="h-8 w-[1px] bg-slate-200 mx-2" />
          <Button variant="ghost" className="flex items-center gap-2 px-2 hover:bg-slate-100 rounded-xl" onClick={handleLogout}>
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold">EO</div>
            <LogOut className="w-4 h-4 text-slate-400" />
          </Button>
        </div>
      </nav>

      {/* Hero Header */}
      <main className="pt-32 pb-20 px-8 max-w-7xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none px-3 py-1 mb-4 font-bold text-[10px] uppercase tracking-wider">
              Academia de Operaciones
            </Badge>
            <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-2">
              ¡Hola, {user?.firstName || 'Estudiante'}!
            </h1>
            <p className="text-slate-500 font-medium text-lg">Tienes 2 certificaciones próximas a vencer. <span className="text-emerald-600 font-bold cursor-pointer underline underline-offset-4">Renovar ahora</span></p>
          </div>

          <div className="flex gap-4">
            <StatCard icon={<Clock />} label="Tiempo de Estudio" value="12h 45m" />
            <StatCard icon={<Award />} label="Certificados" value={(user?.certificates || 0).toString()} />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Learning Column */}
          <div className="lg:col-span-2 space-y-10">
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Cursos en Progreso</h2>
                <Button variant="link" className="text-emerald-600 font-bold">Ver todos</Button>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {user?.inscripciones && user.inscripciones.length > 0 ? (
                  user.inscripciones.map((insc: any) => (
                    <CourseProgressCard 
                      key={insc.id}
                      title={insc.curso.titulo} 
                      instructor={insc.curso.instructorNombre || "Instructor Volkern"}
                      progress={insc.progresoPorcentaje}
                      image={insc.curso.imagenDestacada || "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800"}
                      nextLesson={insc.ultimaLeccionId ? "Continuar donde lo dejaste" : "Comenzar primera lección"}
                    />
                  ))
                ) : (
                  <Card className="p-12 text-center border-dashed border-2 border-slate-100 rounded-[2rem]">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BookOpen className="w-8 h-8 text-slate-200" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900">Aún no tienes cursos</h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">Explora el catálogo para comenzar tu aprendizaje.</p>
                    <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold">Explorar Catálogo</Button>
                  </Card>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6">Recomendado para tu Rol</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CourseGridCard 
                  title="Gestión de Inventarios en Tiempo Real"
                  category="Logística"
                  duration="4h"
                  level="Intermedio"
                />
                <CourseGridCard 
                  title="Control de Calidad ISO 9001"
                  category="Calidad"
                  duration="6h"
                  level="Avanzado"
                />
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl shadow-slate-200/50 bg-slate-900 text-white p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Award className="w-32 h-32" />
              </div>
              <h3 className="text-xl font-black mb-4">Siguiente Meta</h3>
              <div className="p-4 bg-white/5 rounded-2xl mb-6">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Certificación</p>
                <p className="text-sm font-bold">Operador de Línea Senior</p>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Progreso de Ruta</span>
                  <span>85%</span>
                </div>
                <Progress value={85} className="h-2 bg-white/10" />
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 rounded-xl">
                Continuar Ruta
              </Button>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl shadow-slate-200/50 bg-white p-8">
              <h3 className="text-lg font-black text-slate-900 mb-6">Actividad Reciente</h3>
              <div className="space-y-6">
                <ActivityItem 
                  icon={<CheckCircle2 className="text-emerald-500" />} 
                  label="Completaste Lección" 
                  time="Hace 2 horas"
                  desc="EPP y Seguridad Laboral"
                />
                <ActivityItem 
                  icon={<PlayCircle className="text-blue-500" />} 
                  label="Iniciaste Curso" 
                  time="Ayer"
                  desc="Mantenimiento Preventivo"
                />
                <ActivityItem 
                  icon={<AlertCircle className="text-amber-500" />} 
                  label="Examen Pendiente" 
                  time="15 Abr"
                  desc="Certificación de Calidad"
                />
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavLink({ label, active = false }: { label: string, active?: boolean }) {
  return (
    <div className={`cursor-pointer font-bold text-sm transition-all relative py-2 ${active ? 'text-emerald-600' : 'text-slate-500 hover:text-emerald-600'}`}>
      {label}
      {active && <motion.div layoutId="nav" className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-600" />}
    </div>
  );
}

function StatCard({ icon, label, value }: any) {
  return (
    <div className="flex items-center gap-4 bg-white p-4 px-6 rounded-2xl shadow-sm border border-slate-50">
      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-xl font-black text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function CourseProgressCard({ title, instructor, progress, image, nextLesson }: any) {
  return (
    <Card className="rounded-[2rem] border-none shadow-lg shadow-slate-200/40 bg-white overflow-hidden flex flex-col md:flex-row group cursor-pointer hover:shadow-xl transition-all border border-transparent hover:border-slate-100">
      <div className="w-full md:w-48 h-48 relative overflow-hidden">
        <img src={image} alt={title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
      </div>
      <div className="flex-1 p-6 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xl font-black text-slate-900 leading-tight">{title}</h3>
            <Badge variant="outline" className="text-xs font-bold text-slate-400 border-slate-200">{progress}%</Badge>
          </div>
          <p className="text-sm text-slate-500 font-medium mb-4">Instructor: {instructor}</p>
          <Progress value={progress} className="h-2 bg-slate-100" />
        </div>
        <div className="flex items-center justify-between mt-6 bg-slate-50 rounded-xl p-3 px-4">
          <div className="flex items-center gap-3">
            <PlayCircle className="w-4 h-4 text-emerald-600" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Siguiente lección</p>
              <p className="text-xs font-black text-slate-700 truncate max-w-[150px]">{nextLesson}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </Card>
  );
}

function CourseGridCard({ title, category, duration, level }: any) {
  return (
    <Card className="rounded-[2rem] border-none shadow-md bg-white p-6 cursor-pointer hover:shadow-lg transition-all border border-transparent hover:border-emerald-100 group">
      <div className="flex justify-between items-start mb-4">
        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider">{category}</Badge>
        <BookOpen className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors" />
      </div>
      <h3 className="text-lg font-black text-slate-900 leading-tight mb-6 group-hover:text-emerald-600 transition-colors">{title}</h3>
      <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {duration}
        </div>
        <div className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> {level}
        </div>
      </div>
    </Card>
  );
}

function ActivityItem({ icon, label, time, desc }: any) {
  return (
    <div className="flex gap-4">
      <div className="mt-1">{icon}</div>
      <div>
        <p className="text-sm font-black text-slate-900">{label}</p>
        <p className="text-xs text-slate-500 mb-1">{desc}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{time}</p>
      </div>
    </div>
  );
}
