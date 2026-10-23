/**
 * crm-pricing.ts
 *
 * FUENTE ÚNICA de la escalera de CRM & Ventas: niveles, precio por usuario,
 * tramos de volumen y qué incluye cada nivel.
 *
 * POR QUÉ EXISTE
 * El CRM se vendía a un precio plano de 49 €/mes, que premiaba al equipo de 40
 * personas y castigaba al de dos. Esta escalera cobra por usuario, como Vtiger
 * (One Growth $12/usuario/mes con funciones recortadas, One Professional $30) y
 * Odoo (Standard 11,90 €/usuario/mes anual, todos los módulos incluidos): el
 * precio de entrada ronda los 12 € y cada nivel añade funciones, no asientos.
 *
 * POR QUÉ LOS TRAMOS SON MARGINALES
 * Un descuento "de todo o nada" por volumen produce acantilados: al llegar a
 * 100 usuarios la factura BAJABA respecto a 99, porque el descuento se aplicaba
 * a los cien asientos a la vez. Aquí cada tramo descuenta solo los asientos que
 * caen dentro de él, como los tramos de IRPF: añadir un usuario nunca abarata
 * la factura y el precio medio baja de forma monótona. Eso es lo que hace
 * defendible decir "desde 12 €" y, a la vez, cobrar 8 €/usuario a quien compra
 * mil asientos.
 *
 * LO QUE NO HACE
 * No decide el cobro ni las puertas: eso vive en el checkout y en
 * `lib/crm-entitlements.ts`. Aquí solo hay números y límites, para que la web,
 * el cobro, el dossier y los tests lean exactamente lo mismo.
 *
 * MÓDULO PURO: no importa Prisma ni Next; lo consumen componentes de cliente.
 */

export type CrmTierId = 'esencial' | 'profesional' | 'avanzado'
export type CrmInterval = 'monthly' | 'yearly'

export interface CrmTierLimits {
  /** Embudos activos que puede tener el tenant. */
  maxPipelines: number
  /** Reglas de automatización activas. */
  maxAutomations: number
  /** Deal Coach, resumen de IA y siguiente acción. */
  ai: boolean
  /** API pública, claves y servidor MCP. */
  api: boolean
  /** Contratos y firma digital desde una cotización. */
  contracts: boolean
  /** Previsión y resultados por comercial. */
  forecast: boolean
  /** Roleplay de entrenamiento (Sales Academy). */
  academy: boolean
}

export interface CrmTier {
  id: CrmTierId
  name: string
  tagline: string
  audience: string
  /** €/usuario/mes con facturación mensual, impuestos no incluidos. */
  monthly: number
  /** €/usuario/mes con facturación anual (se cobra el año completo). */
  annualMonthly: number
  features: string[]
  limits: CrmTierLimits
}

export const CRM_TRIAL_DAYS = 14

export const CRM_TIERS: CrmTier[] = [
  {
    id: 'esencial',
    name: 'Esencial',
    tagline: 'Deja el Excel sin pagar por funciones que no usas.',
    audience: 'Equipos de 1 a 10 comerciales',
    monthly: 15,
    annualMonthly: 12,
    features: [
      'Embudo visual (1 embudo)',
      'Leads, contactos y empresas',
      'Tareas, citas e historial',
      'Cotizaciones simples',
      '2 automatizaciones',
      'Informes básicos',
    ],
    limits: {
      maxPipelines: 1,
      maxAutomations: 2,
      ai: false,
      api: false,
      contracts: false,
      forecast: false,
      academy: false,
    },
  },
  {
    id: 'profesional',
    name: 'Profesional',
    tagline: 'El seguimiento completo, del presupuesto a la firma.',
    audience: 'Equipos de 5 a 50 comerciales',
    monthly: 29,
    annualMonthly: 24,
    features: [
      'Todo lo de Esencial',
      'Embudos ilimitados',
      'Cotizaciones con aviso de apertura',
      'Contratos y firma digital',
      'Previsión y resultados por comercial',
      'Automatizaciones ilimitadas',
    ],
    limits: {
      maxPipelines: 10,
      maxAutomations: 100,
      ai: false,
      api: false,
      contracts: true,
      forecast: true,
      academy: false,
    },
  },
  {
    id: 'avanzado',
    name: 'Avanzado',
    tagline: 'La IA que dice a quién llamar y el entrenamiento para hacerlo bien.',
    audience: 'Equipos de 10 o más comerciales',
    monthly: 49,
    annualMonthly: 39,
    features: [
      'Todo lo de Profesional',
      'IA: siguiente acción y riesgo',
      'Roleplay de ventas',
      'API y servidor MCP',
      'Auditoría de decisiones de IA',
      'Soporte prioritario',
    ],
    limits: {
      maxPipelines: 25,
      maxAutomations: 500,
      ai: true,
      api: true,
      contracts: true,
      forecast: true,
      academy: true,
    },
  },
]

