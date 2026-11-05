#!/usr/bin/env node
/**
 * Propuesta de scopes para las rutas alcanzables con credencial que hoy no
 * declaran ninguno (docs/gate-rest-alcance-minimo.md §5).
 *
 * Sin argumentos imprime la clasificación propuesta. Con `--apply` la escribe
 * en los `route.ts`, poniendo el scope en la llamada de auth de CADA método
 * exportado (no en el fichero: un `DELETE` y un `GET` del mismo fichero no
 * pueden compartir scope).
 *
 * Hay dos modos, porque el agujero se cerró en dos tandas y cada uno mide una
 * cosa distinta:
 *
 *   (sin flag)     ficheros con ESCRITURA sin scope: el agujero declarado.
 *   `--lectura`    ficheros de SÓLO lectura sin scope: la deuda medida después
 *                  de cerrar el primero (47 rutas). Un GET sin scope es tan
 *                  alcanzable como un POST sin scope: cualquier clave válida
 *                  del tenant lo llama, aunque se hubiera emitido para leer
 *                  contabilidad.
 *
 * La clasificación es por módulo (prefijo de ruta) y por método: `GET` pide
 * `:read`, `DELETE` pide `:delete` cuando el catálogo lo tiene, y el resto
 * `:write`. Los casos donde el prefijo miente están en `EXCEPCIONES`, con el
 * motivo al lado.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APLICAR = process.argv.includes('--apply')
const SOLO_LECTURA = process.argv.includes('--lectura')

// ── 1. Catálogo de scopes que ya existen ──────────────────────────────────
const catalogo = new Set(
  readFileSync('lib/api-keys.ts', 'utf8')
    .split('export const AVAILABLE_SCOPES = [')[1]
    .split('] as const')[0]
    .match(/'[^']+'/g)
    .map((s) => s.replace(/'/g, ''))
)

// ── 2. Módulo por prefijo de ruta ─────────────────────────────────────────
function modulo(url) {
  if (/^\/api\/accounting\//.test(url)) return 'accounting'
  if (/^\/api\/ads\//.test(url)) return 'ads'
  if (/^\/api\/analytics\//.test(url)) return 'analytics'
  if (url === '/api/dashboard') return 'dashboard'
  if (/^\/api\/ai(-generator)?$|^\/api\/ai\/|^\/api\/(gemma|guide)/.test(url)) return 'skills'
  if (/^\/api\/ausencias/.test(url)) return 'hr'
  if (/^\/api\/(cms|pages)\//.test(url)) return 'cms'
  if (/^\/api\/(compliance|equality)\//.test(url)) return 'compliance'
  if (/^\/api\/connect\//.test(url)) return 'messaging'
  if (/^\/api\/contacts\//.test(url)) return 'contacts'
  if (/^\/api\/contratos\//.test(url)) return 'contratos'
  if (/^\/api\/disponibilidad/.test(url)) return 'citas'
  if (/^\/api\/erp\//.test(url)) return 'erp'
  if (/^\/api\/formularios/.test(url)) return 'config'
  if (/^\/api\/hospitality\//.test(url)) return 'hospitality'
  if (/^\/api\/leads\//.test(url)) return 'leads'
  if (/^\/api\/mcp\//.test(url)) return 'mcp'
  if (/^\/api\/notifications/.test(url)) return 'notifications'
  if (/^\/api\/real-estate\//.test(url)) return 'real-estate'
  if (/^\/api\/social\//.test(url)) return 'social'
  if (/^\/api\/subscriptions\//.test(url)) return 'subscriptions'
  if (/^\/api\/support\//.test(url)) return 'support'
  // Sub-cuentas y accesos: no es configuración de la empresa, es alta de gente.
  if (/^\/api\/(slots|agency\/slots)/.test(url)) return 'team'
  if (/^\/api\/users\//.test(url)) return 'users'
  if (/^\/api\/import\//.test(url)) return 'import'
  // La telefonía integrada se lee con su propio scope, no con el de ajustes.
  if (/^\/api\/integrations\/telephony\//.test(url)) return 'telephony'
  if (
    /^\/api\/tenant\//.test(url) ||
    /^\/api\/whitelabel/.test(url) ||
    /^\/api\/v1\/user\//.test(url) ||
    /^\/api\/agency\//.test(url) ||
    /^\/api\/integrations\//.test(url)
  )
    return 'settings'
  return null
}

// ── 3. Excepciones: el prefijo no dice a qué recurso pertenece ────────────
const EXCEPCIONES = {
  // La nómina/marcaje tiene su propio scope de partner.
  '/api/erp/attendance/punch': 'attendance',
  // Importadores: el scope es el del recurso que se está importando.
  '/api/import/accounting': 'accounting',
  '/api/import/catalog': 'catalogo',
  '/api/import/clients': 'contacts',
  '/api/import/detect': 'import',
  '/api/hospitality/mensajes': 'messaging',
  // Cumplimiento dentro de hospitalidad sigue siendo cumplimiento.
  '/api/hospitality/compliance/config': 'compliance',
  '/api/hospitality/compliance/[reservationId]': 'compliance',
  // Cobros y cargos al huésped: asiento contable, no operación de hotel.
  '/api/hospitality/finanzas': 'accounting',
  '/api/hospitality/finanzas/cobrar': 'accounting',
  // Plantillas de rol = gestión de equipo.
  '/api/hospitality/roles': 'team',
  // Mejorar de plan es facturación, no cumplimiento.
  '/api/compliance/upgrade': 'subscriptions',
  // v1: APIs con un recurso propio que el prefijo no nombra.
  '/api/v1/agency/analytics/usage': 'analytics',
  '/api/v1/inventory/health': 'inventory',
  '/api/v1/operations/activity': 'dashboard',
  '/api/v1/sovereignty/integrity-chain': 'invoices',
}

/** Módulos con `:delete` propio en el catálogo. */
const CON_DELETE = new Set([
  'leads',
  'contacts',
  'deals',
  'tasks',
  'automations',
  'citas',
  'appointments',
  'webhooks',
  'contratos',
  'conversations',
])

