/**
 * Un scope que una ruta exige y que no está en el catálogo es una ruta muerta:
 * ninguna API key puede tenerlo, así que devuelve 401 para siempre y nadie
 * entiende por qué. Al añadir los scopes de los módulos que sólo se protegían
 * con rol (hospitality, real-estate, support, compliance, users,
 * notifications, import) era fácil escribir uno que no existiera.
 *
 * El análisis es el mismo que usan el inventario y el codemod
 * (`scripts/lib/rutas-escritura.mjs`): un solo analizador, no tres.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { AVAILABLE_SCOPES } from '@/lib/api-keys'
// @ts-expect-error — módulo de herramienta en .mjs, sin tipos
import { ficherosDeRuta, scopesDeclarados } from '../scripts/lib/rutas-escritura.mjs'

const RAIZ = join(__dirname, '..')

/**
 * Superficie de plataforma: `/api/admin/*` es el panel de operadores y exige
 * `admin:read`/`admin:write`, que el catálogo excluye a propósito de las claves
 * de tenant (ver el comentario de AVAILABLE_SCOPES). Esas rutas no son
 * alcanzables con una clave y no deben estarlo; su control es el rol de
 * Superadmin de la sesión.
 */
const PREFIJOS_FUERA_DEL_CATALOGO = ['/api/admin/']

function scopesDeLasRutas(): Map<string, string[]> {
  const usados = new Map<string, string[]>()
  for (const file of ficherosDeRuta(join(RAIZ, 'app', 'api')) as string[]) {
    const rel = file.replace(join(RAIZ, 'app', 'api'), '/api').replace(/\/route\.ts$/, '')
    if (PREFIJOS_FUERA_DEL_CATALOGO.some((p) => `${rel}/`.startsWith(p))) continue
    for (const scope of scopesDeclarados(readFileSync(file, 'utf8')) as string[]) {
      if (!usados.has(scope)) usados.set(scope, [])
      usados.get(scope)!.push(rel)
    }
  }
  return usados
}

describe('Scopes de las rutas', () => {
  it('todas las rutas declaran scopes que existen en el catálogo', () => {
    const catalogo = new Set<string>(AVAILABLE_SCOPES)
    const usados = scopesDeLasRutas()

    const huerfanos = [...usados.keys()].filter((s) => !catalogo.has(s)).sort()
    expect(
      huerfanos,
      'Estos scopes los exige una ruta pero no están en AVAILABLE_SCOPES, así que ninguna clave puede tenerlos:\n' +
        huerfanos.map((s) => `  ${s}  ← ${usados.get(s)!.slice(0, 3).join(', ')}`).join('\n')
    ).toEqual([])
  })

  it('los módulos que se cerraron en esta tanda tienen su scope y su ruta', () => {
    // Si alguien renombra `hospitality:write` en el catálogo o en las rutas, cae
    // aquí antes que en producción.
    const usados = scopesDeLasRutas()
    for (const scope of [
      'hospitality:read',
      'hospitality:write',
      'real-estate:read',
      'real-estate:write',
      'support:read',
      'support:write',
      'compliance:read',
      'compliance:write',
      'notifications:read',
      'notifications:write',
      'users:read',
      'users:write',
      'import:write',
    ]) {
      expect(AVAILABLE_SCOPES, scope).toContain(scope)
      expect(usados.has(scope), `${scope} no lo exige ninguna ruta`).toBe(true)
    }
  })
})
