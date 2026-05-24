import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HubModule {
  id: string;
  name: string;
  icon: string;
  color: string;
  categoryId: string;
  categoryName: string;
  hubHref: string;
  description: string;
}

export interface HubCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  moduleCount: number;
}

// ─── Hub configuration (synced from backend navigation-config.ts) ────────────
// Each hub becomes a category; each nav item becomes a module.
const HUBS_CONFIG = [
  {
    id: 'agencia', name: 'Agencia', icon: 'business', color: '#6366F1',
    description: 'Gestión de clientes, marca blanca y analítica global.',
    items: [
      { name: 'Dashboard Agencia', id: 'hub-agencia', icon: 'grid', href: '/dashboard/agencia', description: 'Resumen de clientes y slots' },
      { name: 'Gestión de Clientes', id: 'hub-agencia-slots', icon: 'people', href: '/dashboard/agencia/slots', description: 'Alta y baja de subcuentas' },
      { name: 'Mi Marca Blanca', id: 'hub-agencia-branding', icon: 'color-palette', href: '/dashboard/agencia/branding', description: 'Configuración visual para clientes' },
      { name: 'Métricas de Uso', id: 'hub-agencia-usage', icon: 'bar-chart', href: '/dashboard/agencia/usage', description: 'Consumo IA y almacenamiento' },
    ],
  },
  {
    id: 'ventas', name: 'Ventas', icon: 'trending-up', color: '#2563EB',
    description: 'Gestión de prospectos, clientes y ciclo comercial.',
    items: [
      { name: 'Analytics', id: 'hub-analytics', icon: 'bar-chart', href: '/dashboard/analytics', description: 'Métricas y KPIs de ventas' },
      { name: 'Tareas', id: 'hub-tareas', icon: 'checkbox', href: '/dashboard/tareas', description: 'Gestión de pendientes y seguimientos' },
      { name: 'Leads', id: 'hub-leads', icon: 'people', href: '/dashboard/leads', description: 'Gestión de prospectos' },
      { name: 'Contactos', id: 'hub-contactos', icon: 'person', href: '/dashboard/contactos', description: 'Base de datos de contactos' },
      { name: 'Empresas', id: 'hub-empresas', icon: 'business', href: '/dashboard/empresas', description: 'Directorio de empresas' },
      { name: 'Pipeline', id: 'hub-pipeline', icon: 'git-network', href: '/dashboard/pipeline', description: 'Embudo de ventas' },
      { name: 'Catálogo', id: 'hub-catalogo', icon: 'pricetag', href: '/dashboard/catalogo', description: 'Productos y servicios' },
      { name: 'Cotizaciones', id: 'hub-cotizaciones', icon: 'document-text', href: '/dashboard/cotizaciones', description: 'Propuestas comerciales' },
      { name: 'Contratos', id: 'hub-contratos', icon: 'document', href: '/dashboard/contratos', description: 'Gestión documental' },
      { name: 'Órdenes Venta', id: 'hub-ordenes', icon: 'cart', href: '/dashboard/ventas/ordenes', description: 'Pedidos y ventas' },
      { name: 'Citas', id: 'hub-citas', icon: 'calendar', href: '/dashboard/citas', description: 'Agenda y reuniones' },
      { name: 'Pronósticos', id: 'hub-pronosticos', icon: 'trending-up', href: '/dashboard/ventas/pronosticos', description: 'Predicción de ventas' },
      { name: 'Scoring', id: 'hub-scoring', icon: 'trophy', href: '/dashboard/scoring', description: 'Calificación de leads' },
    ],
  },
  {
    id: 'comunicaciones', name: 'Comunicación', icon: 'chatbubbles', color: '#8B5CF6',
    description: 'Central de mensajes, telefonía y chatbot.',
    items: [
      { name: 'Volkern Connect', id: 'hub-connect', icon: 'pulse', href: '/dashboard/connect', description: 'Chat operativo y eventos' },
      { name: 'Mensajes', id: 'hub-mensajes', icon: 'chatbubbles', href: '/dashboard/mensajes', description: 'Bandeja omnicanal' },
      { name: 'Telefonía', id: 'hub-telefonia', icon: 'call', href: '/dashboard/telefonia', description: 'Central VoIP' },
      { name: 'Automatizaciones', id: 'hub-automatizaciones', icon: 'git-branch', href: '/dashboard/automatizaciones', description: 'Flujos automáticos' },
      { name: 'Chatbot', id: 'hub-chatbot', icon: 'hardware-chip', href: '/dashboard/chatbot', description: 'Asistente inteligente' },
      { name: 'Chat en vivo', id: 'hub-livechat', icon: 'headset', href: '/dashboard/live-chat', description: 'Chat en tiempo real' },
    ],
  },
  {
    id: 'marketing', name: 'Marketing', icon: 'megaphone', color: '#EC4899',
    description: 'Campañas, constructor web y presencia social.',
    items: [
      { name: 'Campañas', id: 'hub-campanas', icon: 'megaphone', href: '/dashboard/campanas', description: 'Email marketing y campañas' },
      { name: 'Constructor Web', id: 'hub-webcreator', icon: 'code-slash', href: '/dashboard/webcreator', description: 'Diseño de landing pages' },
      { name: 'Hub Social', id: 'hub-social', icon: 'share-social', href: '/dashboard/social', description: 'Gestión de redes sociales' },
      { name: 'Config. Social', id: 'hub-social-settings', icon: 'settings', href: '/dashboard/social/settings', description: 'Conectar redes y APIs' },
    ],
  },
  {
    id: 'academia', name: 'Academia', icon: 'school', color: '#F59E0B',
    description: 'Cursos, estudiantes y comunidad de aprendizaje.',
    items: [
      { name: 'Cursos', id: 'hub-cursos', icon: 'book', href: '/dashboard/cursos', description: 'Contenido educativo' },
      { name: 'Estudiantes', id: 'hub-estudiantes', icon: 'people', href: '/dashboard/estudiantes', description: 'Gestión de alumnos' },
      { name: 'Cuestionarios', id: 'hub-quizzes', icon: 'help-circle', href: '/dashboard/quizzes', description: 'Evaluaciones y tests' },
      { name: 'Comunidad', id: 'hub-comunidad', icon: 'chatbubbles', href: '/dashboard/comunidad', description: 'Foros y networking' },
    ],
  },
  {
    id: 'rrhh', name: 'RRHH', icon: 'people', color: '#10B981',
    description: 'Gestión de talento, nóminas y bienestar laboral.',
    items: [
      { name: 'Dashboard RRHH', id: 'hub-rrhh', icon: 'bar-chart', href: '/dashboard/rrhh', description: 'Métricas de talento' },
      { name: 'Gestión Plantilla', id: 'hub-equipo-list', icon: 'people', href: '/dashboard/equipo', description: 'Alta y baja de colaboradores' },
      { name: 'Gastos', id: 'hub-rrhh-gastos', icon: 'receipt', href: '/dashboard/rrhh?section=gastos', description: 'Control de reembolsos' },
      { name: 'Vacaciones', id: 'hub-rrhh-vacaciones', icon: 'calendar', href: '/dashboard/rrhh?section=vacaciones', description: 'Solicitudes de ausencia' },
      { name: 'Nóminas', id: 'hub-rrhh-nominas', icon: 'wallet', href: '/dashboard/rrhh?section=nominas', description: 'Gestión de pagos' },
    ],
  },
  {
    id: 'equipo', name: 'Equipo', icon: 'person-circle', color: '#6366F1',
    description: 'Colaboradores, roles y permisos de acceso.',
    items: [
      { name: 'Miembros', id: 'hub-equipo-miembros', icon: 'people', href: '/dashboard/equipo', description: 'Directorio del personal' },
      { name: 'Roles y Permisos', id: 'hub-equipo-roles', icon: 'shield-checkmark', href: '/dashboard/equipo/roles', description: 'Niveles de acceso' },
    ],
  },
  {
    id: 'finanzas', name: 'Finanzas', icon: 'calculator', color: '#059669',
    description: 'Gestión de gastos, proveedores y salud financiera.',
    items: [
      { name: 'Global Cockpit', id: 'hub-finanzas-global', icon: 'pulse', href: '/dashboard/finanzas/global', description: 'Consolidación y cash flow' },
      { name: 'Financial Cockpit', id: 'hub-finanzas', icon: 'bar-chart', href: '/dashboard/finanzas', description: 'Salud financiera' },
      { name: 'Mesa Facturación', id: 'hub-facturacion', icon: 'receipt', href: '/dashboard/finanzas/facturacion', description: 'Emisión legal' },
      { name: 'Hub Contable', id: 'hub-contable', icon: 'book', href: '/dashboard/finanzas/contabilidad', description: 'Libro diario' },
      { name: 'Conciliación', id: 'hub-conciliacion', icon: 'calculator', href: '/dashboard/finanzas/contabilidad/reconciliacion', description: 'Sincronización bancaria' },
      { name: 'Impuestos', id: 'hub-impuestos', icon: 'document-text', href: '/dashboard/finanzas/contabilidad/impuestos', description: 'IVA trimestral' },
      { name: 'Gastos', id: 'hub-finanzas-gastos', icon: 'list', href: '/dashboard/finanzas/gastos', description: 'Egresos y facturas' },
      { name: 'Proveedores', id: 'hub-proveedores', icon: 'business', href: '/dashboard/finanzas/proveedores', description: 'Directorio de proveedores' },
      { name: 'Reportes P&L', id: 'hub-reportes', icon: 'document-text', href: '/dashboard/finanzas/reportes', description: 'Pérdidas y ganancias' },
    ],
  },
  {
    id: 'calidad', name: 'Calidad', icon: 'shield-checkmark', color: '#14B8A6',
    description: 'Garantía de calidad industrial y cumplimiento.',
    items: [
      { name: 'Inspecciones', id: 'hub-inspecciones', icon: 'shield-checkmark', href: '/dashboard/calidad', description: 'Puntos de control' },
      { name: 'No Conformidades', id: 'hub-noconformidades', icon: 'alert-circle', href: '/dashboard/calidad?section=incidencias', description: 'Gestión de fallos' },
      { name: 'Auditoría IA', id: 'hub-auditoria-ia', icon: 'pulse', href: '/dashboard/calidad?section=ia', description: 'Anomalías de materiales' },
    ],
  },
  {
    id: 'produccion', name: 'Producción', icon: 'settings', color: '#F97316',
    description: 'Manufactura, BoM e integridad de planta.',
    items: [
      { name: 'Órdenes Activas', id: 'hub-ordenes-prod', icon: 'settings', href: '/dashboard/produccion', description: 'Monitor de planta' },
      { name: 'Recetas (BoM)', id: 'hub-bom', icon: 'grid', href: '/dashboard/produccion?section=bom', description: 'Listas de materiales' },
      { name: 'Control Costos', id: 'hub-costos-prod', icon: 'bar-chart', href: '/dashboard/produccion?section=costos', description: 'Costos de fabricación' },
      { name: 'Gemma Fab-Control', id: 'hub-fabcontrol', icon: 'hardware-chip', href: '/dashboard/produccion?section=ai', description: 'Optimización IA' },
    ],
  },
  {
    id: 'inventario', name: 'Inventario', icon: 'cube', color: '#0EA5E9',
    description: 'Control de existencias, almacenes y movimientos.',
    items: [
      { name: 'Stock Global', id: 'hub-stock', icon: 'bar-chart', href: '/dashboard/inventario', description: 'Existencias consolidadas' },
      { name: 'Movimientos', id: 'hub-movimientos', icon: 'list', href: '/dashboard/inventario/movimientos', description: 'Entradas y salidas' },
      { name: 'Almacenes', id: 'hub-almacenes', icon: 'business', href: '/dashboard/inventario/almacenes', description: 'Centros de distribución' },
      { name: 'Alertas Reposición', id: 'hub-alertas-inv', icon: 'warning', href: '/dashboard/inventario/alertas', description: 'Predicción de ruptura' },
    ],
  },
  {
    id: 'proyectos', name: 'Proyectos', icon: 'briefcase', color: '#8B5CF6',
    description: 'Gestión operativa, hitos y rentabilidad por obra.',
    items: [
      { name: 'Tablero Proyectos', id: 'hub-tablero-proy', icon: 'grid', href: '/dashboard/proyectos', description: 'Vista de proyectos activos' },
      { name: 'Cronograma Gantt', id: 'hub-gantt', icon: 'calendar', href: '/dashboard/proyectos?section=gantt', description: 'Línea de tiempo' },
      { name: 'Control Costos', id: 'hub-costos-proy', icon: 'cash', href: '/dashboard/proyectos?section=costos', description: 'Margen vs presupuesto' },
      { name: 'Hitos', id: 'hub-hitos', icon: 'checkmark-circle', href: '/dashboard/proyectos?section=hitos', description: 'Gestión de entregables' },
    ],
  },
  {
    id: 'taskforce', name: 'Soporte', icon: 'headset', color: '#EF4444',
    description: 'Soporte, incidencias y excepciones operativas.',
    items: [
      { name: 'Bandeja Tickets', id: 'hub-tickets', icon: 'mail', href: '/dashboard/support', description: 'Tickets activos' },
      { name: 'SLA Dashboard', id: 'hub-sla', icon: 'bar-chart', href: '/dashboard/support/analytics', description: 'Tiempos de respuesta' },
      { name: 'Incidencias Críticas', id: 'hub-incidencias', icon: 'alert-circle', href: '/dashboard/support?status=CRITICAL', description: 'Alta prioridad' },
    ],
  },
  {
    id: 'strategy', name: 'Estrategia', icon: 'trending-up', color: '#F59E0B',
    description: 'Inteligencia de negocio, proyecciones y rentabilidad.',
    items: [
      { name: 'Executive Snapshot', id: 'hub-snapshot', icon: 'grid', href: '/dashboard/strategy', description: 'Vista estratégica' },
      { name: 'Cashflow Forecast', id: 'hub-cashflow', icon: 'trending-up', href: '/dashboard/strategy/cashflow', description: 'Proyección a 90 días' },
      { name: 'Profitability', id: 'hub-profitability', icon: 'pulse', href: '/dashboard/strategy/profitability', description: 'Rentabilidad clientes/proyectos' },
      { name: 'Recomendaciones IA', id: 'hub-ia-recs', icon: 'sparkles', href: '/dashboard/strategy/recommendations', description: 'Sugerencias de Gemma' },
    ],
  },
  {
    id: 'assets', name: 'Activos', icon: 'cube', color: '#64748B',
    description: 'Activos internos, hardware, licencias y vehículos.',
    items: [
      { name: 'Inventario Activos', id: 'hub-assets', icon: 'cube', href: '/dashboard/assets', description: 'Equipos y licencias' },
      { name: 'Asignaciones', id: 'hub-assignments', icon: 'people', href: '/dashboard/assets/assignments', description: 'Control por empleado' },
      { name: 'Mantenimiento', id: 'hub-maintenance', icon: 'pulse', href: '/dashboard/assets/maintenance', description: 'Alertas preventivas' },
      { name: 'Trazabilidad Trust', id: 'hub-assets-trust', icon: 'shield-checkmark', href: '/dashboard/assets/trust', description: 'Registro inmutable' },
    ],
  },
  {
    id: 'knowledge', name: 'Conocimiento', icon: 'book', color: '#06B6D4',
    description: 'Memoria organizacional, SOPs y políticas internas.',
    items: [
      { name: 'Base Conocimiento', id: 'hub-knowledge', icon: 'book', href: '/dashboard/knowledge', description: 'Artículos y políticas' },
      { name: 'Favoritos', id: 'hub-knowledge-favs', icon: 'star', href: '/dashboard/knowledge?filter=favs', description: 'Acceso rápido' },
      { name: 'Cosecha Soporte', id: 'hub-knowledge-harvest', icon: 'sync', href: '/dashboard/knowledge?filter=harvest', description: 'Lecciones aprendidas' },
    ],
  },
  {
    id: 'perfil', name: 'Perfil', icon: 'person', color: '#6366F1',
    description: 'Ajustes personales y tarjeta digital.',
    items: [
      { name: 'Mi Perfil', id: 'hub-perfil', icon: 'person', href: '/dashboard/perfil?section=datos', description: 'Datos personales' },
      { name: 'Seguridad', id: 'hub-seguridad', icon: 'shield-checkmark', href: '/dashboard/perfil?section=seguridad', description: 'Cambio de contraseña' },
      { name: 'Agendamiento', id: 'hub-agendamiento', icon: 'calendar', href: '/dashboard/perfil?section=agendamiento', description: 'Links de reserva' },
      { name: 'Telefonía', id: 'hub-perfil-telefonia', icon: 'call', href: '/dashboard/perfil?section=zadarma', description: 'Extensión Zadarma' },
      { name: 'Notificaciones', id: 'hub-perfil-notif', icon: 'notifications', href: '/dashboard/perfil?section=notificaciones', description: 'Alertas' },
      { name: 'IA Agent Skills', id: 'hub-agent-skills', icon: 'hardware-chip', href: '/dashboard/perfil?section=agent-skills', description: 'Conecta tu asistente' },
      { name: 'Canal Denuncias', id: 'hub-denuncias', icon: 'warning', href: '/dashboard/perfil?section=denuncias', description: 'Buzón confidencial' },
      { name: 'Mi Tarjeta', id: 'hub-mi-tarjeta', icon: 'card', href: '/dashboard/perfil?section=mi-tarjeta', description: 'Tarjeta digital' },
    ],
  },
  {
    id: 'configuracion', name: 'Configuración', icon: 'settings', color: '#6B7280',
    description: 'Ajustes del sistema, marca blanca e integraciones.',
    items: [
      { name: 'Empresa', id: 'hub-config-empresa', icon: 'business', href: '/dashboard/configuracion?section=empresa', description: 'Datos empresariales' },
      { name: 'Horarios', id: 'hub-config-horarios', icon: 'time', href: '/dashboard/configuracion?section=horarios', description: 'Disponibilidad' },
      { name: 'Notificaciones', id: 'hub-config-notif', icon: 'notifications', href: '/dashboard/configuracion?section=notificaciones', description: 'Alertas y correos' },
      { name: 'Config. Fiscal', id: 'hub-config-fiscal', icon: 'calculator', href: '/dashboard/configuracion?section=fiscal', description: 'Facturación e impuestos' },
      { name: 'Telefonía', id: 'hub-config-telefonia', icon: 'call', href: '/dashboard/configuracion?section=telefonia', description: 'Líneas y desvíos' },
      { name: 'Reparto Leads', id: 'hub-config-reparto', icon: 'sync', href: '/dashboard/configuracion?section=reparto', description: 'Asignación ejecutivos' },
      { name: 'Campos Leads', id: 'hub-config-campos', icon: 'list', href: '/dashboard/configuracion?section=leads', description: 'Personalización' },
      { name: 'Documentos', id: 'hub-config-docs', icon: 'document-text', href: '/dashboard/configuracion?section=documentos', description: 'Ajustes contratos' },
      { name: 'Canal Igualdad', id: 'hub-config-igualdad', icon: 'shield-checkmark', href: '/dashboard/configuracion?section=igualdad', description: 'Denuncias e inmutabilidad' },
      { name: 'Marca Blanca', id: 'hub-config-whitelabel', icon: 'color-palette', href: '/dashboard/configuracion?section=whitelabel', description: 'Personalización gráfica' },
      { name: 'Equipo', id: 'hub-config-equipo', icon: 'people', href: '/dashboard/equipo', description: 'Gestión de usuarios' },
      { name: 'Integraciones', id: 'hub-config-integraciones', icon: 'globe', href: '/dashboard/integraciones', description: 'Conexión con apps' },
      { name: 'Mi Suscripción', id: 'hub-config-billing', icon: 'card', href: '/dashboard/configuracion/billing', description: 'Suscripción y pagos' },
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────
class HubsService {
  getCategories(): HubCategory[] {
    return HUBS_CONFIG.map(hub => ({
      id: hub.id,
      name: hub.name,
      icon: hub.icon,
      color: hub.color,
      description: hub.description,
      moduleCount: hub.items.length,
    }));
  }

  getModules(): HubModule[] {
    const modules: HubModule[] = [];
    for (const hub of HUBS_CONFIG) {
      for (const item of hub.items) {
        modules.push({
          id: item.id,
          name: item.name,
          icon: item.icon,
          color: hub.color,
          categoryId: hub.id,
          categoryName: hub.name,
          hubHref: item.href,
          description: item.description,
        });
      }
    }
    return modules;
  }

  getModulesByCategory(categoryId: string): HubModule[] {
    return this.getModules().filter(m => m.categoryId === categoryId);
  }

  getCategory(categoryId: string): HubCategory | undefined {
    return this.getCategories().find(c => c.id === categoryId);
  }

  getModule(moduleId: string): HubModule | undefined {
    return this.getModules().find(m => m.id === moduleId);
  }

  searchModules(query: string): HubModule[] {
    const q = query.toLowerCase();
    return this.getModules().filter(
      m =>
        m.name.toLowerCase().includes(q) ||
        m.categoryName.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );
  }

  get totalModules(): number {
    return this.getModules().length;
  }

  get totalCategories(): number {
    return this.getCategories().length;
  }
}

export const hubsService = new HubsService();
