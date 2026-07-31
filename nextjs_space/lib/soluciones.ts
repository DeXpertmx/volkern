/**
 * Shared solution/ecosystem module definitions.
 * Pure data — no React or client dependencies.
 * Used by EcosistemaLanding and /soluciones index page.
 */

export interface SolutionModule {
  name: string;
  description: string;
  href: string;
  color: string;
  iconKey: string;
}

export const SOLUTION_MODULES: SolutionModule[] = [
  {
    iconKey: 'Zap',
    color: 'blue',
    name: 'CRM & Ventas',
    description:
      'Gestiona oportunidades, automatiza seguimiento y cierra más negocios.',
    href: '/soluciones/crm-ventas',
  },
  {
    iconKey: 'PenTool',
    color: 'purple',
    name: 'Marketing',
    description:
      'Captación de leads, automatización de campañas y gestión de comunicación.',
    href: '/soluciones/marketing',
  },
  {
    iconKey: 'Building2',
    color: 'emerald',
    name: 'Real Estate',
    description:
      'Gestión de propiedades, clientes y procesos comerciales inmobiliarios.',
    href: '/soluciones/real-estate',
  },
  {
    iconKey: 'Calculator',
    color: 'amber',
    name: 'Accounting',
    description:
      'Control financiero, facturación y organización administrativa.',
    href: '/soluciones/accounting',
  },
  {
    iconKey: 'UserCheck',
    color: 'rose',
    name: 'Recursos Humanos',
    description:
      'Gestión de personal, procesos internos y seguimiento organizacional.',
    href: '/soluciones/rrhh',
  },
  {
    iconKey: 'Factory',
    color: 'slate',
    name: 'Industria',
    description:
      'Optimización de procesos operativos y control de producción.',
    href: '/soluciones/industria',
  },
  {
    iconKey: 'GraduationCap',
    color: 'yellow',
    name: 'Academy',
    description:
      'Formación, gestión de contenido y capacitación interna o externa.',
    href: '/soluciones/academy',
  },
  {
    iconKey: 'Receipt',
    color: 'green',
    name: 'Facturación',
    description:
      'Facturación, cobros y catálogo para autónomos y pymes. Sin complicaciones.',
    href: '/soluciones/facturacion',
  },
  {
    iconKey: 'Shield',
    color: 'sky',
    name: 'Insurance',
    description:
      'Cartera inteligente, renovaciones automáticas e IA que detecta oportunidades de venta cruzada.',
    href: '/soluciones/seguros',
  },
];

export const COLOR_MAP: Record<
  string,
  { bg: string; border: string; icon: string; glow: string; badge: string }
> = {
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20 hover:border-blue-500/40',
    icon: 'text-blue-400',
    glow: 'bg-blue-500/5',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20 hover:border-purple-500/40',
    icon: 'text-purple-400',
    glow: 'bg-purple-500/5',
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
    icon: 'text-emerald-400',
    glow: 'bg-emerald-500/5',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    icon: 'text-amber-400',
    glow: 'bg-amber-500/5',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20 hover:border-rose-500/40',
    icon: 'text-rose-400',
    glow: 'bg-rose-500/5',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  slate: {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20 hover:border-slate-500/40',
    icon: 'text-slate-400',
    glow: 'bg-slate-500/5',
    badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20 hover:border-yellow-500/40',
    icon: 'text-yellow-400',
    glow: 'bg-yellow-500/5',
    badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  green: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/20 hover:border-green-500/40',
    icon: 'text-green-400',
    glow: 'bg-green-500/5',
    badge: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  sky: {
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20 hover:border-sky-500/40',
    icon: 'text-sky-400',
    glow: 'bg-sky-500/5',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  },
};