export const CRM_TIER_IDS: CrmTierId[] = CRM_TIERS.map((t) => t.id)

export function getCrmTier(id: string | null | undefined): CrmTier | null {
  return CRM_TIERS.find((t) => t.id === id) ?? null
}

export function isCrmTier(id: string | null | undefined): id is CrmTierId {
  return CRM_TIER_IDS.includes(id as CrmTierId)
}

/** Precio de entrada: el nivel más barato, en su modalidad anual. */
export const CRM_ENTRY_PRICE = Math.min(...CRM_TIERS.map((t) => t.annualMonthly))

/* ─── Volumen ─────────────────────────────────────────────────────────────── */

export interface CrmVolumeBand {
  from: number
  /** `null` = sin tope. */
  to: number | null
  /** Descuento que se aplica SOLO a los asientos de este tramo (0.10 = 10 %). */
  discount: number
  label: string
}

/**
 * Tramos marginales, de menor a mayor. El descuento de cada tramo se aplica
 * únicamente a los usuarios que caen dentro de él.
 *
 * Los porcentajes siguen la horquilla que se negocia en el mercado para
 * contratos de este tamaño (0–10 % por debajo de 50 asientos y 15–30 % entre
 * 200 y 1.000), llevada al extremo alto porque aquí no hay implantación ni
 * comercial de por medio: el cliente se autosirve.
 */
export const CRM_VOLUME_BANDS: CrmVolumeBand[] = [
  { from: 1, to: 9, discount: 0, label: 'Tarifa de lista' },
  { from: 10, to: 24, discount: 0.1, label: '10 % en este tramo' },
  { from: 25, to: 49, discount: 0.15, label: '15 % en este tramo' },
  { from: 50, to: 99, discount: 0.2, label: '20 % en este tramo' },
  { from: 100, to: 249, discount: 0.25, label: '25 % en este tramo' },
  { from: 250, to: 499, discount: 0.3, label: '30 % en este tramo' },
  { from: 500, to: 999, discount: 0.35, label: '35 % en este tramo' },
  { from: 1000, to: null, discount: 0.4, label: '40 % en este tramo' },
]

/**
 * Hasta aquí se contrata en línea. Por encima, el precio es a medida: a partir
 * de mil asientos entran en juego condiciones de contrato (facturación anual
 * comprometida, SSO, soporte dedicado) que no caben en un checkout.
 */
export const CRM_MAX_SELF_SERVE_SEATS = 1000

/** Puntos que publica la web para enseñar cómo baja el precio medio. */
export const CRM_LADDER_SEATS = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const

export function getCrmVolumeBand(seats: number): CrmVolumeBand {
  const band = CRM_VOLUME_BANDS.find(
    (b) => seats >= b.from && (b.to === null || seats <= b.to),
  )
  return band ?? CRM_VOLUME_BANDS[CRM_VOLUME_BANDS.length - 1]
}

/* ─── Cálculo ─────────────────────────────────────────────────────────────── */

export interface CrmBracketLine {
  /** Primer asiento del tramo que realmente se usa. */
  from: number
  /** Último asiento del tramo que realmente se usa. */
  to: number
  /** Asientos de este tramo. */
  seats: number
  /** €/usuario/mes dentro de este tramo, ya con su descuento. */
  perUserMonth: number
  discount: number
  label: string
  /** Importe del periodo (mes o año) por los asientos de este tramo. */
  amount: number
}

export interface CrmPriceInput {
  tier: CrmTierId | string
  interval: CrmInterval
  seats: number
}

export interface CrmPriceResult {
  tier: CrmTier
  interval: CrmInterval
  seats: number
  /** €/usuario/mes de lista para esa modalidad y nivel. */
  listPerUser: number
  /** €/usuario/mes de media tras aplicar todos los tramos. */
  perUser: number
  /** Descuento medio efectivo sobre la tarifa de lista (0.083 = 8,3 %). */
  discount: number
  /** Lo que se cobra en cada periodo (mes o año). */
  billedAmount: number
  /** Equivalente mensual total, para comparar modalidades. */
  monthlyEquivalent: number
  /** Ahorro anual frente a pagar mes a mes. */
  annualSaving: number
  /** Por encima de 1.000 asientos no se cobra online: se negocia. */
  custom: boolean
  /** Etiqueta del tramo más alto alcanzado. */
  bandLabel: string
  /** Desglose por tramos, para explicar el precio medio. */
  brackets: CrmBracketLine[]
}

