/**
 * Adaptador Kyero — feed XML V3 (especificación 3.9.1).
 *
 * Kyero es *pull*: ellos descargan `GET /feeds/{token}`. Por eso `deliver` no
 * sube nada: construye y valida el documento, y el orquestador sirve ese mismo
 * documento. El fichero solo puede originarse aquí.
 *
 * Fuente: https://help.kyero.com/es/especificaciones-de-importación-xml-a-kyero.com
 * XSD oficial: http://feeds.kyero.com/assets/kyeroV3.0.xsd (copia en
 * `lib/portals/schemas/kyero_v3.xsd`, validada con libxmljs2).
 */

import fs from 'fs'
import path from 'path'
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers'
import {
  PortalFeedError,
  PortalSkipError,
  type DeliveryContext,
  type DeliveryResult,
  type MappedProperty,
  type MapContext,
  type PortalAdapter,
  type PortalConfig,
  type PortalValidation,
} from '../types'

export const KYERO_KEY = 'kyero' as const
const MAX_IMAGES = 50
const MAX_PRICE_DIGITS = 8

/** Tipos de inmueble del maestro (español) → tipo Kyero (inglés, ASCII). */
const TYPE_MAP: Record<string, string> = {
  casa: 'house',
  chalet: 'villa',
  villa: 'villa',
  departamento: 'apartment',
  apartamento: 'apartment',
  piso: 'apartment',
  atico: 'penthouse',
  penthouse: 'penthouse',
  duplex: 'duplex',
  estudio: 'studio',
  loft: 'studio',
  local: 'commercial',
  'local comercial': 'commercial',
  oficina: 'office',
  nave: 'industrial',
  'nave industrial': 'industrial',
  bodega: 'commercial',
  terreno: 'land',
  solar: 'land',
  parcela: 'land',
  finca: 'country house',
  rancho: 'country house',
  'casa de campo': 'country house',
  edificio: 'building',
  garage: 'garage',
  cochera: 'garage',
  estacionamiento: 'garage',
  trastero: 'storage',
}

const FEATURES: Array<{ test: (p: InmuebleParsed) => boolean; label: string }> = [
  { test: (p) => p.hasPool, label: 'private pool' },
  { test: (p) => p.hasGarden, label: 'garden' },
  { test: (p) => p.hasTerrace, label: 'terrace' },
  { test: (p) => p.hasBalcony, label: 'balcony' },
  { test: (p) => p.hasElevator, label: 'lift' },
  { test: (p) => p.hasParking, label: 'parking' },
  { test: (p) => p.hasStorageRoom, label: 'storage room' },
  { test: (p) => p.furnished, label: 'furnished' },
  { test: (p) => p.hasAirConditioning, label: 'air conditioning' },
  { test: (p) => p.hasHeating, label: 'heating' },
]

