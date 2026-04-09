
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  Package,
  LogOut,
  Menu,
  X,
  Workflow,
  BookOpen,
  GraduationCap,
  MessageCircle,
  Award,
  Send,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  FileText,
  UserCog,
  Plug,
  TrendingUp,
  Mail,
  UserCheck,
  Building2,
  Smartphone,
  CreditCard,
  ChevronDown,
  Bot,
  ScrollText,
  Tag,
  ShoppingCart,
  ListTodo,
  Sparkles,
  HelpCircle
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWhitelabel } from '@/hooks/use-whitelabel'
import type { PermissionModule } from '@/lib/permissions'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

interface NavigationItem {
  name: string
  href: string
  icon: any
  module?: PermissionModule
  /** CrmModule ID for plan-based visibility filtering */
  planModule?: string
}

interface NavigationGroup {
  name: string
  icon: any
  items: NavigationItem[]
}

// Secciones agrupadas para mejor organización
const navigationGroups: NavigationGroup[] = [
  {
    name: 'Ventas & Leads',
    icon: TrendingUp,
    items: [
      {
        name: 'Analytics',
        href: '/dashboard/analytics',
        icon: BarChart3,
        module: 'analytics',
        planModule: 'analytics'
      },
      {
        name: 'Tareas',
        href: '/dashboard/tareas',
        icon: ListTodo,
        module: 'leads',
        planModule: 'tareas'
      },
      {
        name: 'Leads',
        href: '/dashboard/leads',
        icon: Users,
        module: 'leads',
        planModule: 'leads'
      },
      {
        name: 'Contactos',
        href: '/dashboard/contactos',
        icon: UserCheck,
        module: 'leads',
        planModule: 'contactos'
      },
      {
        name: 'Empresas',
        href: '/dashboard/empresas',
        icon: Building2,
        module: 'leads',
        planModule: 'empresas'
      },
      {
        name: 'Pipeline',
        href: '/dashboard/pipeline',
        icon: TrendingUp,
        module: 'leads',
        planModule: 'pipeline'
      },
      {
        name: 'Cotizaciones',
        href: '/dashboard/cotizaciones',
        icon: FileText,
        module: 'leads',
        planModule: 'cotizaciones'
      },
      {
        name: 'Contratos',
        href: '/dashboard/contratos',
        icon: ScrollText,
        module: 'leads',
        planModule: 'contratos'
      },
      {
        name: 'Órdenes de Venta',
        href: '/dashboard/ventas/ordenes',
        icon: ShoppingCart,
        module: 'leads',
        planModule: 'ordenes_venta'
      },
      {
        name: 'Pronósticos',
        href: '/dashboard/ventas/pronosticos',
        icon: BarChart3,
        module: 'leads',
        planModule: 'pronosticos'
      },
      {
        name: 'Scoring',
        href: '/dashboard/scoring',
        icon: Award,
        module: 'leads',
        planModule: 'scoring'
      },
    ]
  },
  {
    name: 'Comunicación',
    icon: MessageCircle,
    items: [
      {
        name: 'Mensajes',
        href: '/dashboard/mensajes',
        icon: MessageCircle,
        module: 'mensajes',
        planModule: 'mensajes'
      },
      {
        name: 'Citas',
        href: '/dashboard/citas',
        icon: Calendar,
        module: 'citas',
        planModule: 'citas'
      },
      {
        name: 'Catálogo',
        href: '/dashboard/catalogo',
        icon: Tag,
        module: 'configuracion',
        planModule: 'catalogo'
      },
      {
        name: 'Chatbot WhatsApp',
        href: '/dashboard/chatbot',
        icon: Bot,
        module: 'mensajes',
        planModule: 'chatbot_whatsapp'
      },
    ]
  },
  {
    name: 'Marketing',
    icon: Send,
    items: [
      {
        name: 'Campañas',
        href: '/dashboard/campanas',
        icon: Send,
        module: 'campanas',
        planModule: 'campanas'
      },
      {
        name: 'Constructor Web',
        href: '/dashboard/webcreator',
        icon: Sparkles,
        module: 'pages',
        planModule: 'cms'
      },
    ]
  },
  {
    name: 'Academia',
    icon: GraduationCap,
    items: [
      {
        name: 'Cursos',
        href: '/dashboard/cursos',
        icon: BookOpen,
        module: 'cursos',
        planModule: 'cursos'
      },
      {
        name: 'Cuestionarios',
        href: '/dashboard/quizzes',
        icon: HelpCircle,
        module: 'cursos',
        planModule: 'cursos'
      },
      {
        name: 'Estudiantes',
        href: '/dashboard/estudiantes',
        icon: GraduationCap,
        module: 'estudiantes',
        planModule: 'estudiantes'
      },
      {
        name: 'Comunidad',
        href: '/dashboard/comunidad',
        icon: MessageCircle,
        module: 'cursos',
        planModule: 'cursos'
      },
    ]
  },
  {
    name: 'Automatización',
    icon: Workflow,
    items: [
      {
        name: 'Automatizaciones',
        href: '/dashboard/automatizaciones',
        icon: Workflow,
        module: 'automatizaciones',
        planModule: 'automatizaciones'
      },
    ]
  },
  {
    name: 'Personal',
    icon: CreditCard,
    items: [
      {
        name: 'Mi Tarjeta',
        href: '/dashboard/mi-tarjeta',
        icon: CreditCard,
        planModule: 'mi_tarjeta'
      },
    ]
  },
  {
    name: 'Administración',
    icon: Settings,
    items: [
      {
        name: 'Equipo',
        href: '/dashboard/equipo',
        icon: UserCog,
        module: 'equipo',
        planModule: 'equipo'
      },
      {
        name: 'Integraciones',
        href: '/dashboard/integraciones',
        icon: Plug,
        planModule: 'integraciones'
      },
      {
        name: 'Configuración',
        href: '/dashboard/configuracion',
        icon: Settings,
        module: 'configuracion'
      },
    ]
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session, status } = useSession() || {}
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userPermissions, setUserPermissions] = useState<any>(null)
  const [activeModules, setActiveModules] = useState<string[] | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const { config: whitelabelConfig } = useWhitelabel()

  useEffect(() => {
    setMounted(true)
    // Cargar estado guardado del sidebar
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved) {
      setIsCollapsed(saved === 'true')
    }

    // Cargar estado de grupos abiertos
    const savedGroups = localStorage.getItem('sidebar-open-groups')
    if (savedGroups) {
      setOpenGroups(JSON.parse(savedGroups))
    } else {
      // Por defecto, abrir todos los grupos
      const defaultOpen: Record<string, boolean> = {}
      navigationGroups.forEach(group => {
        defaultOpen[group.name] = true
      })
      setOpenGroups(defaultOpen)
    }
  }, [])

  // Cargar permisos del usuario y módulos activos del plan
  useEffect(() => {
    if (session?.user) {
      fetch('/api/users/me')
        .then(res => res.json())
        .then(data => {
          if (data.role?.permisos) {
            setUserPermissions(data.role.permisos)
          }
        })
        .catch(err => console.error('Error loading permissions:', err))

      // Cargar módulos activos según plan del tenant
      fetch('/api/tenant/modules')
        .then(res => res.json())
        .then(data => {
          if (data.modules && Array.isArray(data.modules)) {
            setActiveModules(data.modules)
          }
        })
        .catch(err => console.error('Error loading tenant modules:', err))
    }
  }, [session])

  const toggleCollapsed = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
    // Disparar evento personalizado para que el DashboardLayout se actualice
    window.dispatchEvent(new CustomEvent('sidebar-toggle', {
      detail: { isCollapsed: newState }
    }))
  }

  const toggleGroup = (groupName: string) => {
    const newOpenGroups = { ...openGroups, [groupName]: !openGroups[groupName] }
    setOpenGroups(newOpenGroups)
    localStorage.setItem('sidebar-open-groups', JSON.stringify(newOpenGroups))
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/login' })
  }

  // Función para verificar si un módulo es visible según permisos de rol Y plan del tenant
  const isModuleVisible = (item: NavigationItem): boolean => {
    // 1. Verificar módulo del plan (si tiene planModule especificado)
    if (item.planModule) {
      if (!activeModules) return false
      if (!activeModules.includes(item.planModule)) return false
    }

    // 2. Verificar permisos de rol (si tiene module especificado)
    // Solo bloquear si el permiso existe explícitamente con ver=false
    // Si el módulo no existe en permisos del rol, permitir acceso (el plan ya controla disponibilidad)
    if (item.module && userPermissions) {
      const modulePerms = userPermissions[item.module]
      if (modulePerms && modulePerms.ver === false) return false
    }

    return true
  }

  // Filtrar grupos según permisos - solo mostrar grupos que tengan al menos un item visible
  const visibleGroups = navigationGroups
    .map(group => ({
      ...group,
      items: group.items.filter(isModuleVisible)
    }))
    .filter(group => group.items.length > 0)

  // Verificar si hay algún item activo en el grupo
  const isGroupActive = (group: NavigationGroup): boolean => {
    return group.items.some(item =>
      pathname === item.href || pathname?.startsWith(item.href + '/')
    )
  }

  if (!mounted) {
    return null // Prevent hydration mismatch
  }

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </Button>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "dashboard-sidebar fixed left-0 top-0 z-50 h-screen transform border-r bg-background transition-all duration-300 ease-in-out md:translate-x-0 shadow-lg",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Link href="/dashboard" className={cn("flex items-center", isCollapsed && "justify-center w-full")}>
              {!isCollapsed ? (
                <div className="relative w-40 h-10">
                  <Image
                    src={whitelabelConfig.logoUrl || '/volkern-logo.png'}
                    alt={`${whitelabelConfig.nombreEmpresa || 'Volkern'} - Full Logo`}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              ) : (
                <div className="relative w-8 h-8">
                  <Image
                    src={whitelabelConfig.iconoUrl || '/volkern-icon.png'}
                    alt={`${whitelabelConfig.nombreEmpresa || 'Volkern'} - Icon`}
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              )}
            </Link>
            {/* Collapse toggle button - solo visible en desktop */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              className="hidden md:flex h-8 w-8 shrink-0"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {/* Dashboard - siempre visible y fuera de grupos */}
            <Link
              href="/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              title={isCollapsed ? 'Dashboard' : undefined}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === '/dashboard' ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                isCollapsed ? "justify-center" : "space-x-3"
              )}
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>Dashboard</span>}
            </Link>

            {/* Separador */}
            <div className="h-px bg-border my-2" />

            {/* Grupos colapsables */}
            {visibleGroups.map((group) => {
              const groupActive = isGroupActive(group)

              if (isCollapsed) {
                // Cuando el sidebar está colapsado, mostrar items sin agrupar
                return (
                  <div key={group.name} className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          title={item.name}
                          className={cn(
                            "flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                            isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                        </Link>
                      )
                    })}
                  </div>
                )
              }

              return (
                <Collapsible
                  key={group.name}
                  open={openGroups[group.name]}
                  onOpenChange={() => toggleGroup(group.name)}
                  className="space-y-1"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        groupActive && "bg-accent/50 text-accent-foreground"
                      )}
                    >
                      <div className="flex items-center space-x-2">
                        <group.icon className="h-4 w-4 shrink-0" />
                        <span>{group.name}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200",
                          openGroups[group.name] && "rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pl-2">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center space-x-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                            isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.name}</span>
                        </Link>
                      )
                    })}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            {!isCollapsed && (
              <div className="flex items-center space-x-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {session?.user?.name?.charAt(0)?.toUpperCase() || 'A'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {session?.user?.name || 'Admin'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {session?.user?.email || ''}
                  </p>
                </div>
              </div>
            )}
            {isCollapsed && (
              <div className="flex items-center justify-center mb-4">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {session?.user?.name?.charAt(0)?.toUpperCase() || 'A'}
                  </span>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full",
                isCollapsed ? "justify-center px-2" : "justify-start"
              )}
              onClick={handleSignOut}
              title={isCollapsed ? "Cerrar sesión" : undefined}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span className="ml-2">Cerrar sesión</span>}
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}