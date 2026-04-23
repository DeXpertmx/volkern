import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  Package,
  Workflow,
  BookOpen,
  GraduationCap,
  MessageCircle,
  Award,
  Send,
  BarChart3,
  FileText,
  Receipt,
  UserCog,
  Plug,
  TrendingUp,
  UserCheck,
  Building,
  Building2,
  Headset,
  Clock,
  Calculator,
  PhoneCall,
  RotateCw,
  CreditCard,
  Bot,
  ScrollText,
  Tag,
  ShoppingCart,
  ListTodo,
  Sparkles,
  HelpCircle,
  Phone,
  Share2,
  ShieldCheck,
  Bell,
  Palette,
  Globe,
  FileSignature,
  LineChart,
  AlertTriangle,
  Briefcase,
  LayoutGrid,
  DollarSign,
  CheckCircle2,
  Factory,
  Settings2,
  Cpu,
  Activity,
  Wallet,
  Heart,
  Lock,
  AlertOctagon
} from 'lucide-react'
import type { PermissionModule } from '@/lib/permissions'

export interface NavigationItem {
  name: string
  href: string
  icon: any
  module?: PermissionModule
  planModule?: string
  description?: string
}

export interface HubConfig {
  id: string
  name: string
  icon: any
  href: string
  items: NavigationItem[]
  description: string
  basePaths?: string[]
  requiredAccountType?: 'AGENCY' | 'BUSINESS' | 'SUPERADMIN'
}