function scopePara(url, method) {
  // Leer la bandeja no es enviar: el mismo endpoint necesita dos scopes según
  // el método, así que va aparte de la tabla de excepciones (que es por ruta).
  if (url === '/api/connect/messages') return method === 'GET' ? 'messaging:read' : 'messaging:send'

  const excepcion = EXCEPCIONES[url]
  if (excepcion) {
    if (excepcion.includes(':')) return excepcion
    return `${excepcion}:${method === 'GET' ? 'read' : 'write'}`
  }

  const mod = modulo(url)
  if (!mod) return null

  // Ejecutar una skill es una sola capacidad, se lea o se escriba.
  if (mod === 'skills') return 'skills:execute'
  // Resolver una aprobación no es ejecutar una tool: es administrar el gate.
  if (mod === 'mcp') return method === 'GET' ? 'mcp:read' : 'mcp:admin'
  if (method === 'GET') return `${mod}:read`
  if (method === 'DELETE' && CON_DELETE.has(mod)) return `${mod}:delete`
  return `${mod}:write`
}

// ── 4. Detección (sin comentarios: un comentario no autentica nada) ───────
const EXPORT = /\bexport\s+(?:const|async function)\s+(GET|POST|PUT|PATCH|DELETE)\b/

function files(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) files(p, acc)
    else if (e === 'route.ts') acc.push(p)
  }
  return acc
}

/**
 * Enmascara comentarios, cadenas, plantillas y regex conservando las
 * posiciones. Sobre la máscara se pueden contar paréntesis sin que una llave
 * de un mensaje de error rompa la cuenta.
 */
function mascara(src) {
  const out = src.split('')
  let i = 0
  const espacios = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let anteriorSignificativo = ''
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const fin = src.indexOf('\n', i)
      const b = fin === -1 ? src.length : fin
      espacios(i, b)
      i = b
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const fin = src.indexOf('*/', i + 2)
      const b = fin === -1 ? src.length : fin + 2
      espacios(i, b)
      i = b
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let k = i + 1
      while (k < src.length) {
        if (src[k] === '\\') { k += 2; continue }
        if (src[k] === c) break
        k++
      }
      espacios(i + 1, k)
      i = k + 1
      anteriorSignificativo = c
      continue
    }
    if (c === '/' && /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(anteriorSignificativo)) {
      let k = i + 1
      let enClase = false
      while (k < src.length) {
        if (src[k] === '\\') { k += 2; continue }
        if (src[k] === '[') enClase = true
        else if (src[k] === ']') enClase = false
        else if (src[k] === '/' && !enClase) break
        else if (src[k] === '\n') break
        k++
      }
      espacios(i + 1, k)
      i = k + 1
      anteriorSignificativo = '/'
      continue
    }
    if (!/\s/.test(c)) anteriorSignificativo = c
    i++
  }
  return out.join('')
}

/** Índice del paréntesis que cierra al abierto en `abre`. */
function cierra(mask, abre) {
  let profundidad = 0
  for (let i = abre; i < mask.length; i++) {
    if (mask[i] === '(') profundidad++
    else if (mask[i] === ')') {
      profundidad--
      if (profundidad === 0) return i
    }
  }
  return -1
}

/** ¿La llamada que abre en `abre` ya tiene más argumentos que el primero? */
function yaTieneSegundoArg(mask, abre) {
  const fin = cierra(mask, abre)
  if (fin === -1) return true
  let profundidad = 0
  for (let i = abre; i < fin; i++) {
    const c = mask[i]
    if (c === '(' || c === '[' || c === '{') profundidad++
    else if (c === ')' || c === ']' || c === '}') profundidad--
    else if (c === ',' && profundidad === 1) return true
  }
  return false
}

