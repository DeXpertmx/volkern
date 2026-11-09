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
  Activity,
  AlertTriangle
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useWhitelabel } from '@/hooks/use-whitelabel'
import { HUBS } from '@/lib/navigation-config'
import {
  hubEsVisible,
  itemEsVisible,
  type VisibilityContext,
} from '@/lib/navigation-visibility'
import { PunchClock } from '@/components/attendance/PunchClock'
import { ComplianceBadge } from '@/components/compliance/ComplianceBadge'
import { Badge } from '@/components/ui/badge'
import { useUndeliverableNotifications } from '@/hooks/use-undeliverable-notifications'
import { useContractSignatureNotifications } from '@/hooks/use-contract-signature-notifications'

// Simple logger
const log = (...args: any[]) => {
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    console.log('[Sidebar]', ...args)
  }
}

/**
 * `ocultarBotonMovil` retira el botón de hamburguesa en móvil: lo usa el módulo
 * inmobiliario, que navega con su propia barra inferior.
 */
export function Sidebar({ ocultarBotonMovil = false }: { ocultarBotonMovil?: boolean }) {
  const pathname = usePathname()
  const { data: session } = useSession() || {}
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userPermissions, setUserPermissions] = useState<any>(null)
  const [userAccountType, setUserAccountType] = useState<string | null>(null)
  const [tenantCountry, setTenantCountry] = useState<string>('ES')
  const [tenantPlan, setTenantPlan] = useState<string | null>(null)
  const [activeModules, setActiveModules] = useState<string[]>([])
  const [isLoadingModules, setIsLoadingModules] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const { config: whitelabelConfig } = useWhitelabel()

  // Conteo de entregas no entregables + avisos (sonido y notificación del sistema)
  const { pendingCount: undeliverableCount, recentFailures } = useUndeliverableNotifications((session?.user as any)?.id || null)
  const [badgePopoverOpen, setBadgePopoverOpen] = useState(false)

  // Aviso al agente cuando un contrato queda firmado (document_signed)
  useContractSignatureNotifications((session?.user as any)?.id || null)

  // Cerrar el popover de resumen con Escape
  useEffect(() => {
    if (!badgePopoverOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBadgePopoverOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [badgePopoverOpen])

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
            // Con suplantación activa el menú debe ser el del tenant suplantado,
            // no el del Superadmin que entra (ver lib/navigation-visibility.ts).
            setIsImpersonating(Boolean(userData.isImpersonating));
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
          if (modulesData?.plan) setTenantPlan(modulesData.plan);
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

  // Contexto único de visibilidad del menú. El tipo de cuenta que manda es el
  // del tenant ACTIVO (el suplantado, si hay suplantación) —el de la sesión es
  // el del usuario que entra y solo sirve de relleno mientras llega la API— y
  // los escapes de Superadmin se desactivan mientras se suplanta.
  const visibilidad: VisibilityContext = {
    accountType: userAccountType || (session?.user as any)?.accountType || null,
    roleName: (session?.user as any)?.roleName || null,
    activeModules,
    isLoadingModules,
    isImpersonating,
    country: tenantCountry,
    plan: tenantPlan,
    permissions: userPermissions,
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

  // Al entrar en una pantalla sin hamburguesa, el cajón no puede quedarse abierto
  // tapando el contenido.
  useEffect(() => {
    if (ocultarBotonMovil) setIsMobileMenuOpen(false)
  }, [ocultarBotonMovil, pathname])

  if (!mounted) return null

  return (
    <>
      {!ocultarBotonMovil && (
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden text-foreground relative"
        onClick={() => {
          setBadgePopoverOpen(false)
          setIsMobileMenuOpen(!isMobileMenuOpen)
        }}
      >
        {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        {/* Badge de entregas no entregables: al tocarlo abre el resumen sin abrir el menú */}
        {!isMobileMenuOpen && undeliverableCount > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Ver entregas no entregables"
            onClick={(e) => {
              e.stopPropagation()
              setBadgePopoverOpen((open) => !open)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                setBadgePopoverOpen((open) => !open)
              }
            }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-background shadow cursor-pointer hover:bg-red-600"
          >
            {undeliverableCount}
          </span>
        )}
      </Button>
      )}

      {/* Popover de resumen: últimas entregas no entregables (móvil, sin abrir el menú) */}
      {badgePopoverOpen && (
        <>
          <div className="fixed inset-0 z-[55] md:hidden" onClick={() => setBadgePopoverOpen(false)} />
          <div className="fixed left-4 top-14 z-[60] md:hidden w-[calc(100vw-2rem)] max-w-sm bg-background border rounded-2xl shadow-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Entregas no entregables
              </p>
              <button
                type="button"
                onClick={() => {
                  setBadgePopoverOpen(false)
                  window.location.href = '/dashboard/configuracion/whatsapp-negocio'
                }}
                className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
              >
                Ver todas
              </button>
            </div>
            {recentFailures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {recentFailures.slice(0, 5).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setBadgePopoverOpen(false)
                      if (f.hubUrl) window.open(f.hubUrl, '_blank')
                      else window.location.href = '/dashboard/configuracion/whatsapp-negocio'
                    }}
                    className="w-full text-left border rounded-lg p-3 bg-red-50/50 border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {f.contactoNombre || 'Contacto desconocido'}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {f.telefono}
                      {f.empresa ? ` · ${f.empresa}` : ''}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatDistanceToNow(new Date(f.fechaCreacion), { addSuffix: true, locale: es })}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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
                      {activeHub.id === 'comunicaciones' && undeliverableCount > 0 && (
                        <Badge className="bg-red-500 text-white border-red-500">
                          {undeliverableCount} pendiente{undeliverableCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
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
                {activeHub.items.filter((item) => itemEsVisible(item, visibilidad)).map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      target={item.external ? '_blank' : undefined}
                      rel={item.external ? 'noopener noreferrer' : undefined}
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
                      {item.href === '/dashboard/configuracion/whatsapp-negocio' && undeliverableCount > 0 && (
                        <Badge className="ml-auto bg-red-500 text-white border-red-500 text-[10px]">
                          {undeliverableCount}
                        </Badge>
                      )}
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

                {HUBS.filter((hub) => hubEsVisible(hub, visibilidad)).map((hub) => {
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
                      {hub.id === 'comunicaciones' && undeliverableCount > 0 && (
                        <Badge className="ml-auto bg-red-500 text-white border-red-500">
                          {undeliverableCount}
                        </Badge>
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