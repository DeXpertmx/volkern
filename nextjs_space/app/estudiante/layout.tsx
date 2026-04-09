
'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  BookOpen, 
  LayoutDashboard, 
  Award, 
  User, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  ShieldCheck,
  Bell,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { signOut, useSession } from 'next-auth/react';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { PushPrompt } from '@/components/notifications/PushPrompt';

interface StudentLayoutProps {
  children: ReactNode;
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [estudiante, setEstudiante] = useState<any>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/estudiantes/perfil')
        .then(res => res.json())
        .then(data => setEstudiante(data))
        .catch(err => console.error('Error fetching student profile:', err));
    }
  }, [status]);

  const navigation = [
    { name: 'Dashboard', href: '/estudiante/mis-cursos', icon: LayoutDashboard },
    { name: 'Certificados', href: '/estudiante/certificados', icon: Award },
    { name: 'Mi Perfil', href: '/estudiante/perfil', icon: User },
    { name: 'Configuración', href: '/estudiante/configuracion', icon: Settings },
  ];

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-black">V</div>
          <span className="font-black text-xl tracking-tighter">VOLKERN <span className="text-primary tracking-normal font-medium text-xs ml-1 uppercase">Student</span></span>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleMobileMenu}>
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      {/* Sidebar (Desktop & Mobile) */}
      <aside className={cn(
        "fixed lg:static inset-0 z-40 lg:z-auto transition-transform duration-300 ease-in-out lg:translate-x-0 bg-white border-r w-72 flex flex-col shrink-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Sidebar Header */}
        <div className="p-8 hidden lg:block">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/20">V</div>
             <div className="flex flex-col">
               <span className="font-black text-xl tracking-tighter leading-none">VOLKERN</span>
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Academy Portal</span>
             </div>
          </div>
        </div>

        {/* User Card */}
        <div className="px-6 pb-6 pt-10 lg:pt-0">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors" />
            <div className="flex items-center gap-3 relative z-10">
              <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                <AvatarImage src={session?.user?.image || ''} />
                <AvatarFallback className="bg-primary text-white font-bold">{estudiante?.primerNombre?.[0] || session?.user?.name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">
                  {estudiante?.primerNombre ? `${estudiante.primerNombre} ${estudiante.apellidoPaterno || ''}` : session?.user?.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                   <p className="text-[10px] font-bold text-muted-foreground uppercase">{estudiante?.tipoAcceso || 'Estudiante'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1">
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-4 mb-4 mt-4">Menu Principal</div>
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group",
                  isActive 
                    ? "bg-primary text-white shadow-lg shadow-primary/25" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-primary"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-slate-400 group-hover:text-primary")} />
                {item.name}
                {isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 mt-auto border-t space-y-2">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 font-bold rounded-xl"
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
          >
            <LogOut className="h-5 w-5 mr-3" />
            Cerrar Sesión
          </Button>
          <div className="flex items-center justify-center p-4 bg-muted/30 rounded-xl mt-4">
             <ShieldCheck className="h-3 w-3 text-muted-foreground mr-2" />
             <span className="text-[10px] font-bold text-muted-foreground uppercase">Plataforma Segura</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="hidden lg:flex bg-white h-20 items-center justify-between px-8 border-b sticky top-0 z-30">
           <div className="flex items-center gap-4">
             <h2 className="text-xl font-black text-slate-800 tracking-tight">
               {pathname.includes('mis-cursos') ? 'Mi Aula Virtual' : 
                pathname.includes('perfil') ? 'Mi Perfil' : 
                pathname.includes('certificados') ? 'Mis Logros' : 'Portal Estudiante'}
             </h2>
           </div>
           <div className="flex items-center gap-4">
              <NotificationCenter />
              <div className="h-8 w-[1px] bg-slate-200 mx-2" />
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-slate-900 leading-none">
                  {estudiante?.pais || 'País no definido'}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">
                  {estudiante?.zonaHoraria || 'UTC'}
                </p>
              </div>
           </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-8">
           <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
             {children}
           </div>
        </div>
        <PushPrompt />
      </main>
    </div>
  );
}