export const HUBS: HubConfig[] = [
  {
    id: 'agencia',
    name: 'Agencia',
    icon: Building,
    href: '/dashboard/agencia',
    description: 'Gestión de clientes (slots), marca blanca y analítica global.',
    requiredAccountType: 'AGENCY',
    basePaths: [
      '/dashboard/agencia/slots',
      '/dashboard/agencia/branding'
    ],
    items: [
      { name: 'Dashboard Agencia', href: '/dashboard/agencia', icon: LayoutDashboard, description: 'Resumen de clientes y slots' },
      { name: 'Gestión de Clientes', href: '/dashboard/agencia/slots', icon: Users, description: 'Alta y baja de subcuentas' },
      { name: 'Mi Marca Blanca', href: '/dashboard/agencia/branding', icon: Palette, description: 'Configuración visual para clientes' },
      { name: 'Métricas de Uso', href: '/dashboard/agencia/usage', icon: BarChart3, description: 'Consumo IA y almacenamiento' },
    ]
  },
  {
    id: 'ventas',
    name: 'Ventas',
    icon: TrendingUp,
    href: '/dashboard/ventas',
    description: 'Gestión de prospectos, clientes y ciclo comercial.',
    basePaths: [
      '/dashboard/analytics',
      '/dashboard/tareas',
      '/dashboard/leads',
      '/dashboard/contactos',
      '/dashboard/empresas',
      '/dashboard/pipeline',
      '/dashboard/catalogo',
      '/dashboard/cotizaciones',
      '/dashboard/contratos',
      '/dashboard/citas',
      '/dashboard/scoring'
    ],
    items: [
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, planModule: 'analytics', description: 'Métricas y KPIs de ventas' },
      { name: 'Tareas', href: '/dashboard/tareas', icon: ListTodo, planModule: 'tareas', description: 'Gestión de pendientes y seguimientos' },
      { name: 'Leads', href: '/dashboard/leads', icon: Users, planModule: 'leads', description: 'Gestión de prospectos' },
      { name: 'Contactos', href: '/dashboard/contactos', icon: UserCheck, planModule: 'contactos', description: 'Base de datos de contactos' },
      { name: 'Empresas', href: '/dashboard/empresas', icon: Building2, planModule: 'empresas', description: 'Directorio de empresas' },
      { name: 'Pipeline', href: '/dashboard/pipeline', icon: TrendingUp, planModule: 'pipeline', description: 'Embudo de ventas' },
      { name: 'Catálogo', href: '/dashboard/catalogo', icon: Tag, planModule: 'catalogo', description: 'Productos y servicios' },
      { name: 'Cotizaciones', href: '/dashboard/cotizaciones', icon: FileText, planModule: 'cotizaciones', description: 'Propuestas comerciales' },
      { name: 'Contratos', href: '/dashboard/contratos', icon: ScrollText, planModule: 'contratos', description: 'Gestión documental' },
      { name: 'Órdenes de Venta', href: '/dashboard/ventas/ordenes', icon: ShoppingCart, planModule: 'ordenes_venta', description: 'Pedidos y ventas' },
      { name: 'Citas', href: '/dashboard/citas', icon: Calendar, planModule: 'citas', description: 'Agenda y reuniones' },
      { name: 'Pronósticos', href: '/dashboard/ventas/pronosticos', icon: BarChart3, planModule: 'pronosticos', description: 'Predicción de ventas' },
      { name: 'Scoring', href: '/dashboard/scoring', icon: Award, planModule: 'scoring', description: 'Calificación de leads' },
    ]
  },
  {
    id: 'comunicaciones',
    name: 'Comunicaciones',
    icon: MessageCircle,
    href: '/dashboard/mensajes',
    description: 'Central de mensajes, telefonía y chatwhot.',
    basePaths: [
      '/dashboard/telefonia',
      '/dashboard/automatizaciones',
      '/dashboard/chatbot'
    ],
    items: [
      { name: 'Mensajes', href: '/dashboard/mensajes', icon: MessageCircle, planModule: 'mensajes', description: 'Bandeja de entrada omnicanal' },
      { name: 'Telefonía', href: '/dashboard/telefonia', icon: Phone, planModule: 'telefonia', description: 'Central telefónica VoIP' },
      { name: 'Automatizaciones', href: '/dashboard/automatizaciones', icon: Workflow, planModule: 'automatizaciones', description: 'Flujos de trabajo automáticos' },
      { name: 'Chatbot', href: '/dashboard/chatbot', icon: Bot, planModule: 'chatbot_whatsapp', description: 'Asistente inteligente' },
      { name: 'Chat en vivo', href: '/dashboard/live-chat', icon: Headset, planModule: 'mensajes', description: 'Chat en tiempo real con visitantes' },
    ]
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: Send,
    href: '/dashboard/marketing',
    description: 'Campañas, constructor web y presencia social.',
    basePaths: [
      '/dashboard/campanas',
      '/dashboard/webcreator',
      '/dashboard/social'
    ],
    items: [
      { name: 'Campañas', href: '/dashboard/campanas', icon: Send, planModule: 'campanas', description: 'Email marketing y campañas' },
      { name: 'Constructor Web', href: '/dashboard/webcreator', icon: Sparkles, planModule: 'cms', description: 'Diseño de landing pages' },
      { name: 'Hub Social', href: '/dashboard/social', icon: Share2, planModule: 'social_manager', description: 'Gestión de redes sociales' },
      { name: 'Configuración', href: '/dashboard/social/settings', icon: Settings2, description: 'Conectar redes sociales y APIs' },
    ]
  },
  {
    id: 'academia',
    name: 'Academia',
    icon: GraduationCap,
    href: '/dashboard/academia',
    description: 'Cursos, estudiantes y comunidad de aprendizaje.',
    basePaths: [
      '/dashboard/cursos',
      '/dashboard/estudiantes',
      '/dashboard/quizzes',
      '/dashboard/comunidad'
    ],
    items: [
      { name: 'Cursos', href: '/dashboard/cursos', icon: BookOpen, planModule: 'cursos', description: 'Gestión de contenido educativo' },
      { name: 'Estudiantes', href: '/dashboard/estudiantes', icon: GraduationCap, planModule: 'estudiantes', description: 'Gestión de alumnos' },
      { name: 'Cuestionarios', href: '/dashboard/quizzes', icon: HelpCircle, planModule: 'cursos', description: 'Evaluaciones y tests' },
      { name: 'Comunidad', href: '/dashboard/comunidad', icon: MessageCircle, planModule: 'cursos', description: 'Foros y networking' },
    ]
  },
  {
    id: 'rrhh',
    name: 'RRHH',
    icon: Users,
    href: '/dashboard/rrhh',
    description: 'Gestión de talento, nóminas y bienestar laboral.',
    basePaths: [
      '/dashboard/rrhh'
    ],
    items: [
      { name: 'Gestión de Plantilla', href: '/dashboard/equipo', icon: Users, description: 'Alta y baja de colaboradores' },
      { name: 'Dashboard RRHH', href: '/dashboard/rrhh', icon: BarChart3, planModule: 'rrhh', description: 'Métricas de talento' },
      { name: 'Gastos', href: '/dashboard/rrhh?section=gastos', icon: Receipt, planModule: 'rrhh', description: 'Autorización y control de reembolsos' },
      { name: 'Vacaciones', href: '/dashboard/rrhh?section=vacaciones', icon: Calendar, planModule: 'rrhh', description: 'Cuadrante y solicitudes de ausencia' },
      { name: 'Nóminas (Vault)', href: '/dashboard/rrhh?section=nominas', icon: Wallet, planModule: 'rrhh', description: 'Gestión de pagos con cifrado 2.0' },
    ]
  },
  {
    id: 'equipo',
    name: 'Equipo',
    icon: UserCog,
    href: '/dashboard/equipo',
    description: 'Gestión de colaboradores, roles y permisos de acceso.',
    items: [
      { name: 'Miembros', href: '/dashboard/equipo', icon: Users, description: 'Directorio y alta de personal' },
      { name: 'Roles y Permisos', href: '/dashboard/equipo/roles', icon: ShieldCheck, description: 'Configuración de niveles de acceso' },
    ]
  },
  {
    id: 'finanzas',
    name: 'Finanzas',
    icon: Calculator,
    href: '/dashboard/finanzas',
    description: 'Gestión de gastos, proveedores y salud financiera.',
    basePaths: [
      '/dashboard/gastos',
      '/dashboard/proveedores',
      '/dashboard/finanzas/facturacion',
      '/dashboard/finanzas/contabilidad'
    ],
    items: [
      { name: 'Global Cockpit', href: '/dashboard/finanzas/global', icon: LineChart, planModule: 'finanzas_consolidado', description: 'Consolidación financiera y cash flow' },
      { name: 'Financial Cockpit', href: '/dashboard/finanzas', icon: BarChart3, planModule: 'finanzas', description: 'Vista general de salud financiera' },
      { name: 'Facturación', href: '/dashboard/finanzas/facturacion', icon: Receipt, planModule: 'finanzas', description: 'Facturas emitidas y punto de venta' },
      { name: 'Hub Contable', href: '/dashboard/finanzas/contabilidad', icon: BookOpen, planModule: 'finanzas', description: 'Libro diario inmutable y sellado' },
      { name: 'Conciliación Bancaria', href: '/dashboard/finanzas/contabilidad/reconciliacion', icon: Calculator, planModule: 'finanzas', description: 'Sincronización con bancos e IA' },
      { name: 'Impuestos (Modelo 303)', href: '/dashboard/finanzas/contabilidad/impuestos', icon: FileText, planModule: 'finanzas', description: 'Automatización de IVA trimestral' },
      { name: 'Gastos', href: '/dashboard/finanzas/gastos', icon: ListTodo, planModule: 'finanzas', description: 'Listado de egresos y facturas' },
      { name: 'Proveedores', href: '/dashboard/finanzas/proveedores', icon: Building2, planModule: 'finanzas', description: 'Directorio de proveedores' },
      { name: 'Reportes P&L', href: '/dashboard/finanzas/reportes', icon: FileText, planModule: 'finanzas', description: 'Balance de pérdidas y ganancias' },
    ]
  },
  {
    id: 'calidad',
    name: 'Calidad',
    icon: ShieldCheck,
    href: '/dashboard/calidad',
    description: 'Garantía de calidad industrial y cumplimiento.',
    basePaths: [
      '/dashboard/calidad'
    ],
    items: [
      { name: 'Inspecciones', href: '/dashboard/calidad', icon: ShieldCheck, planModule: 'calidad', description: 'Registro de puntos de control' },
      { name: 'No Conformidades', href: '/dashboard/calidad?section=incidencias', icon: AlertOctagon, planModule: 'calidad', description: 'Gestión de fallos detectados' },
      { name: 'Auditoría IA', href: '/dashboard/calidad?section=ia', icon: Activity, planModule: 'calidad', description: 'Análisis de anomalías de materiales' },
    ]
  },
  {
    id: 'produccion',
    name: 'Producción',
    icon: Factory,
    href: '/dashboard/produccion',
    description: 'Gestión de manufactura, BoM e integridad de planta.',
    basePaths: [
      '/dashboard/produccion'
    ],
    items: [
      { name: 'Órdenes Activas', href: '/dashboard/produccion', icon: Factory, planModule: 'produccion', description: 'Monitor de planta en tiempo real' },
      { name: 'Recetas (BoM)', href: '/dashboard/produccion?section=bom', icon: LayoutGrid, planModule: 'produccion', description: 'Gestión de listas de materiales' },
      { name: 'Control de Costos', href: '/dashboard/produccion?section=costos', icon: BarChart3, planModule: 'produccion', description: 'Análisis de costos de fabricación' },
      { name: 'Gemma Fab-Control', href: '/dashboard/produccion?section=ai', icon: Cpu, planModule: 'produccion', description: 'Optimización industrial vía IA' },
    ]
  },
  {
    id: 'inventario',
    name: 'Inventario',
    icon: Package,
    href: '/dashboard/inventario',
    description: 'Control de existencias, almacenes y movimientos SCM.',
    basePaths: [
      '/dashboard/almacenes',
      '/dashboard/existencias'
    ],
    items: [
      { name: 'Stock Global', href: '/dashboard/inventario', icon: BarChart3, planModule: 'inventario', description: 'Vista consolidada de existencias' },
      { name: 'Movimientos', href: '/dashboard/inventario/movimientos', icon: ListTodo, planModule: 'inventario', description: 'Historial de entradas y salidas' },
      { name: 'Almacenes', href: '/dashboard/inventario/almacenes', icon: Building2, planModule: 'inventario', description: 'Gestión de centros de distribución' },
      { name: 'Alertas Reposición', href: '/dashboard/inventario/alertas', icon: AlertTriangle, planModule: 'inventario', description: 'Predicciones de ruptura de stock' },
    ]
  },
  {
    id: 'proyectos',
    name: 'Proyectos',
    icon: Briefcase,
    href: '/dashboard/proyectos',
    description: 'Gestión operativa, hitos y rentabilidad por obra.',
    basePaths: [
      '/dashboard/proyectos/hitos',
      '/dashboard/proyectos/costos'
    ],
    items: [
      { name: 'Tablero Proyectos', href: '/dashboard/proyectos', icon: LayoutGrid, planModule: 'proyectos', description: 'Vista general de proyectos activos' },
      { name: 'Cronograma Gantt', href: '/dashboard/proyectos?section=gantt', icon: Calendar, planModule: 'proyectos', description: 'Línea de tiempo y dependencias' },
      { name: 'Control de Costos', href: '/dashboard/proyectos?section=costos', icon: DollarSign, planModule: 'proyectos', description: 'Margen real vs presupuesto' },
      { name: 'Hitos Pendientes', href: '/dashboard/proyectos?section=hitos', icon: CheckCircle2, planModule: 'proyectos', description: 'Gestión de entregables' },
    ]
  },
  {
    id: 'configuracion',
    name: 'Configuración',
    icon: Settings,
    href: '/dashboard/configuracion',
    description: 'Ajustes del sistema, marca blanca e integraciones.',
    basePaths: [
      '/dashboard/equipo',
      '/dashboard/integraciones'
    ],
    items: [
      { name: 'Empresa', href: '/dashboard/configuracion?section=empresa', icon: Building, description: 'Datos empresariales' },
      { name: 'Horarios', href: '/dashboard/configuracion?section=horarios', icon: Clock, description: 'Disponibilidad' },
      { name: 'Notificaciones', href: '/dashboard/configuracion?section=notificaciones', icon: Bell, description: 'Alertas y correos' },
      { name: 'Config. Fiscal', href: '/dashboard/configuracion?section=fiscal', icon: Calculator, description: 'Facturación e impuestos' },
      { name: 'Telefonía', href: '/dashboard/configuracion?section=telefonia', icon: PhoneCall, description: 'Líneas y desvíos' },
      { name: 'Reparto Leads', href: '/dashboard/configuracion?section=reparto', icon: RotateCw, description: 'Asignación de ejecutivos' },
      { name: 'Campos de Leads', href: '/dashboard/configuracion?section=leads', icon: ListTodo, description: 'Personalización de campos' },
      { name: 'Documentos', href: '/dashboard/configuracion?section=documentos', icon: FileText, description: 'Ajustes de contratos' },
      { name: 'Marca Blanca', href: '/dashboard/configuracion?section=whitelabel', icon: Palette, description: 'Personalización gráfica' },
      { name: 'Equipo', href: '/dashboard/equipo', icon: UserCog, planModule: 'equipo', description: 'Gestión de usuarios' },
      { name: 'Integraciones', href: '/dashboard/integraciones', icon: Plug, planModule: 'integraciones', description: 'Conexión con apps externas' },
      { name: 'Mi Suscripción', href: '/dashboard/configuracion/billing', icon: CreditCard, description: 'Suscripción y pagos' },
    ]
  },
  {
    id: 'perfil',
    name: 'Perfil',
    icon: UserCog,
    href: '/dashboard/perfil',
    description: 'Ajustes personales y tarjeta digital.',
    basePaths: [
      '/dashboard/mi-tarjeta',
      '/dashboard/perfil/seguridad'
    ],
    items: [
      { name: 'Mi Perfil', href: '/dashboard/perfil?section=datos', icon: UserCog, description: 'Datos personales y foto' },
      { name: 'Seguridad', href: '/dashboard/perfil?section=seguridad', icon: ShieldCheck, description: 'Cambio de contraseña' },
      { name: 'Agendamiento', href: '/dashboard/perfil?section=agendamiento', icon: Calendar, description: 'Links de reserva y disponibilidad' },
      { name: 'Telefonía (Zadarma)', href: '/dashboard/perfil?section=zadarma', icon: Phone, description: 'Configuración de extensión Zadarma' },
      { name: 'Notificaciones', href: '/dashboard/perfil?section=notificaciones', icon: Bell, description: 'Alertas del navegador' },
      { name: 'IA Agent Skills', href: '/dashboard/perfil?section=agent-skills', icon: Cpu, description: 'Conecta tu asistente IA (Gemma/Gemma local)' },
      { name: 'Mi Tarjeta', href: '/dashboard/mi-tarjeta', icon: CreditCard, planModule: 'mi_tarjeta', description: 'Tarjeta de presentación digital' },
    ]
  }
]