/** Bloques `export const METODO` del fichero. */
function bloques(mask) {
  const marcas = [...mask.matchAll(/export\s+(?:const|async\s+function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
  return marcas.map((m, idx) => ({
    method: m[1],
    desde: m.index,
    hasta: idx + 1 < marcas.length ? marcas[idx + 1].index : mask.length,
  }))
}

const LLAMADAS = ['withTenantAuth', 'authenticateRequest', 'validateApiKey']

const propuesta = []
for (const file of files('app/api')) {
  const src = readFileSync(file, 'utf8')
  const mask = mascara(src)
  const url = file.replace(/^app\/api/, '/api').replace(/\/route\.ts$/, '')
  const bs = bloques(mask)
  if (!bs.length) continue

  const tieneAuth = LLAMADAS.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(mask))
  if (!tieneAuth) continue

  const filas = []
  for (const b of bs) {
    const scope = scopePara(url, b.method)
    if (!scope) continue
    const inserta = []

    for (const nombre of LLAMADAS) {
      const re = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
      re.lastIndex = b.desde
      let m
      while ((m = re.exec(mask)) && m.index < b.hasta) {
        const abre = m.index + m[0].length - 1
        if (!yaTieneSegundoArg(mask, abre)) inserta.push(cierra(mask, abre))
      }
    }

    // Sólo entra un método que tenga al menos una llamada SIN scopes. Si todas
    // ya los declaran, el fichero no está en el agujero.
    if (!inserta.length) continue
    filas.push({ method: b.method, scope, inserta })
  }

  // El fichero entra si tiene alguna ESCRITURA sin scope: es el agujero
  // declarado. Una vez dentro se le pone scope a todos sus métodos, porque un
  // fichero donde el POST exige permiso y el GET no es un contrato incoherente.
  const tieneEscrituraSuelta = filas.some((f) => f.method !== 'GET')

  if (SOLO_LECTURA) {
    // Modo `--lectura`: sólo ficheros sin escritura suelta. Los demás son
    // responsabilidad del modo por defecto, para que los dos modos no
    // propongan el mismo fichero con reglas distintas.
    if (tieneEscrituraSuelta || !filas.length) continue
  } else if (!tieneEscrituraSuelta) {
    continue
  }
  propuesta.push({ file, url, filas })
}

// ── 5. Informe ────────────────────────────────────────────────────────────
const usados = new Map()
for (const p of propuesta)
  for (const f of p.filas) usados.set(f.scope, (usados.get(f.scope) || 0) + 1)

const faltantes = [...usados.keys()].filter((s) => !catalogo.has(s)).sort()

console.error(`Ficheros: ${propuesta.length}  (${SOLO_LECTURA ? 'modo --lectura' : 'modo escritura'})`)
console.error(`Scopes distintos: ${usados.size}`)
console.error(`Sin clasificar: ${propuesta.filter((p) => !p.filas.length).length}`)
if (faltantes.length) console.error(`NO están en AVAILABLE_SCOPES: ${faltantes.join(', ')}`)

const sinInsercion = propuesta.filter((p) => p.filas.some((f) => !f.inserta.length))
console.error(`Ficheros con algún método sin punto de inserción: ${sinInsercion.length}`)

if (!APLICAR) {
  for (const p of propuesta) {
    const detalle = p.filas.map((f) => `${f.method}→${f.scope}${f.inserta.length ? '' : ' (SIN PUNTO)'}`)
    console.log(`${p.url}\n    ${detalle.join('  ')}`)
  }
  process.exit(0)
}

// ── 6. Aplicación ─────────────────────────────────────────────────────────
let tocados = 0
const conflictos = []
for (const p of propuesta) {
  const src = readFileSync(p.file, 'utf8')
  const cortes = []
  for (const f of p.filas) {
    if (f.inserta.length !== 1) {
      conflictos.push(`${p.url} ${f.method}→${f.scope} (${f.inserta.length} puntos)`)
      continue
    }
    cortes.push({ pos: f.inserta[0], texto: `, ['${f.scope}']` })
  }
  if (!cortes.length) continue
  cortes.sort((a, b) => b.pos - a.pos)
  let out = src
  for (const c of cortes) out = out.slice(0, c.pos) + c.texto + out.slice(c.pos)
  writeFileSync(p.file, out)
  tocados++
}
console.error(`Ficheros escritos: ${tocados}`)
if (conflictos.length) {
  console.error(`Conflictos (revisar a mano): ${conflictos.length}`)
  for (const c of conflictos) console.error('  ' + c)
}
