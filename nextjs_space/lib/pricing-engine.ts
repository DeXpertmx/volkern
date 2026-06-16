/**
 * pricing-engine.ts
 *
 * Motor de pricing dinámico para la página /precios.
 * Calcula el precio en función de usuarios, contactos y plan (scale/compliance).
 *
 * Fórmula: precio = (precio_base + (usuarios * 8) + ((contactos / 1000) * 3)) * factor_nivel * multiplicador_plan
 */

/* ─── Configuración ────────────────────────────────────────────────────────── */

export interface NivelConfig {
  nivel: number
  usuarios_max: number
  contactos_max: number
  factor: number
  facturacion: string
  automatizacion: string
  mensaje: string
}

export interface PlanConfig {
  multiplicador: number
  features_extra: string[]
}

export interface PricingConfig {
  config: {
    precio_base: number
    max_usuarios: number
    max_contactos: number
    bloque_contactos: number
  }
  niveles: NivelConfig[]
  planes: Record<'scale' | 'compliance', PlanConfig>
  mensajes_limite: {
    alto_volumen: string
    maximo: string
  }
}

const PRICING_CONFIG: PricingConfig = {
  config: {
    precio_base: 50,
    max_usuarios: 99,
    max_contactos: 99000,
    bloque_contactos: 1000,
  },
  niveles: [
    { nivel: 1, usuarios_max: 2, contactos_max: 2000, factor: 1.0, facturacion: 'Facturación estándar', automatizacion: 'Automatización básica', mensaje: 'Empieza tu operación' },
    { nivel: 2, usuarios_max: 5, contactos_max: 8000, factor: 1.4, facturacion: 'Facturación ampliada', automatizacion: 'Automatización mejorada', mensaje: 'Tu negocio está creciendo' },
    { nivel: 3, usuarios_max: 10, contactos_max: 15000, factor: 1.8, facturacion: 'Mayor capacidad de facturación', automatizacion: 'Automatización media', mensaje: 'Escalando tu operación' },
    { nivel: 4, usuarios_max: 20, contactos_max: 30000, factor: 2.5, facturacion: 'Facturación de alto volumen', automatizacion: 'Automatización estructurada', mensaje: 'Mayor capacidad operativa' },
    { nivel: 5, usuarios_max: 40, contactos_max: 60000, factor: 3.5, facturacion: 'Facturación empresarial', automatizacion: 'Automatización avanzada', mensaje: 'Operación consolidada' },
    { nivel: 6, usuarios_max: 70, contactos_max: 85000, factor: 4.5, facturacion: 'Procesamiento masivo de facturas', automatizacion: 'Automatización avanzada + lógica', mensaje: 'Alto volumen de trabajo' },
    { nivel: 7, usuarios_max: 99, contactos_max: 99000, factor: 6.0, facturacion: 'Capacidad operativa ilimitada', automatizacion: 'Automatización completa', mensaje: 'Infraestructura crítica' },
  ],
  planes: {
    scale: { multiplicador: 1.0, features_extra: [] },
    compliance: {
      multiplicador: 1.25,
      features_extra: [
        'Trazabilidad completa',
        'Procesos auditables',
        'Control y validación de operaciones',
        'Gestión documental certificada',
      ],
    },
  },
  mensajes_limite: {
    alto_volumen: 'Tu operación requiere una configuración avanzada',
    maximo: 'Tu operación requiere un plan personalizado',
  },
}

/* ─── Tipos públicos ───────────────────────────────────────────────────────── */

export type PlanTipo = 'scale' | 'compliance'

export interface PricingInput {
  usuarios: number
  contactos: number
  plan: PlanTipo
}

export interface PricingResult {
  nivel: number
  precio: number
  mensaje: string
  facturacion: string
  automatizacion: string
  features: string[]
  esMaximo: boolean
  esAltoVolumen: boolean
  input: PricingInput
}

/* ─── Motor ────────────────────────────────────────────────────────────────── */

/** Determina el nivel según usuarios y contactos */
export function getNivel(usuarios: number, contactos: number): NivelConfig {
  for (const nivel of PRICING_CONFIG.niveles) {
    if (usuarios <= nivel.usuarios_max && contactos <= nivel.contactos_max) {
      return nivel
    }
  }
  return PRICING_CONFIG.niveles[PRICING_CONFIG.niveles.length - 1]
}

/** Calcula el precio base antes del factor de nivel y multiplicador de plan */
function calcularBase(usuarios: number, contactos: number): number {
  const { precio_base, bloque_contactos } = PRICING_CONFIG.config
  return precio_base + (usuarios * 8) + ((contactos / bloque_contactos) * 3)
}

/** Calcula el precio final con la fórmula completa */
export function calcularPrecio(input: PricingInput): PricingResult {
  const { usuarios, contactos, plan } = input
  const nivelCfg = getNivel(usuarios, contactos)
  const planCfg = PRICING_CONFIG.planes[plan]
  const base = calcularBase(usuarios, contactos)
  const precio = Math.round(base * nivelCfg.factor * planCfg.multiplicador)

  const features: string[] = [
    nivelCfg.facturacion,
    nivelCfg.automatizacion,
    ...planCfg.features_extra,
  ]

  const esMaximo = usuarios >= PRICING_CONFIG.config.max_usuarios || contactos >= PRICING_CONFIG.config.max_contactos
  const esAltoVolumen = nivelCfg.nivel >= 5 && !esMaximo

  return {
    nivel: nivelCfg.nivel,
    precio,
    mensaje: nivelCfg.mensaje,
    facturacion: nivelCfg.facturacion,
    automatizacion: nivelCfg.automatizacion,
    features,
    esMaximo,
    esAltoVolumen,
    input,
  }
}

/* ─── Helpers para la UI ───────────────────────────────────────────────────── */

export function getMensajeLimite(esMaximo: boolean, esAltoVolumen: boolean): string | null {
  if (esMaximo) return PRICING_CONFIG.mensajes_limite.maximo
  if (esAltoVolumen) return PRICING_CONFIG.mensajes_limite.alto_volumen
  return null
}

export function getNiveles(): NivelConfig[] {
  return PRICING_CONFIG.niveles
}

export function getConfig() {
  return PRICING_CONFIG.config
}

/* ─── Tabla comparativa ────────────────────────────────────────────────────── */

export interface ComparisonRow {
  feature: string
  scale: string
  compliance: string
}

export function getComparisonTable(_nivel?: number): ComparisonRow[] {
  return [
    { feature: 'CRM y ventas', scale: '✔', compliance: '✔' },
    { feature: 'Marketing y automatización', scale: '✔', compliance: '✔' },
    { feature: 'Facturación', scale: 'Escalable', compliance: 'Avanzada' },
    { feature: 'Gestión documental', scale: '✔', compliance: '✔' },
    { feature: 'Firma digital', scale: '✔', compliance: '✔' },
    { feature: 'Integraciones', scale: '✔', compliance: '✔' },
    { feature: 'Auditoría', scale: '—', compliance: '✔' },
    { feature: 'Trazabilidad', scale: '—', compliance: '✔' },
    { feature: 'Control fiscal', scale: '—', compliance: '✔' },
  ]
}
