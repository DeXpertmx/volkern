'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Activity
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWhitelabel } from '@/hooks/use-whitelabel'
import { HUBS, type NavigationItem } from '@/lib/navigation-config'
import { PunchClock } from '@/components/attendance/PunchClock'
import { ComplianceBadge } from '@/components/compliance/ComplianceBadge'

// Simple logger
const log = (...args: any[]) => {
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.log('[Sidebar]', ...args)
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession() || {}
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userPermissions, setUserPermissions] = useState<any>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [tenantCountry, setTenantCountry] = useState<string>('ES')
  const [activeModules, setActiveModules] = useState<string[]>([])
  const [isLoadingModules, setIsLoadingModules] = useState(true)
  const { config: whitelabelConfig } = useWhitelabel()

  useEffect(() => {
    setMounted(true)
    log('Sidebar mounted', pathname)
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved) setIsCollapsed(saved === 'true')
  }, [])

  useEffect(() => {
    if (session?.user) {
      setIsLoadingModules(true)
      const fetchModules = async () => {
        try {
          log('Fetching modules and permissions...')
          const [userRes, modulesRes] = await Promise.allSettled([
            fetch('/api/users/me'),
            fetch('/api/tenant/modules')
          ]);
          
          const userData = userRes.status === 'fulfilled' && userRes.value.ok ? await userRes.value.json() : null;
          const modulesData = modulesRes.status === 'fulfilled' && modulesRes.value.ok ? await modulesRes.value.json() : null;
          
          log('Fetch results:', { 
            userData: !!userData, 
            modulesData: !!modulesData,
            modulesCount: modulesData?.modules?.length || 0 
          })

          if (userData) {
            if (userData.role?.permisos) {
              log('Setting permissions')
              setUserPermissions(userData.role.permisos);
            }
            if (userData.tenant?.accountType) setUserAccountType(userData.tenant.accountType);
          }
          
          if (modulesData?.modules && modulesData.modules.length > 0) {
            log('Modules received and set:', modulesData.modules)
            setActiveModules(modulesData.modules);
          } else {
            log('No modules received from API, using fallback')
            // Fallback: If we can't get modules but we are in a session, maybe we should show all?
            const sessionModules = (session.user as any).activeModules || [];
            // Siempre asegurar que mi_tarjeta esté si no viene nada, es un módulo de perfil core
            const finalFallback = Array.from(new Set([...sessionModules, 'mi_tarjeta', 'configuracion']));
            log('Final fallback modules:', finalFallback)
            setActiveModules(finalFallback);
          }
          
          if (modulesData?.accountType) setUserAccountType(modulesData.accountType);
          if (modulesData?.country) setTenantCountry(modulesData.country);
        } catch (error) {
          console.error('Error loading permissions:', error);
          // Fallback en caso de excepción total
            const coreModules = [
              'mi_tarjeta', 'configuracion', 'leads', 'contactos', 'empresas', 
              'pipeline', 'tareas', 'analytics', 'mensajes', 'citas', 'catalogo',
              'campanas', 'email_marketing', 'cms', 'social_manager'
            ];
            setActiveModules(coreModules);
        } finally {
          setIsLoadingModules(false);
          log('Module loading finished')
        }
      };
      
      fetchModules();
    }
  }, [session])

  const isModuleVisible = (item: NavigationItem): boolean => {
    // 1. Filtro por Región (Tenant Country - obtenido de la API)
    if (item.requiredRegion && item.requiredRegion !== tenantCountry) return false

    // 2. Filtro por tipo de cuenta (AGENCY / BUSINESS)
    if (item.requiredAccountType) {
      const sessionAccountType = (session?.user as any)?.accountType;
      const effectiveAccountType = sessionAccountType || userAccountType;
      const roleName = (session?.user as any)?.roleName;
      if (item.requiredAccountType === 'SUPERADMIN') {
        if (roleName !== 'Superadmin' && roleName !== 'Admin') return false
      } else if (effectiveAccountType !== item.requiredAccountType) {
        if (roleName !== 'Superadmin' && roleName !== 'Admin') return false
      }
    }

    // 3. Filtro por Plan/Módulos Activos
    // Si estamos cargando y el item tiene planModule, mostrarlo (fallback a mostrar todo)
    // Si ya cargamos y no está en activeModules, ocultar
    if (item.planModule) {
      if (!isLoadingModules && !activeModules.includes(item.planModule)) return false
    }
    
    // 4. Filtro por Permisos de Rol
    if (item.module && userPermissions) {
      const modulePerms = userPermissions[item.module]
      if (modulePerms && modulePerms.ver === false) return false
    }
    return true
  }

  // Detect current active hub based on path
  const activeHub = HUBS.find(hub => 
    pathname === hub.href || 
    pathname.startsWith(hub.href + '/') ||
    hub.basePaths?.some(path => pathname === path || pathname.startsWith(path + '/'))
  )

  const toggleCollapsed = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed: newState } }))
  }

  const handleSignOut = async () => {
    console.log('handleSignOut called')
    try {
      await signOut({ callbackUrl: '/auth/login' })
      console.log('signOut completed')
    } catch (e) {
      console.error('signOut error:', e)
    }
  }

  // Contextual back button href
  const getBackHref = () => {
    if (!activeHub) return '/dashboard'
    if (pathname === activeHub.href) return '/dashboard'
    return activeHub.href
  }

  const getBackText = () => {
    if (!activeHub || pathname === activeHub.href) return 'VOLVER AL MENÚ'
    return `VOLVER A ${activeHub.name.toUpperCase()}`
  }

  if (!mounted) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden text-foreground"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside
        className={cn(
          "dashboard-sidebar fixed left-0 top-0 z-50 h-screen transform border-r bg-background/80 backdrop-blur-xl transition-all duration-300 ease-in-out md:translate-x-0 shadow-2xl",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isCollapsed ? "w-24" : "w-72"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Persistent Logo Header */}
          <div className="flex h-20 items-center justify-between border-b px-6">
            <Link href="/dashboard" className={cn("flex items-center", isCollapsed && "justify-center w-full")}>
              <div className="relative transition-transform duration-300 hover:scale-105">
                <Image
                  src={isCollapsed ? (whitelabelConfig.iconoUrl || '/volkern-icon.png') : (whitelabelConfig.logoUrl || '/volkern-logo.png')}
                  alt="Volkern"
                  width={isCollapsed ? 40 : 160}
                  height={40}
                  className="object-contain"
                  priority
                />
              </div>
            </Link>
          </div>
          

          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {/* Global Context or Hub Context */}
            {activeHub ? (
              <>
                {/* Hub Header & Back Button */}
                {!isCollapsed && (
                  <div className="px-2 py-4 mb-4 border-b border-border/50">
                    <Link href={getBackHref()} className="flex items-center text-xs font-bold text-primary hover:opacity-80 transition-opacity mb-4">
                      <ArrowLeft className="h-3 w-3 mr-1" />
                      {getBackText()}
                    </Link>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <activeHub.icon className="h-5 w-5" />
                      </div>
                      <h2 className="text-xl font-black uppercase tracking-tighter">{activeHub.name}</h2>
                    </div>
                  </div>
                )}
                {isCollapsed && (
                  <Link href={getBackHref()} className="flex justify-center mb-6">
                    <div className="p-2 rounded-full bg-primary text-white shadow-lg hover:rotate-12 transition-transform">
                      <ArrowLeft className="h-5 w-5" />
                    </div>
                  </Link>
                )}

                {/* Hub Specific Items */}
                {activeHub.items.filter(isModuleVisible).map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        "flex items-center rounded-xl transition-all duration-300 px-4 py-3 group",
                        isActive 
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold scale-[1.02]" 
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        isCollapsed ? "justify-center" : "space-x-4"
                      )}
                    >
                      <Icon className={cn("h-5 w-5 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-muted-foreground")} />
                      {!isCollapsed && <span className="text-sm tracking-tight">{item.name}</span>}
                    </Link>
                  )
                })}
              </>
            ) : (
              <>
                {/* Global Menu: Hubs Only */}
                {!isCollapsed && <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-4 mb-4">Módulos Principales</p>}
                
                <Link
                  href="/dashboard"
                  className={cn(
                    "flex items-center rounded-xl transition-all duration-300 px-4 py-3 mb-2",
                    pathname === '/dashboard' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold" : "text-muted-foreground hover:bg-accent",
                    isCollapsed ? "justify-center" : "space-x-4"
                  )}
                >
                  <LayoutDashboard className="h-5 w-5" />
                  {!isCollapsed && <span className="text-sm">Global Dashboard</span>}
                </Link>

                <div className="h-px bg-border/50 my-6 mx-4" />

                {HUBS.filter(hub => {
                  if (!hub.requiredAccountType) return true;
                  
                  const sessionAccountType = (session?.user as any)?.accountType;
                  const effectiveAccountType = sessionAccountType || userAccountType;
                  const roleName = (session?.user as any)?.roleName;

                  const reqAccountType = hub.requiredAccountType as string;
                  if (reqAccountType === 'SUPERADMIN') {
                    return roleName === 'Superadmin' || roleName === 'Admin';
                  }

                  // Mientras carga, permitir ver hubs si no hay accountType aún
                  if (isLoadingModules && !effectiveAccountType) {
                    return reqAccountType !== 'SUPERADMIN' || roleName === 'Superadmin' || roleName === 'Admin';
                  }

                  if (reqAccountType === 'AGENCY') {
                    const isAgencyAccount = effectiveAccountType === 'AGENCY';
                    const hasAgencyModule = activeModules.includes('agency');
                    return (isAgencyAccount && hasAgencyModule) || roleName === 'Superadmin';
                  }

                  if (reqAccountType === 'BUSINESS') {
                    const isBusiness = effectiveAccountType === 'BUSINESS' || effectiveAccountType === 'AGENCY' || roleName === 'Superadmin' || roleName === 'Admin' || roleName === 'Administrador';
                    if (!isBusiness) return false;
                    
                    // Si requiere un módulo específico, verificarlo
                    if (hub.requiredModule && !isLoadingModules && !activeModules.includes(hub.requiredModule)) {
                      return false;
                    }
                    return true;
                  }

                  // Si no requiere cuenta específica pero sí módulo
                  if (hub.requiredModule && !isLoadingModules && !activeModules.includes(hub.requiredModule)) {
                    return false;
                  }

                  return true;
                }).map((hub) => {
                  const HubIcon = hub.icon
                  return (
                    <Link
                      key={hub.id}
                      href={hub.href}
                      className={cn(
                        "flex items-center rounded-xl transition-all duration-300 px-4 py-4 group hover:bg-accent",
                        isCollapsed ? "justify-center" : "space-x-4"
                      )}
                    >
                      <div className={cn(
                        "p-2.5 rounded-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner",
                        "bg-background border border-border group-hover:border-primary/30 group-hover:bg-primary/5"
                      )}>
                        <HubIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      {!isCollapsed && (
                        <div className="flex flex-col">
                          <span className="text-sm font-bold tracking-tight">{hub.name}</span>
                          <span className="text-[10px] text-muted-foreground line-clamp-1">{hub.description}</span>
                        </div>
                      )}
                    </Link>
                  )
                })}
              </>
            )}
          </nav>

          {/* ⌚ VISION-LOCK ATTENDANCE (Punch Clock) */}
          <div className="px-4 py-4 border-t border-dashed bg-accent/5 space-y-3">
            <ComplianceBadge isCollapsed={isCollapsed} />
            <PunchClock isCollapsed={isCollapsed} />
          </div>

          {/* Premium Footer */}
          <div className="border-t bg-accent/5 p-6">
            {/* Global Quick Access: Connect Hub */}
            <div className="mb-4">
              <Link 
                href="/dashboard/connect"
                className={cn(
                  "flex items-center gap-3 p-3 rounded-2xl transition-all group",
                  "bg-primary/10 border border-primary/20 hover:bg-primary/20",
                  isCollapsed && "justify-center"
                )}
              >
                <div className="relative">
                  <Activity className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full animate-pulse" />
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-tighter text-primary">Volkern Connect</span>
                    <span className="text-[10px] font-bold text-primary/60">HUB EN VIVO</span>
                  </div>
                )}
              </Link>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                className="hidden md:flex h-10 w-10 rounded-xl border hover:bg-background"
              >
                {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "flex-1 h-10 rounded-xl border border-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all",
                  isCollapsed ? "px-0" : "px-4 justify-start"
                )}
                onClick={handleSignOut}
              >
                <LogOut className="h-5 w-5" />
                {!isCollapsed && <span className="ml-2 font-bold text-xs uppercase tracking-wider">Salir</span>}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}