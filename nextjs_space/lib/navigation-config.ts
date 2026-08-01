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
  PieChart,
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
  AlertOctagon,
  LifeBuoy,
  Zap,
  FileWarning,
  Home,
  Percent,
  CalendarDays,
  Truck,
  MapPin,
  Ship,
  Radio,
  Radar,
  Scale,
  Mail
} from 'lucide-react'
import type { PermissionModule } from '@/lib/permissions'

export interface NavigationItem {
  name: string
  href: string
  icon: any
  module?: PermissionModule
  planModule?: string
  description?: string
  requiredRegion?: 'MX' | 'ES' | 'CO' | 'US' // Regiones soportadas
  requiredAccountType?: 'AGENCY' | 'BUSINESS' | 'SUPERADMIN'
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
  requiredModule?: string
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
    id: 'contabilidad',
    name: 'Contabilidad',
    icon: Calculator,
    href: '/dashboard/contabilidad',
    description: 'Gestión de clientes de asesoría, conciliación bancaria y marca de despacho.',
    requiredAccountType: 'AGENCY',
    basePaths: [
      '/dashboard/contabilidad/slots',
      '/dashboard/contabilidad/branding'
    ],
    items: [
      { name: 'Dashboard Asesoría', href: '/dashboard/contabilidad', icon: LayoutDashboard, description: 'Resumen de clientes y actividad' },
      { name: 'Gestión de Clientes', href: '/dashboard/contabilidad/slots', icon: Users, description: 'Alta y baja de empresas cliente' },
      { name: 'Mi Marca de Despacho', href: '/dashboard/contabilidad/branding', icon: Palette, description: 'Personalización visual para clientes' },
      { name: 'Métricas de Uso', href: '/dashboard/contabilidad/usage', icon: BarChart3, description: 'Consumo IA y almacenamiento' },
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
      '/dashboard/chatbot',
      '/dashboard/chatbot/analytics',
      '/dashboard/connect'
    ],
    items: [
      { name: 'Volkern Connect', href: '/dashboard/connect', icon: Activity, planModule: 'mensajes', description: 'Chat operativo y eventos de sistema' },
      { name: 'Mensajes', href: '/dashboard/mensajes', icon: MessageCircle, planModule: 'mensajes', description: 'Bandeja de entrada omnicanal' },
      { name: 'Telefonía', href: '/dashboard/telefonia', icon: Phone, planModule: 'telefonia', description: 'Central telefónica VoIP' },
      { name: 'Automatizaciones', href: '/dashboard/automatizaciones', icon: Workflow, planModule: 'automatizaciones', description: 'Flujos de trabajo automáticos' },
      { name: 'Chatbot', href: '/dashboard/chatbot', icon: Bot, planModule: 'chatbot_whatsapp', description: 'Asistente inteligente' },
      { name: 'Analytics del Chatbot', href: '/dashboard/chatbot/analytics', icon: PieChart, planModule: 'chatbot_whatsapp', description: 'Métricas, patrones y sugerencias' },
      { name: 'Plaudern IA', href: '/dashboard/plaudern', icon: Bot, planModule: 'chatbot_whatsapp', description: 'Agente conversacional IA' },
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
      '/dashboard/ads',
      '/dashboard/webcreator',
      '/dashboard/social'
    ],
    items: [
      { name: 'Discover', href: '/dashboard/discover', icon: Radar, planModule: 'ads', description: 'Inteligencia de mercado y señales de compra con AI Score' },
      { name: 'Campañas', href: '/dashboard/campanas', icon: Send, planModule: 'campanas', description: 'Email marketing y campañas' },
      { name: 'ADS Intelligence', href: '/dashboard/ads', icon: TrendingUp, planModule: 'ads', description: 'Campañas de anuncios pagados con IA' },
      { name: 'Constructor Web', href: '/dashboard/webcreator', icon: Sparkles, planModule: 'cms', description: 'Diseño de landing pages' },
      { name: 'Hub Social', href: '/dashboard/social', icon: Share2, planModule: 'social_manager', description: 'Gestión de redes sociales' },
      { name: 'Configuración', href: '/dashboard/social/settings', icon: Settings2, description: 'Conectar redes sociales y APIs' },
      { name: 'Formularios', href: '/dashboard/formularios', icon: FileText, planModule: 'formularios', description: 'Creador de formularios inteligentes' },
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
    id: 'seguros',
    name: 'Seguros',
    icon: ShieldCheck,
    href: '/dashboard/seguros',
    description: 'Cartera de pólizas, renovaciones y aseguradoras con IA.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'insurance',
    basePaths: [
      '/dashboard/seguros/polizas',
      '/dashboard/seguros/renovaciones',
      '/dashboard/seguros/cartera',
      '/dashboard/seguros/aseguradoras'
    ],
    items: [
      { name: 'Dashboard Seguros', href: '/dashboard/seguros', icon: LayoutDashboard, planModule: 'insurance', description: 'KPIs de cartera y renovaciones' },
      { name: 'Pólizas', href: '/dashboard/seguros/polizas', icon: FileText, planModule: 'insurance', description: 'Gestión de pólizas y clientes asegurados' },
      { name: 'Renovaciones', href: '/dashboard/seguros/renovaciones', icon: RotateCw, planModule: 'insurance', description: 'Motor de renovaciones y alertas' },
      { name: 'Cartera IA', href: '/dashboard/seguros/cartera', icon: BarChart3, planModule: 'insurance', description: 'Mapa de cartera y oportunidades IA' },
      { name: 'Aseguradoras', href: '/dashboard/seguros/aseguradoras', icon: Building2, planModule: 'insurance', description: 'Directorio de aseguradoras y productos' },
    ]
  },
  {
    id: 'rrhh',
    name: 'RRHH',
    icon: Users,
    href: '/dashboard/rrhh',
    description: 'Gestión de talento, nóminas y bienestar laboral.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'rrhh',
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
      { name: 'Aprobaciones ⚡', href: '/dashboard/aprobaciones', icon: ShieldCheck, description: 'Workflows obligatorios con aprobación por roles' },
    ]
  },
  {
    id: 'finanzas',
    name: 'Finanzas',
    icon: Calculator,
    href: '/dashboard/finanzas',
    description: 'Gestión de gastos, proveedores y salud financiera.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'finanzas',
    basePaths: [
      '/dashboard/gastos',
      '/dashboard/proveedores',
      '/dashboard/finanzas/facturacion',
      '/dashboard/finanzas/contabilidad'
    ],
    items: [
      { name: 'Global Cockpit', href: '/dashboard/finanzas/global', icon: LineChart, planModule: 'finanzas_consolidado', description: 'Consolidación financiera y cash flow' },
      { name: 'Financial Cockpit', href: '/dashboard/finanzas', icon: BarChart3, planModule: 'finanzas', description: 'Vista general de salud financiera' },
      { name: 'Mesa de Facturación', href: '/dashboard/finanzas/facturacion', icon: Receipt, planModule: 'finanzas', requiredRegion: 'ES', description: 'Revisión y emisión legal Veri*factu' },
      { name: 'Facturación Directa (MX)', href: '/dashboard/sales/billing', icon: Zap, requiredRegion: 'MX', description: 'Emisión Zero-Stripe de CFDI 4.0' },
      { name: 'Hub Contable', href: '/dashboard/finanzas/contabilidad', icon: BookOpen, planModule: 'finanzas', description: 'Libro diario inmutable y sellado' },
      { name: 'Conciliación Bancaria', href: '/dashboard/finanzas/contabilidad/reconciliacion', icon: Calculator, planModule: 'finanzas', description: 'Sincronización con bancos e IA' },
      { name: 'Impuestos (Modelo 303)', href: '/dashboard/finanzas/contabilidad/impuestos', icon: FileText, planModule: 'finanzas', requiredRegion: 'ES', description: 'Automatización de IVA trimestral' },
      { name: 'Retenciones (Modelo 111)', href: '/dashboard/finanzas/contabilidad/retenciones', icon: Percent, planModule: 'finanzas', requiredRegion: 'ES', description: 'Retenciones IRPF trimestrales' },
      { name: 'Pago Fraccionado (Modelo 130)', href: '/dashboard/finanzas/contabilidad/modelo130', icon: Calculator, planModule: 'finanzas', requiredRegion: 'ES', description: 'IRPF estimación directa trimestral' },
      { name: 'Intracomunitario (Modelo 349)', href: '/dashboard/finanzas/contabilidad/modelo349', icon: Globe, planModule: 'finanzas', requiredRegion: 'ES', description: 'Operaciones intracomunitarias UE trimestrales' },
      { name: 'Terceros (Modelo 347)', href: '/dashboard/finanzas/contabilidad/modelo347', icon: Building2, planModule: 'finanzas', requiredRegion: 'ES', description: 'Operaciones anuales con terceros >3.005€' },
      { name: 'IVA Anual (Modelo 390)', href: '/dashboard/finanzas/contabilidad/modelo390', icon: PieChart, planModule: 'finanzas', requiredRegion: 'ES', description: 'Resumen anual de IVA — consolidación 4T' },
      { name: 'Calendario Fiscal', href: '/dashboard/finanzas/contabilidad/calendario-fiscal', icon: CalendarDays, planModule: 'finanzas', requiredRegion: 'ES', description: 'Vencimientos AEAT con alertas automáticas' },
      { name: 'Gastos', href: '/dashboard/finanzas/gastos', icon: ListTodo, planModule: 'finanzas', description: 'Listado de egresos y facturas' },
      { name: 'Proveedores', href: '/dashboard/finanzas/proveedores', icon: Building2, planModule: 'finanzas', description: 'Directorio de proveedores' },
      { name: 'Balance de Situación', href: '/dashboard/finanzas/contabilidad/balance', icon: Scale, planModule: 'finanzas', description: 'Activo, Pasivo y Patrimonio Neto' },
      { name: 'Cuenta de Resultados', href: '/dashboard/finanzas/contabilidad/cuenta-resultados', icon: FileText, planModule: 'finanzas', description: 'Pérdidas y Ganancias del periodo' },
      { name: 'Balance de Comprobación', href: '/dashboard/finanzas/contabilidad/trial-balance', icon: FileText, planModule: 'finanzas', description: 'Sumas y saldos de todas las cuentas' },
    ]
  },
  {
    id: 'calidad',
    name: 'Calidad',
    icon: ShieldCheck,
    href: '/dashboard/calidad',
    description: 'Garantía de calidad industrial y cumplimiento.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'calidad',
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
    requiredAccountType: 'BUSINESS',
    requiredModule: 'produccion',
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
    requiredAccountType: 'BUSINESS',
    requiredModule: 'inventario',
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
    requiredAccountType: 'BUSINESS',
    requiredModule: 'proyectos',
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
    id: 'taskforce',
    name: 'Taskforce',
    icon: LifeBuoy,
    href: '/dashboard/support',
    description: 'Gestión de soporte, incidencias y excepciones operativas.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'taskforce',
    basePaths: ['/dashboard/support'],
    items: [
      { name: 'Bandeja de Entrada', href: '/dashboard/support', icon: LifeBuoy, planModule: 'taskforce', description: 'Tickets activos y por asignar' },
      { name: 'SLA Dashboard', href: '/dashboard/support/analytics', icon: BarChart3, planModule: 'taskforce', description: 'Métricas de tiempo de respuesta' },
      { name: 'Incidencias Críticas', href: '/dashboard/support?status=CRITICAL', icon: AlertOctagon, planModule: 'taskforce', description: 'Problemas de alta prioridad' },
    ]
  },
  {
    id: 'strategy',
    name: 'Estrategia',
    icon: LineChart,
    href: '/dashboard/strategy',
    description: 'Inteligencia de negocio, proyecciones y análisis de rentabilidad.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'estrategia',
    basePaths: ['/dashboard/strategy'],
    items: [
      { name: 'Executive Snapshot', href: '/dashboard/strategy', icon: LayoutDashboard, planModule: 'estrategia', description: 'Vista general estratégica' },
      { name: 'Cashflow Forecast', href: '/dashboard/strategy/cashflow', icon: TrendingUp, planModule: 'estrategia', description: 'Proyección de caja a 90 días' },
      { name: 'Profitability Sniffer', href: '/dashboard/strategy/profitability', icon: Activity, planModule: 'estrategia', description: 'Análisis de rentabilidad de clientes y proyectos' },
      { name: 'Recomendaciones IA', href: '/dashboard/strategy/recommendations', icon: Sparkles, planModule: 'estrategia', description: 'Sugerencias estratégicas de Gemma' },
    ]
  },
  {
    id: 'assets',
    name: 'Activos',
    icon: Package,
    href: '/dashboard/assets',
    description: 'Gestión de activos internos, hardware, licencias y vehículos.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'activos',
    basePaths: ['/dashboard/assets'],
    items: [
      { name: 'Inventario de Activos', href: '/dashboard/assets', icon: Package, planModule: 'activos', description: 'Listado global de equipos y licencias' },
      { name: 'Asignaciones', href: '/dashboard/assets/assignments', icon: Users, planModule: 'activos', description: 'Control de equipos por empleado' },
      { name: 'Mantenimiento', href: '/dashboard/assets/maintenance', icon: Activity, planModule: 'activos', description: 'Historial y alertas preventivas' },
      { name: 'Trazabilidad (Trust)', href: '/dashboard/assets/trust', icon: ShieldCheck, planModule: 'activos', description: 'Registro inmutable de movimientos' },
    ]
  },
  {
    id: 'knowledge',
    name: 'Conocimiento',
    icon: BookOpen,
    href: '/dashboard/knowledge',
    description: 'Memoria organizacional, procesos SOP y políticas internas.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'conocimiento',
    basePaths: ['/dashboard/knowledge'],
    items: [
      { name: 'Base de Conocimiento', href: '/dashboard/knowledge', icon: BookOpen, planModule: 'conocimiento', description: 'Listado global de artículos y políticas' },
      { name: 'Mis Favoritos', href: '/dashboard/knowledge?filter=favs', icon: Award, planModule: 'conocimiento', description: 'Artículos guardados para acceso rápido' },
      { name: 'Cosecha de Soporte', href: '/dashboard/knowledge?filter=harvest', icon: RotateCw, planModule: 'conocimiento', description: 'Lecciones aprendidas desde tickets' },
    ]
  },
  {
    id: 'logistica',
    name: 'Logística',
    icon: Truck,
    href: '/dashboard/logistica',
    description: 'Gestión de flota, almacenes, envíos y tracking GPS.',
    requiredAccountType: 'BUSINESS',
    requiredModule: 'logistica',
    basePaths: [
      '/dashboard/logistica'
    ],
    items: [
      { name: 'Dashboard Logística', href: '/dashboard/logistica', icon: LayoutDashboard, planModule: 'logistica', description: 'KPIs de flota, almacenes y envíos' },
      { name: 'Flota', href: '/dashboard/logistica/flota', icon: Truck, planModule: 'logistica', description: 'Gestión de vehículos y conductores' },
      { name: 'Envíos', href: '/dashboard/logistica/envios', icon: Ship, planModule: 'logistica', description: 'Seguimiento de envíos y entregas' },
      { name: 'Almacenes', href: '/dashboard/logistica/almacenes', icon: Package, planModule: 'logistica', description: 'WMS y control de existencias' },
      { name: 'Tracking GPS', href: '/dashboard/logistica/tracking', icon: MapPin, planModule: 'logistica', description: 'Localización en tiempo real' },
      { name: 'GPS en Vivo', href: '/dashboard/logistica/gps-stream', icon: Radio, planModule: 'logistica', description: 'Streaming SSE de posiciones GPS' },
      { name: 'Alertas', href: '/dashboard/logistica/alertas', icon: AlertTriangle, planModule: 'logistica', description: 'Mantenimiento, ITV y capacidad' },
    ]
  },
  {
    id: 'compliance',
    name: 'Compliance',
    icon: ShieldCheck,
    href: '/dashboard/compliance',
    description: 'Score de cumplimiento, procesos obligatorios y modos de control.',
    basePaths: [
      '/dashboard/compliance'
    ],
    items: [
      { name: 'Score Dashboard', href: '/dashboard/compliance', icon: BarChart3, description: 'Score de cumplimiento en tiempo real y KPIs' },
      { name: 'Configuración', href: '/dashboard/configuracion?section=compliance', icon: ShieldCheck, description: 'Modos de control y activación de gates' },
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
      { name: 'Canal de Denuncias', href: '/dashboard/perfil?section=denuncias', icon: FileWarning, description: 'Buzón confidencial de igualdad y transparencia' },
      { name: 'Mi Tarjeta', href: '/dashboard/perfil?section=mi-tarjeta', icon: CreditCard, planModule: 'mi_tarjeta', description: 'Tarjeta de presentación digital' },
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
      { name: 'Correo SMTP', href: '/dashboard/configuracion?section=email', icon: Mail, description: 'Servidor de correo saliente' },
      { name: 'Notificaciones', href: '/dashboard/configuracion?section=notificaciones', icon: Bell, description: 'Alertas y correos' },
      { name: 'Config. Fiscal', href: '/dashboard/configuracion?section=fiscal', icon: Calculator, description: 'Facturación e impuestos' },
      { name: 'Telefonía', href: '/dashboard/configuracion?section=telefonia', icon: PhoneCall, description: 'Líneas y desvíos' },
      { name: 'Reparto Leads', href: '/dashboard/configuracion?section=reparto', icon: RotateCw, description: 'Asignación de ejecutivos' },
      { name: 'Campos de Leads', href: '/dashboard/configuracion?section=leads', icon: ListTodo, description: 'Personalización de campos' },
      { name: 'Documentos', href: '/dashboard/configuracion?section=documentos', icon: FileText, description: 'Ajustes de contratos' },
      { name: 'Canal de Igualdad', href: '/dashboard/configuracion?section=igualdad', icon: ShieldCheck, description: 'Configuración de denuncias e inmutabilidad' },
      { name: 'Marca Blanca', href: '/dashboard/configuracion?section=whitelabel', icon: Palette, planModule: 'white_label', description: 'Personalización gráfica' },
      { name: 'Agencia', href: '/dashboard/agencia', icon: Building, description: 'Gestión de clientes (slots)', requiredAccountType: 'AGENCY' },
      { name: 'Contabilidad', href: '/dashboard/contabilidad', icon: Calculator, description: 'Gestión de empresas clientes (despacho)', requiredAccountType: 'AGENCY' },
      { name: 'Inmobiliaria', href: '/dashboard/configuracion/real-estate', icon: Home, description: 'Configuración del portal de propiedades y comisiones' },
      { name: 'Equipo', href: '/dashboard/equipo', icon: UserCog, planModule: 'equipo', description: 'Gestión de usuarios' },
      { name: 'Integraciones', href: '/dashboard/integraciones', icon: Plug, planModule: 'integraciones', description: 'Conexión con apps externas' },
      { name: 'Módulos', href: '/dashboard/configuracion?section=modulos', icon: LayoutGrid, description: 'Activar/desactivar funciones' },
      { name: 'Auditoría', href: '/dashboard/auditoria', icon: Activity, description: 'Historial completo de acciones en el sistema' },
      { name: 'Compliance ⚡', href: '/dashboard/configuracion?section=compliance', icon: ShieldCheck, description: 'Control de compliance y procesos obligatorios' },
      { name: 'Privacidad GDPR', href: '/dashboard/compliance/gdpr', icon: Lock, description: 'Exportar y anonimizar tus datos personales' },
      { name: 'Mi Suscripción', href: '/dashboard/configuracion/billing', icon: CreditCard, description: 'Suscripción y pagos' },
      { name: 'Uso y Límites', href: '/dashboard/configuracion/usage', icon: BarChart3, description: 'Consumo y límites del plan' },
    ]
  }
]