function redondearEuros(value: number): number {
  return Math.round(value * 100) / 100
}

interface Desglose {
  lineas: CrmBracketLine[]
  /** Importe del periodo en céntimos, sin redondear por asiento. */
  totalCentimos: number
  factorAnio: number
}

/**
 * Reparte los asientos por tramos y suma el importe del periodo en céntimos.
 * Se trabaja en céntimos enteros para no arrastrar errores de coma flotante en
 * facturas de mil líneas.
 */
function desglosar(tier: CrmTier, interval: CrmInterval, seats: number): Desglose {
  const factorAnio = interval === 'yearly' ? 12 : 1
  const listaMes = interval === 'yearly' ? tier.annualMonthly : tier.monthly
  const lineas: CrmBracketLine[] = []
  let pendientes = seats
  let totalCentimos = 0

  for (const band of CRM_VOLUME_BANDS) {
    if (pendientes <= 0) break

    const capacidad = band.to === null ? pendientes : band.to - band.from + 1
    const enTramo = Math.min(pendientes, capacidad)
    if (enTramo <= 0) continue

    const primerAsiento = seats - pendientes + 1
    const precioMesCentimos = Math.round(listaMes * (1 - band.discount) * 100)
    const importeCentimos = precioMesCentimos * enTramo * factorAnio

    lineas.push({
      from: primerAsiento,
      to: primerAsiento + enTramo - 1,
      seats: enTramo,
      perUserMonth: precioMesCentimos / 100,
      discount: band.discount,
      label: band.label,
      amount: importeCentimos / 100,
    })

    totalCentimos += importeCentimos
    pendientes -= enTramo
  }

  return { lineas, totalCentimos, factorAnio }
}

/**
 * Calcula lo que se cobra. `billedAmount` es el importe del periodo:
 *  - monthly: suma de (asientos del tramo × €/usuario/mes del tramo)
 *  - yearly: suma de (asientos del tramo × €/usuario/mes anual × 12)
 *
 * El precio anual ya lleva el descuento de pagar el año completo; los tramos de
 * volumen se aplican encima, igual que en el checkout.
 */
export function calcularPrecioCrm(input: CrmPriceInput): CrmPriceResult {
  const tier = getCrmTier(input.tier)
  if (!tier) throw new Error(`Nivel de CRM desconocido: ${input.tier}`)
  if (!Number.isFinite(input.seats) || input.seats < 1) {
    throw new Error('El número de usuarios debe ser al menos 1')
  }

  const seats = Math.floor(input.seats)
  const custom = seats > CRM_MAX_SELF_SERVE_SEATS
  const listPerUser = input.interval === 'yearly' ? tier.annualMonthly : tier.monthly
  const { lineas, totalCentimos, factorAnio } = desglosar(tier, input.interval, seats)

  if (custom) {
    return {
      tier,
      interval: input.interval,
      seats,
      listPerUser,
      perUser: 0,
      discount: 0,
      billedAmount: 0,
      monthlyEquivalent: 0,
      annualSaving: 0,
      custom: true,
      bandLabel: getCrmVolumeBand(seats).label,
      brackets: lineas,
    }
  }

  const billedAmount = totalCentimos / 100
  const perUser = Math.round(totalCentimos / factorAnio / seats) / 100
  const monthlyEquivalent = redondearEuros(
    factorAnio === 12 ? totalCentimos / 100 / 12 : billedAmount,
  )
  const monthlyTotal = redondearEuros(desglosar(tier, 'monthly', seats).totalCentimos / 100)
  const annualSaving = input.interval === 'yearly'
    ? redondearEuros(monthlyTotal * 12 - billedAmount)
    : 0

  return {
    tier,
    interval: input.interval,
    seats,
    listPerUser,
    perUser,
    discount: listPerUser > 0
      ? Math.round((1 - perUser / listPerUser) * 10000) / 10000
      : 0,
    billedAmount,
    monthlyEquivalent,
    annualSaving,
    custom: false,
    bandLabel: lineas[lineas.length - 1]?.label ?? CRM_VOLUME_BANDS[0].label,
    brackets: lineas,
  }
}

/** Formato español sin decimales cuando el importe es entero. */
export function formatearEuros(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}
