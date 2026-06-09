import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Search, ChevronRight, Globe, Shield, UserCog, Sun, Moon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useWhitelabel } from '@/hooks/use-whitelabel';
import { useTheme } from 'next-themes';

export function DashboardHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { config: whitelabelConfig } = useWhitelabel();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [impersonation, setImpersonation] = useState<{ active: boolean, tenant?: { nombre: string } } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    // Verificar si hay suplantación activa para ajustar la UI
    const checkImpersonation = async () => {
      try {
        const res = await fetch('/api/admin/impersonate');
        if (res.ok) {
          const data = await res.json();
          setImpersonation(data);
        }
      } catch (e) {
        console.error('Error checking impersonation for header:', e);
      }
    };
    checkImpersonation();
  }, []);

  const getPageTitle = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0 || (parts[0] === 'dashboard' && parts.length === 1)) return 'General';
    const lastPart = parts[parts.length - 1];
    // Formatear el nombre de la página (ej: leads -> Leads)
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/-/g, ' ');
  };

  const isImpersonating = impersonation?.active;
  const tenantName = impersonation?.tenant?.nombre;

  if (!mounted) return null;

  return (
    <header className="sticky top-0 z-[40] w-full border-b bg-white/60 dark:bg-slate-950/80 backdrop-blur-xl border-slate-200/60 dark:border-slate-800/60 shadow-sm shadow-slate-200/5 dark:shadow-slate-900/20">
      <div className="flex h-16 items-center justify-between px-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className={cn(
               "h-9 w-9 rounded-xl flex items-center justify-center border transition-colors",
               isImpersonating 
                ? "bg-amber-500/10 border-amber-500/20 shadow-inner" 
                : "bg-primary/5 border-primary/10"
             )}>
                {isImpersonating ? (
                  <UserCog className="h-4 w-4 text-amber-600" />
                ) : (
                  <Shield className="h-4 w-4 text-primary" />
                )}
             </div>
             <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
               {isImpersonating ? (
                 <span className="text-amber-600 font-bold">MODO SOPORTE</span>
               ) : (
                 whitelabelConfig?.nombreEmpresa || 'Volkern'
               )} 
               <span className="text-slate-300 dark:text-slate-600">/</span> 
               <span className="text-slate-400 dark:text-slate-500 tracking-widest">{getPageTitle()}</span>
             </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-primary transition-all duration-300" />
            <Input
              id="global-search"
              aria-label="Buscar recursos"
              placeholder="Buscar recursos..." 
              className="pl-9 w-[280px] h-10 bg-slate-50/50 dark:bg-slate-900/50 border-slate-100/50 dark:border-slate-700/50 rounded-2xl text-[11px] font-bold uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-primary/5 transition-all focus:w-[350px] focus:bg-white dark:focus:bg-slate-900"
            />
          </div>

          <div className="h-8 w-[1px] bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* Notificaciones */}
          <NotificationCenter />

          <div className="h-8 w-[1px] bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Cambiar tema"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-500" />
            )}
          </button>

          <div className="h-8 w-[1px] bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* Perfil de Usuario */}
          <div className={cn(
            "flex items-center gap-4 group cursor-pointer p-1 pr-3 rounded-2xl transition-all duration-300",
            isImpersonating ? "hover:bg-amber-50 dark:hover:bg-amber-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"
          )}>
            <div className="text-right hidden md:block">
              <p className={cn(
                "text-[11px] font-black leading-none uppercase tracking-tighter",
                isImpersonating ? "text-amber-700 dark:text-amber-400" : "text-slate-900 dark:text-slate-200"
              )}>
                {isImpersonating ? `SOPORTE (${tenantName})` : session?.user?.name || 'Admin'}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                 <div className={cn(
                   "h-1 w-1 rounded-full animate-pulse",
                   isImpersonating ? "bg-amber-500" : "bg-green-500"
                 )} />
                 <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">
                   {isImpersonating ? 'SUPLANTANDO' : session?.user?.role || 'Administrador'}
                 </p>
              </div>
            </div>
            <Avatar className={cn(
              "h-10 w-10 border-[3px] shadow-xl transition-transform duration-300 group-hover:scale-105",
              isImpersonating ? "border-amber-100 dark:border-amber-900/50 shadow-amber-200/50 dark:shadow-amber-900/30" : "border-white dark:border-slate-700 shadow-slate-200/50 dark:shadow-slate-900/50"
            )}>
              <AvatarImage src={session?.user?.image || ''} />
              <AvatarFallback className={cn(
                "text-white text-[11px] font-black uppercase",
                isImpersonating ? "bg-amber-500" : "bg-gradient-to-br from-primary to-blue-600"
              )}>
                {isImpersonating ? 'S' : session?.user?.name?.[0] || 'A'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  );
}
