/**
 * Analizador de la superficie de escritura REST.
 *
 * Lo comparten `scripts/inventario-rutas-escritura.mjs` (que cuenta) y
 * `scripts/aplicar-scopes-rest.mjs` (que escribe). Existe para que ambos usen
 * LA MISMA definición de «ruta alcanzable con credencial» y de «scope
 * declarado»; cuando cada uno tenía su propia expresión regular, el inventario
 * contaba tres ficheros como sin scope que en realidad declaraban
 * `}) as any, ['subscriptions:read']` y una ruta fantasma que sólo mencionaba
 * `authenticateRequest()` en un comentario.
 *
 * Nada de esto toca el runtime: es herramienta de auditoría.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Rutas con al menos un método de escritura. */
export const METODOS_ESCRITURA = ['POST', 'PUT', 'PATCH', 'DELETE']

/** Llamadas que autentican por credencial de API. */
export const LLAMADAS_CREDENCIAL = ['withTenantAuth', 'authenticateRequest', 'validateApiKey']

export function ficherosDeRuta(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) ficherosDeRuta(path, acc)
    else if (entry === 'route.ts') acc.push(path)
  }
  return acc
}

/**
 * Enmascara comentarios, cadenas, plantillas y literales regex conservando
 * posiciones y saltos de línea. Sobre la máscara se pueden contar paréntesis
 * sin que una llave o un paréntesis dentro de un mensaje de error descuadre la
 * cuenta; las posiciones siguen siendo válidas para editar el original.
 */
export function mascara(src) {
  const out = src.split('')
  const espacios = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  let anterior = ''
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
        if (src[k] === '\\') {
          k += 2
          continue
        }
        if (src[k] === c) break
        k++
      }
      espacios(i + 1, k)
      i = k + 1
      anterior = c
      continue
    }
    // `/` es regex si lo anterior no puede terminar una expresión.
    if (c === '/' && /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(anterior)) {
      let k = i + 1
      let enClase = false
      while (k < src.length) {
        if (src[k] === '\\') {
          k += 2
          continue
        }
        if (src[k] === '[') enClase = true
        else if (src[k] === ']') enClase = false
        else if (src[k] === '/' && !enClase) break
        else if (src[k] === '\n') break
        k++
      }
      espacios(i + 1, k)
      i = k + 1
      anterior = '/'
      continue
    }
    if (!/\s/.test(c)) anterior = c
    i++
  }
  return out.join('')
}

/** Índice del paréntesis que cierra al que abre en `abre` (-1 si no cierra). */
export function cierra(mask, abre) {
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

/**
 * Scopes del segundo argumento de la llamada que abre en `abre`.
 * `null` si la llamada no declara scopes de esa forma.
 *
 * Las POSICIONES salen de la máscara (que conserva la estructura) y el TEXTO
 * del original: en la máscara las cadenas están en blanco a propósito, así que
 * leer el nombre del scope de ahí devolvería una cadena vacía.
 */
export function scopesDelSegundoArgumento(mask, abre, src) {
  const fin = cierra(mask, abre)
  if (fin === -1) return null

  let profundidad = 0
  let inicioSegundo = -1
  for (let i = abre; i < fin; i++) {
    const c = mask[i]
    if (c === '(' || c === '[' || c === '{') profundidad++
    else if (c === ')' || c === ']' || c === '}') profundidad--
    else if (c === ',' && profundidad === 1) {
      inicioSegundo = i + 1
      break
    }
  }
  if (inicioSegundo === -1) return null

  const bloque = mask.slice(inicioSegundo, fin)

  // `{ requiredScopes: ['a', 'b'] }`
  const conObjeto = bloque.match(/requiredScopes\s*:\s*\[/)
  let desde
  if (conObjeto) desde = inicioSegundo + conObjeto.index + conObjeto[0].length
  else {
    const abreArray = bloque.match(/^\s*(?:as\s+any\s*)?\[/)
    if (!abreArray) return null
    desde = inicioSegundo + abreArray[0].length
  }

  const hasta = mask.indexOf(']', desde)
  if (hasta === -1 || hasta > fin) return null

  return src
    .slice(desde, hasta)
    .split(',')
    .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter(Boolean)
}

/** ¿La llamada que abre en `abre` ya lleva algo más que el primer argumento? */
export function tieneSegundoArgumento(mask, abre) {
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

/** Todos los scopes que el fichero declara, en cualquier llamada de auth. */
export function scopesDeclarados(src, mask = mascara(src)) {
  const encontrados = new Set()
  for (const nombre of LLAMADAS_CREDENCIAL) {
    const re = new RegExp(`\\b${nombre}\\s*\\(`, 'g')
    let m
    while ((m = re.exec(mask))) {
      const abre = m.index + m[0].length - 1
      const scopes = scopesDelSegundoArgumento(mask, abre, src)
      if (scopes) for (const s of scopes) encontrados.add(s)
    }
  }
  return [...encontrados]
}

/** ¿El fichero usa alguna llamada de credencial de verdad (no en un comentario)? */
export function usaCredencial(mask) {
  return LLAMADAS_CREDENCIAL.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(mask))
}

/** Bloques `export const METODO` con su rango en el fichero. */
export function bloques(mask) {
  const re = /export\s+(?:const|async\s+function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  const marcas = [...mask.matchAll(re)]
  return marcas.map((m, idx) => ({
    method: m[1],
    desde: m.index,
    hasta: idx + 1 < marcas.length ? marcas[idx + 1].index : mask.length,
  }))
}
