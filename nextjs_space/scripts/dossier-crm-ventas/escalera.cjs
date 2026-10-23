/**
 * Lee la escalera de CRM desde `lib/crm-pricing.ts`, la fuente única que usan
 * la web, el checkout y los tests.
 *
 * POR QUÉ NO SE IMPORTA EL MÓDULO
 * Es TypeScript y este dossier se genera con `node` a secas (sin tsx ni build).
 * Se extraen los literales del módulo y, si cambia el formato, se falla en voz
 * alta en lugar de publicar un precio viejo. `tests/dossier-crm-ventas-precios.test.ts`
 * compara lo leído con el módulo real y con `calcularPrecioCrm`, así que una
 * divergencia rompe la suite en vez de llegar a una reunión.
 *
 * MÓDULO SIN DEPENDENCIAS: no toca puppeteer ni el sistema de ficheros de la
 * app, para poder probarlo en vitest.
 */
const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.join(__dirname, '..', '..')

function leerEscaleraCrm() {
  const fuente = fs.readFileSync(path.join(RAIZ, 'lib', 'crm-pricing.ts'), 'utf8')

  const trial = fuente.match(/export const CRM_TRIAL_DAYS\s*=\s*(\d+)/)
  const maxAsientos = fuente.match(/export const CRM_MAX_SELF_SERVE_SEATS\s*=\s*(\d+)/)
  const bloqueTiers = fuente.match(/export const CRM_TIERS[^=]*=\s*\[([\s\S]*?)\n\]/)
  const bloqueBandas = fuente.match(/export const CRM_VOLUME_BANDS[^=]*=\s*\[([\s\S]*?)\n\]/)

  if (!trial || !maxAsientos || !bloqueTiers || !bloqueBandas) {
    throw new Error(
      'No pude leer la escalera de CRM en lib/crm-pricing.ts (¿cambió el formato?). ' +
        'El dossier no se genera con precios inventados: arregla el lector o el módulo.',
    )
  }

  const tiers = []
  const reTier =
    /id:\s*'([a-z]+)',\s*name:\s*'([^']+)',[\s\S]*?audience:\s*'([^']*)',[\s\S]*?monthly:\s*(\d+),\s*annualMonthly:\s*(\d+),[\s\S]*?features:\s*\[([\s\S]*?)\],\s*limits:\s*\{([\s\S]*?)\}/g

  for (const m of bloqueTiers[1].matchAll(reTier)) {
    tiers.push({
      id: m[1],
      name: m[2],
      audience: m[3],
      monthly: Number(m[4]),
      annualMonthly: Number(m[5]),
      features: [...m[6].matchAll(/'([^']*)'/g)].map((f) => f[1]),
      limits: Object.fromEntries(
        [...m[7].matchAll(/(\w+):\s*(true|false|\d+)/g)].map((l) => [
          l[1],
          l[2] === 'true' ? true : l[2] === 'false' ? false : Number(l[2]),
        ]),
      ),
    })
  }

  const bands = [...bloqueBandas[1].matchAll(
    /\{\s*from:\s*(\d+),\s*to:\s*(null|\d+),\s*discount:\s*([\d.]+),\s*label:\s*'([^']*)'/g,
  )].map((b) => ({
    from: Number(b[1]),
    to: b[2] === 'null' ? null : Number(b[2]),
    discount: Number(b[3]),
    label: b[4],
  }))

  if (tiers.length !== 3) {
    throw new Error(`Esperaba 3 niveles de CRM en lib/crm-pricing.ts y leí ${tiers.length}.`)
  }
  if (!bands.length) throw new Error('No leí ningún tramo de volumen en lib/crm-pricing.ts.')

  return {
    trial: Number(trial[1]),
    maxAsientos: Number(maxAsientos[1]),
    tiers,
    bands,
  }
}

const escalera = leerEscaleraCrm()

/** Precio de entrada: el nivel más barato en su modalidad anual. */
const ENTRADA = Math.min(...escalera.tiers.map((t) => t.annualMonthly))
const TRIAL = escalera.trial
const MAX_ASIENTOS = escalera.maxAsientos

function nivel(id) {
  const tier = escalera.tiers.find((t) => t.id === id)
  if (!tier) throw new Error(`Nivel de CRM desconocido en el dossier: ${id}`)
  return tier
}

/**
 * Precio medio por usuario y mes tras aplicar los tramos marginales. Replica
 * `calcularPrecioCrm` (mismo redondeo en céntimos) para poder enseñar la
 * escalera de volumen sin importar TypeScript; el test fija que coincidan.
 */
function precioMedioPorUsuario(tierId, intervalo, asientos) {
  const tier = nivel(tierId)
  const factor = intervalo === 'yearly' ? 12 : 1
  const listaMes = intervalo === 'yearly' ? tier.annualMonthly : tier.monthly
  let pendientes = asientos
  let centimos = 0

  for (const banda of escalera.bands) {
    if (pendientes <= 0) break
    const capacidad = banda.to === null ? pendientes : banda.to - banda.from + 1
    const enTramo = Math.min(pendientes, capacidad)
    if (enTramo <= 0) continue
    centimos += Math.round(listaMes * (1 - banda.discount) * 100) * enTramo * factor
    pendientes -= enTramo
  }

  return Math.round(centimos / factor / asientos) / 100
}

/** 12 → «12»; 11.88 → «11,88». Para las tablas del dossier. */
function num(valor) {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace('.', ',')
}

/**
 * 1000 → «1.000». Intl en es-ES no agrupa los números de cuatro cifras, y en el
 * dossier conviene que se lean igual que en la web y en docs/precios-crm.md.
 */
function miles(valor) {
  return String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

module.exports = {
  RAIZ,
  leerEscaleraCrm,
  escalera,
  ENTRADA,
  TRIAL,
  MAX_ASIENTOS,
  nivel,
  precioMedioPorUsuario,
  num,
  miles,
}
