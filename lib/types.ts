
export interface Lead {
  id: string
  nombre: string
  email: string
  telefono?: string | null
  notas?: string | null
  estado: string
  fechaCreacion: Date
  fechaActualizacion: Date
  citas?: Cita[]
}

export interface Servicio {
  id: string
  nombre: string
  descripcion?: string | null
  duracionMinutos: number
  precio: number
  moneda: string
  activo: boolean
  fechaCreacion: Date
  fechaActualizacion: Date
  citas?: Cita[]
}

export interface Cita {
  id: string
  leadId: string
  servicioId: string
  fechaHora: Date
  estado: string
  montoPagado?: number | null
  stripePaymentId?: string | null
  fechaCreacion: Date
  fechaActualizacion: Date
  lead?: Lead
  servicio?: Servicio
}

export interface Configuracion {
  id: string
  clave: string
  valor: string
  fechaActualizacion: Date
}

export const EstadosLead = {
  NUEVO: 'nuevo',
  CONTACTADO: 'contactado',
  CONVERTIDO: 'convertido',
  PERDIDO: 'perdido'
} as const

export const EstadosCita = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  PAGADA: 'pagada',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada'
} as const

export const Monedas = {
  USD: 'USD',
  MXN: 'MXN',
  EUR: 'EUR',
  COP: 'COP'
} as const

export interface DashboardStats {
  totalLeads: number
  citasHoy: number
  citasPendientes: number
  ingresosMes: number
  ingresosDiarios: { fecha: string; ingresos: number }[]
  proximasCitas: Cita[]
}

// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role?: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
  }
}
