/**
 * Verificación E2E de las plantillas de contrato en producción.
 */
import jwt from 'jsonwebtoken'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'

const USER_ID = 'cms96c2im0006ju04dymt9fkb'
const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'
const BASE = 'https://volkern.app'

const customerSecret = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026'
const nextAuthSecret = process.env.NEXTAUTH_SECRET!

function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function call(method: string, path: string, opts: { body?: unknown; jwt?: boolean } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.jwt) headers.authorization = `Bearer ${bearerJwt()}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* no json */ }
  return { status: res.status, json, text: text.slice(0, 300) }
}

async function main() {
  // 1. Listar plantillas (debe sembrar por defecto en la primera visita)
  const list = await call('GET', '/api/contratos/plantillas', { jwt: true })
  console.log(`${list.status === 200 ? '✓' : '✗'} GET plantillas -> HTTP ${list.status}`)
  const plantillas = list.json?.plantillas || []
  console.log(`   → ${plantillas.length} plantillas:`)
  plantillas.forEach((t: any) => console.log(`     • ${t.nombre} [${t.tipo}]${t.esPorDefecto ? ' (sistema)' : ''}`))

  // Verificar que tiene las por defecto
  const tieneServicios = plantillas.some((t: any) => t.tipo === 'servicio' && t.esPorDefecto)
  const tieneNDA = plantillas.some((t: any) => t.tipo === 'confidencialidad' && t.esPorDefecto)
  console.log(`${tieneServicios ? '✓' : '✗'} Plantilla por defecto: Servicios`)
  console.log(`${tieneNDA ? '✓' : '✗'} Plantilla por defecto: Confidencialidad (NDA)`)

  // 2. Crear plantilla personalizada
  const crear = await call('POST', '/api/contratos/plantillas', {
    jwt: true,
    body: {
      nombre: 'Contrato de prueba E2E',
      tipo: 'servicio',
      descripcion: 'Servicio de verificación E2E',
      clausulas: 'PRIMERA. Esta es una cláusula de prueba.',
      condicionesPago: 'Pago inmediato.',
    },
  })
  console.log(`${crear.status === 201 ? '✓' : '✗'} POST crear plantilla -> HTTP ${crear.status}`)
  const templateId = crear.json?.plantilla?.id

  // 3. Verificar que aparece en el listado
  const list2 = await call('GET', '/api/contratos/plantillas', { jwt: true })
  const total = list2.json?.plantillas?.length || 0
  const tieneLaNueva = list2.json?.plantillas?.some((t: any) => t.id === templateId)
  console.log(`${tieneLaNueva ? '✓' : '✗'} Nueva plantilla aparece en listado (${total} total)`)

  // 4. Eliminar plantilla de prueba
  if (templateId) {
    const del = await call('DELETE', `/api/contratos/plantillas/${templateId}`, { jwt: true })
    console.log(`${del.status === 200 ? '✓' : '✗'} DELETE plantilla -> HTTP ${del.status}`)
  }

  const allOk = list.status === 200 && tieneServicios && tieneNDA && crear.status === 201
  console.log(`\n${allOk ? '=== VERIFICACIÓN PLANTILLAS COMPLETA ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
