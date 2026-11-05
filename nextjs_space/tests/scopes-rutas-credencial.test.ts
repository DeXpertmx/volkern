/**
 * Toda ruta alcanzable con una credencial de API declara al menos un scope.
 *
 * Es el invariante que cierra el agujero por completo. La primera tanda cerró
 * las rutas de escritura (docs/gate-rest-alcance-minimo.md §5) y la segunda las
 * de sólo lectura, que eran 47 y medían lo mismo desde el otro método: un
 * `GET` sin scope lo llama cualquier clave válida del tenant, aunque se hubiera
 * emitido para leer contabilidad. Con las dos cerradas, la frase completa es
 * «credencial ⇒ scope», y este test la defiende sin distinguir tanda.
 *
 * Mide con el MISMO analizador que usan el inventario y el codemod
 * (`scripts/lib/rutas-escritura.mjs`): un solo analizador, no tres. Cuando
 * cada uno tenía su expresión regular, uno contaba ficheros que en realidad
 * declaraban scope y otro no veía llamadas de auth dentro del cuerpo.
 *
 * Si este test falla, la ruta de la lista es alcanzable por cualquier clave
 * válida del tenant con los permisos que tenga para OTRO módulo. La arreglo en
 * la ruta, no aquí: añadir el scope a la ruta es lo que la cierra, y quitar la
 * aserción sólo movería el agujero a producción.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error — módulo de herramienta en .mjs, sin tipos
import {
  ficherosDeRuta,
  mascara,
  scopesDeclarados,
  usaCredencial,
} from '../scripts/lib/rutas-escritura.mjs'

const RAIZ = join(__dirname, '..')

/** Rutas alcanzables con credencial que no declaran ni un scope. */
function rutasSinScope(): string[] {
  const huerfanas: string[] = []
  for (const file of ficherosDeRuta(join(RAIZ, 'app', 'api')) as string[]) {
    const src = readFileSync(file, 'utf8')
    if (!usaCredencial(mascara(src))) continue
    if (scopesDeclarados(src).length) continue
    huerfanas.push(file.replace(join(RAIZ, 'app', 'api'), '/api').replace(/\/route\.ts$/, ''))
  }
  return huerfanas.sort()
}

describe('Credencial ⇒ scope', () => {
  it('ninguna ruta alcanzable con credencial declara cero scopes', () => {
    const huerfanas = rutasSinScope()
    expect(
      huerfanas,
      'Estas rutas autentican por API key sin exigir ningún scope, así que las llama ' +
        'cualquier clave válida del tenant, aunque se emitiera para otro módulo:\n' +
        huerfanas.map((u) => `  ${u}`).join('\n')
    ).toEqual([])
  })
})
