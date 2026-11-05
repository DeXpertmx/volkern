#!/usr/bin/env node
/**
 * Inventario de la superficie de escritura REST.
 *
 * Responde a cinco preguntas sobre `app/api/**\/route.ts`:
 *   1. ¿cuántas rutas exportan POST/PUT/PATCH/DELETE?
 *   2. ¿cuáles son alcanzables con una credencial de API
 *      (`authenticateRequest`, `validateApiKey` o `withTenantAuth`)?
 *   3. de esas, ¿cuántas no declaran ningún scope?
 *   4. ¿cuántas son de sólo lectura (sin métodos de escritura)?
 *   5. de esas, ¿cuántas no declaran ningún scope? Un `GET` sin scope es tan
 *      alcanzable como un `POST` sin scope: es el mismo agujero con otro
 *      método, así que se cuenta aparte y también tiene que llegar a cero.
 *
 * Es el instrumento con el que se dimensionó el gate REST
 * (docs/gate-rest-alcance-minimo.md). No juzga si una ruta está bien
 * protegida: clasifica superficies. Un cero en «sin scope» es el objetivo,
 * no el estado actual.
 *
 * El análisis vive en `lib/rutas-escritura.mjs` y lo comparte con el codemod
 * que añade los scopes: dos expresiones regulares distintas contaban cosas
 * distintas, y una de ellas contaba comentarios.
 *
 * Uso:  node scripts/inventario-rutas-escritura.mjs [--json]
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  bloques,
  ficherosDeRuta,
  mascara,
  METODOS_ESCRITURA,
  scopesDeclarados,
  usaCredencial,
} from './lib/rutas-escritura.mjs'

const rows = []
for (const file of ficherosDeRuta('app/api')) {
  const src = readFileSync(file, 'utf8')
  const mask = mascara(src)
  const methods = [...new Set(bloques(mask).map((b) => b.method))].sort()
  if (!methods.length) continue

  const porCredencial = usaCredencial(mask)
  rows.push({
    url: file.replace(/^app\/api/, '/api').replace(/\/route\.ts$/, ''),
    file: relative(process.cwd(), file),
    methods,
    via: porCredencial ? 'credencial' : /getServerSession\s*\(/.test(mask) ? 'sesion' : 'desconocida',
    scopes: porCredencial ? scopesDeclarados(src, mask) : [],
    escritura: methods.filter((m) => METODOS_ESCRITURA.includes(m)),
  })
}

const credencial = rows.filter((r) => r.via === 'credencial')
const escritura = credencial.filter((r) => r.escritura.length)
const lectura = credencial.filter((r) => !r.escritura.length)
const resumen = {
  rutasDeEscritura: rows.filter((r) => r.escritura.length).length,
  porCredencial: escritura.length,
  soloSesion: rows.filter((r) => r.escritura.length && r.via === 'sesion').length,
  authNoReconocida: rows.filter((r) => r.escritura.length && r.via === 'desconocida').length,
  credencialSinScope: escritura.filter((r) => !r.scopes.length).length,
  deletePorCredencial: escritura.filter((r) => r.escritura.includes('DELETE')).length,
  deletePorCredencialSinScope: escritura.filter(
    (r) => r.escritura.includes('DELETE') && !r.scopes.length
  ).length,
  lecturaCredencial: lectura.length,
  lecturaCredencialSinScope: lectura.filter((r) => !r.scopes.length).length,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ resumen, rutas: rows }, null, 2))
} else {
  console.log('=== Resumen ===')
  const etiquetas = {
    rutasDeEscritura: 'rutas con métodos de escritura',
    porCredencial: 'alcanzables con credencial de API',
    soloSesion: 'solo sesión',
    authNoReconocida: 'patrón de auth no reconocido (login, webhooks, cron…)',
    credencialSinScope: 'alcanzables con credencial y SIN scope',
    deletePorCredencial: 'con DELETE y credencial',
    deletePorCredencialSinScope: 'con DELETE, credencial y SIN scope',
    lecturaCredencial: 'de sólo lectura alcanzables con credencial',
    lecturaCredencialSinScope: 'de sólo lectura, con credencial y SIN scope',
  }
  for (const [clave, valor] of Object.entries(resumen)) {
    console.log(`  ${String(valor).padStart(4)}  ${etiquetas[clave]}`)
  }

  const conDelete = escritura.filter((r) => r.escritura.includes('DELETE'))
  console.log('\n=== Rutas con DELETE alcanzables por credencial ===')
  for (const r of conDelete.sort((a, b) => a.url.localeCompare(b.url))) {
    const scope = r.scopes.length ? r.scopes.join(' ') : '∅ SIN SCOPE'
    console.log(`  ${scope.padEnd(38)} ${r.url}`)
  }

  const sueltas = [...escritura, ...lectura].filter((r) => !r.scopes.length)
  if (sueltas.length) {
    console.log('\n=== ⚠ Rutas alcanzables con credencial y SIN scope ===')
    for (const r of sueltas.sort((a, b) => a.url.localeCompare(b.url))) {
      const metodos = r.escritura.length ? r.escritura.join(',') : r.methods.join(',')
      console.log(`  ${metodos.padEnd(12)} ${r.url}`)
    }
  } else {
    console.log('\n=== Rutas alcanzables con credencial y SIN scope: 0 ===')
  }
}