/** Minúsculas y sin diacríticos: «Ático» y «atico» caen en la misma clave. */
function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function escapeXml(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function etiqueta(nombre: string, valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (texto === '') return `    <${nombre}/>`
  return `    <${nombre}>${escapeXml(texto)}</${nombre}>`
}

/** Kyero exige `YYYY-MM-DD HH:MM:SS` (sin zona, en UTC). */
export function kyeroDate(fecha: Date): string {
  const iso = fecha.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}

/** Texto plano: el feed no admite HTML (la descripción del editor puede traerlo). */
function textoPlano(valor: string | null | undefined): string {
  if (!valor) return ''
  return valor
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function imagenesDe(media: unknown): string[] {
  if (!media) return []
  if (Array.isArray(media)) {
    return media
      .map((m: any) => (typeof m === 'string' ? m : m?.url || m?.src || ''))
      .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
  }
  if (typeof media === 'object') {
    return Object.values(media as Record<string, any>)
      .map((v: any) => (typeof v === 'string' ? v : v?.url || v?.src || ''))
      .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
  }
  return []
}

/**
 * Kyero solo acepta URLs absolutas que terminen en una extensión de imagen y
 * que se puedan descargar. Las imágenes demo (`images.unsplash.com/photo-…`)
 * no cumplen el patrón: se descartan en vez de invalidar el feed entero.
 */
export function imagenesValidas(media: unknown, baseUrl: string): string[] {
  const vistos = new Set<string>()
  const salida: string[] = []

  for (const bruta of imagenesDe(media)) {
    let url = bruta.trim()
    if (url.startsWith('/')) url = `${baseUrl.replace(/\/$/, '')}${url}`
    url = url.replace(/^http:\/\//i, 'https://')
    if (!/^(https?|ftp):\/\/\S+\.(gif|jpe?g|png)$/i.test(url)) continue
    if (vistos.has(url)) continue
    vistos.add(url)
    salida.push(url)
    if (salida.length === MAX_IMAGES) break
  }
  return salida
}

function tipoKyero(tipo: string | null, config: PortalConfig): string {
  if (!tipo) return 'house'
  const clave = normalizar(tipo)

  for (const [origen, destino] of Object.entries(config.typeMap || {})) {
    if (normalizar(origen) === clave) {
      return normalizarTipoKyero(destino)
    }
  }
  return TYPE_MAP[clave] || 'house'
}

/** El XSD solo admite letras, espacios, `&`, paréntesis, `/` y `-`. */
function normalizarTipoKyero(valor: string): string {
  const limpio = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z&\s()/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio.length >= 3 ? limpio : 'house'
}

function precioFrecuencia(operacion: string | null): 'sale' | 'month' | null {
  if (operacion === 'venta') return 'sale'
  if (operacion === 'alquiler') return 'month'
  // `alquiler_temporada` y `traspaso` no existen en Kyero: se omiten.
  return null
}

function descripcionDe(p: InmuebleParsed, town: string, province: string): string {
  const propia = textoPlano(p.longDescription) || textoPlano(p.descripcion)
  if (propia) return propia

  const partes: string[] = [`${p.propertyType || 'Inmueble'} en ${p.operationType || 'venta'} en ${town}`]
  if (province) partes[0] += `, ${province}`
  const detalles: string[] = []
  if (p.bedrooms) detalles.push(`${p.bedrooms} habitaciones`)
  if (p.bathrooms) detalles.push(`${p.bathrooms} baños`)
  const metros = p.builtM2 || p.areaM2
  if (metros) detalles.push(`${metros} m²`)
  return detalles.length > 0 ? `${partes[0]}. ${detalles.join(', ')}.` : `${partes[0]}.`
}

function configBase(config: PortalConfig): MapContext['propertyUrlBase'] {
  return (config.publicBaseUrl || '').replace(/\/$/, '')
}

export const kyeroAdapter: PortalAdapter = {
  key: KYERO_KEY,
  label: 'Kyero',
  mode: 'pull',
  supportsDelete: true,

  validateConfig(config: PortalConfig): PortalValidation {
    const errors: string[] = []
    const defaults = config.defaults || {}
    if (!defaults.province && !defaults.town) {
      errors.push(
        'Configura al menos la provincia por defecto: el maestro no guarda provincia y Kyero la exige.'
      )
    }
    if (!defaults.country) {
      // Kyero solo publica inmuebles en España; si no se indica, se asume.
    }
    const base = configBase(config)
    if (base && !/^https?:\/\/[^/]+/i.test(base)) {
      errors.push('La URL pública base debe empezar por http:// o https://')
    }
    return { valid: errors.length === 0, errors }
  },

  mapProperty(p: InmuebleParsed, ctx: MapContext): MappedProperty | null {
    if (!p.publicableEnPortales) return null

    const freq = precioFrecuencia(p.operationType)
    if (!freq) {
      throw new PortalSkipError(
        `Operación no admitida por Kyero: ${p.operationType || 'sin definir'}`
      )
    }

    const moneda = (p.moneda || '').toUpperCase()
    if (!['EUR', 'GBP', 'USD'].includes(moneda)) {
      throw new PortalSkipError(`Moneda no admitida por Kyero: ${moneda || 'sin definir'}`)
    }

    const precio = Math.round(Number(p.precioBase))
    if (!Number.isFinite(precio) || precio <= 0) {
      throw new PortalSkipError('Precio no válido para publicar')
    }
    if (String(precio).length > MAX_PRICE_DIGITS) {
      throw new PortalSkipError('Precio fuera del rango admitido por Kyero')
    }

    const defaults = ctx.config.defaults || {}
    const town = textoPlano(p.city) || textoPlano(defaults.town)
    if (!town) throw new PortalSkipError('Falta la población (zona) del inmueble')

    const province = textoPlano(defaults.province)
    if (!province) throw new PortalSkipError('Falta la provincia por defecto de la conexión')

    if (!descripcionDe(p, town, province)) {
      throw new PortalSkipError('El inmueble no tiene descripción')
    }

    const base = ctx.propertyUrlBase
    const payload: Record<string, unknown> = {
      id: p.id,
      date: kyeroDate(p.updatedAt),
      ref: p.id,
      price: precio,
      currency: moneda,
      price_freq: freq,
      type: tipoKyero(p.propertyType, ctx.config),
      town,
      province,
      country: textoPlano(defaults.country) || 'Spain',
      beds: p.bedrooms ?? 0,
      baths: p.bathrooms ?? 0,
      pool: p.hasPool ? 1 : 0,
      description: descripcionDe(p, town, province),
      features: FEATURES.filter((f) => f.test(p)).map((f) => f.label),
      images: imagenesValidas(p.media, base),
      url: base ? `${base}/p/${p.id}` : null,
      latitude: p.lat,
      longitude: p.lng,
      built: p.builtM2 || p.areaM2 || null,
      energyRating: /^[A-G]$/.test((p.energyCert || '').toUpperCase())
        ? (p.energyCert || '').toUpperCase()
        : null,
    }

    return { propertyId: p.id, reference: p.id, payload }
  },

  validatePayload(payload: unknown): PortalValidation {
    return validarPayloadKyero(payload)
  },

  async buildDocument(properties: MappedProperty[], ctx: DeliveryContext): Promise<string> {
    return construirFeedKyero(properties, ctx)
  },

  async deliver(properties: MappedProperty[], ctx: DeliveryContext): Promise<DeliveryResult> {
    const document = await construirFeedKyero(properties, ctx)
    // Pull: no hay subida. El documento validado es lo que se sirve en /feeds.
    return { ok: true, document }
  },
}

// ─── Payload ────────────────────────────────────────────────────────────────

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function validarPayloadKyero(payload: unknown): PortalValidation {
  const errors: string[] = []
  const p = (payload || {}) as Record<string, unknown>

  const id = texto(p.id)
  if (!id || id.length > 50) errors.push('id: obligatorio y máximo 50 caracteres')

  const date = texto(p.date)
  if (!/^(19|20)\d\d-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01]) ([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(date)) {
    errors.push('date: formato YYYY-MM-DD HH:MM:SS')
  }

  const ref = texto(p.ref)
  if (!ref || ref.length > 255) errors.push('ref: obligatorio y máximo 255 caracteres')

  if (!/^[0-9]+$/.test(String(p.price ?? ''))) errors.push('price: solo dígitos')
  if (!['EUR', 'GBP', 'USD'].includes(texto(p.currency))) errors.push('currency: EUR, GBP o USD')
  if (!['sale', 'month'].includes(texto(p.price_freq))) errors.push('price_freq: sale o month')

  const type = texto(p.type)
  if (type.length < 3 || !/^[a-zA-Z&\s()/-]+$/.test(type)) errors.push('type: tipo Kyero no válido')

  if (!texto(p.town)) errors.push('town: obligatorio')
  if (!texto(p.province)) errors.push('province: obligatorio')

  for (const campo of ['beds', 'baths']) {
    const n = Number(p[campo])
    if (!Number.isInteger(n) || n < 0) errors.push(`${campo}: entero no negativo`)
  }

  if (![0, 1].includes(Number(p.pool))) errors.push('pool: 0 o 1')
  if (!texto(p.description)) errors.push('desc: obligatorio')

  const features = Array.isArray(p.features) ? p.features : []
  for (const f of features) {
    if (typeof f !== 'string' || f.length > 35) errors.push('feature: máximo 35 caracteres')
  }

  const images = Array.isArray(p.images) ? p.images : []
  if (images.length > MAX_IMAGES) errors.push(`images: máximo ${MAX_IMAGES}`)
  for (const url of images) {
    if (typeof url !== 'string' || !/^(https?|ftp):\/\/\S+\.(gif|jpe?g|png)$/i.test(url)) {
      errors.push(`images: URL no válida (${String(url).slice(0, 80)})`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Documento ──────────────────────────────────────────────────────────────

function bloqueDescripcion(desc: string): string {
  return [
    '    <desc>',
    `      <es>${escapeXml(desc)}</es>`,
    '    </desc>',
  ].join('\n')
}

function bloqueInmueble(payload: Record<string, any>): string {
  const lineas: string[] = ['  <property>']
  lineas.push(etiqueta('id', payload.id))
  lineas.push(etiqueta('date', payload.date))
  lineas.push(etiqueta('ref', payload.ref))
  lineas.push(etiqueta('price', payload.price))
  lineas.push(etiqueta('currency', payload.currency))
  lineas.push(etiqueta('price_freq', payload.price_freq))
  lineas.push(etiqueta('type', payload.type))
  lineas.push(etiqueta('town', payload.town))
  lineas.push(etiqueta('province', payload.province))
  lineas.push(etiqueta('country', payload.country))

  if (Number.isFinite(Number(payload.latitude)) && Number.isFinite(Number(payload.longitude))) {
    lineas.push('    <location>')
    lineas.push(`      <latitude>${Number(payload.latitude)}</latitude>`)
    lineas.push(`      <longitude>${Number(payload.longitude)}</longitude>`)
    lineas.push('    </location>')
  }

  lineas.push(etiqueta('beds', payload.beds))
  lineas.push(etiqueta('baths', payload.baths))
  lineas.push(etiqueta('pool', payload.pool))

  if (payload.built) {
    lineas.push('    <surface_area>')
    lineas.push(`      <built>${Math.round(Number(payload.built))}</built>`)
    lineas.push('    </surface_area>')
  }

  if (payload.energyRating) {
    lineas.push('    <energy_rating>')
    lineas.push(`      <consumption>${payload.energyRating}</consumption>`)
    lineas.push(`      <emissions>${payload.energyRating}</emissions>`)
    lineas.push('    </energy_rating>')
  }

  if (payload.url) {
    lineas.push('    <url>')
    lineas.push(`      <es>${escapeXml(payload.url)}</es>`)
    lineas.push('    </url>')
  }

  lineas.push(bloqueDescripcion(payload.description))

  const features: string[] = Array.isArray(payload.features) ? payload.features : []
  if (features.length > 0) {
    lineas.push('    <features>')
    for (const f of features) lineas.push(`      <feature>${escapeXml(f)}</feature>`)
    lineas.push('    </features>')
  }

  const images: string[] = Array.isArray(payload.images) ? payload.images : []
  if (images.length > 0) {
    lineas.push('    <images>')
    images.forEach((url, i) => {
      lineas.push(`      <image id="${i + 1}">`)
      lineas.push(`        <url>${escapeXml(url)}</url>`)
      lineas.push('      </image>')
    })
    lineas.push('    </images>')
  } else {
    lineas.push('    <images/>')
  }

  lineas.push('  </property>')
  return lineas.join('\n')
}

/** Construye el feed y lo valida contra el XSD oficial antes de devolverlo. */
async function construirFeedKyero(
  properties: MappedProperty[],
  _ctx: DeliveryContext
): Promise<string> {
  if (properties.length === 0) {
    throw new PortalFeedError(
      'El feed no tiene inmuebles publicables: el XSD de Kyero exige al menos uno.',
      ['properties: minOccurs=1']
    )
  }

  const lineas: string[] = [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    '<root>',
    '  <kyero>',
    '    <feed_version>3</feed_version>',
    '  </kyero>',
  ]

  for (const propiedad of properties) {
    lineas.push(bloqueInmueble(propiedad.payload))
  }
  lineas.push('</root>')

  const documento = lineas.join('\n')
  validarContraXsd(documento)
  return documento
}

// ─── Validación XSD ─────────────────────────────────────────────────────────

let xsdCache: string | null = null

function cargarXsd(): string {
  const candidatos = [
    path.join(process.cwd(), 'lib/portals/schemas/kyero_v3.xsd'),
    path.join(process.cwd(), 'nextjs_space/lib/portals/schemas/kyero_v3.xsd'),
  ]
  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) return fs.readFileSync(candidato, 'utf8')
  }
  throw new PortalFeedError(
    'No se encontró el XSD de Kyero en el servidor: el feed no se puede validar.',
    candidatos
  )
}

/**
 * Valida el documento completo contra `kyeroV3.0.xsd`.
 *
 * Se carga `libxmljs2` en tiempo de ejecución a propósito: es un módulo nativo
 * y no debe entrar en el bundle de webpack (`serverExternalPackages`).
 */
/**
 * Carga `libxmljs2` desde el `node_modules` real.
 *
 * Un `require('libxmljs2')` normal lo empaqueta webpack y entonces `bindings`
 * busca el `.node` relativo al chunk (`/app/.next/...`) y no lo encuentra. Con
 * `createRequire` anclado a la raíz del standalone, la resolución es la de
 * Node y el addon nativo se localiza en `/app/node_modules/libxmljs2`.
 */
function cargarLibxml(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRequire } = require('module') as typeof import('module')
  const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'))
  const paquete = 'libxmljs2'
  return nodeRequire(paquete)
}

export function validarContraXsd(documento: string): void {
  const libxml = cargarLibxml()
  const xsd = xsdCache ?? (xsdCache = cargarXsd())

  let xmlDoc: any
  try {
    xmlDoc = libxml.parseXml(documento)
  } catch (err: any) {
    throw new PortalFeedError('El XML generado no está bien formado', [String(err?.message || err)])
  }

  const xsdDoc = libxml.parseXml(xsd)
  if (xmlDoc.validate(xsdDoc)) return

  const errores: string[] = (xmlDoc.validationErrors || [])
    .slice(0, 5)
    .map((e: any) => `línea ${e.line}: ${String(e.message).trim()}`)
  throw new PortalFeedError('El XML generado no cumple el XSD de Kyero', errores)
}
