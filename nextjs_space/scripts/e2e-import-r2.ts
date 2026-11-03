/**
 * Ensayo E2E de R2 (calidad de importación) con datos ficticios.
 *
 * Crea un tenant, un usuario y una API key de usar y tirar, sube CSV sucios por
 * HTTP contra un servidor de desarrollo y comprueba en la base de datos lo que
 * de verdad importa: que la previsualización no escribe, que el commit hereda el
 * `batchId`, y que deshacer borra lo creado y restaura lo actualizado.
 *
 * Uso:
 *   npx next dev --port 3010
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-import-r2.ts
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-import-r2.ts --limpiar <slug>
 */

import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3010'
const SCOPES = ['import:write', 'contacts:write', 'catalogo:write', 'accounting:write']

let comprobaciones = 0
let fallos = 0

function ok(condicion: boolean, mensaje: string) {
  comprobaciones++
  if (condicion) {
    console.log(`  ✓ ${mensaje}`)
  } else {
    fallos++
    console.log(`  ✗ ${mensaje}`)
  }
}

function igual(actual: unknown, esperado: unknown, mensaje: string) {
  ok(
    actual === esperado,
    `${mensaje} (esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(actual)})`,
  )
}

interface Respuesta {
  status: number
  body: Record<string, any>
}

async function enviarCsv(
  ruta: string,
  apiKey: string,
  campos: { csv: string; nombre: string; mapping: unknown; mode: string; batchId?: string; incluirPosiblesDuplicados?: boolean },
): Promise<Respuesta> {
  const form = new FormData()
  form.append('file', new Blob([campos.csv], { type: 'text/csv' }), campos.nombre)
  form.append('mapping', JSON.stringify(campos.mapping))
  form.append('mode', campos.mode)
  form.append('incluirPosiblesDuplicados', campos.incluirPosiblesDuplicados ? 'true' : 'false')
  if (campos.batchId) form.append('batchId', campos.batchId)

  const res = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: form,
  })
  const texto = await res.text()
  let body: Record<string, any> = {}
  try {
    body = JSON.parse(texto)
  } catch {
    body = { crudo: texto.slice(0, 400) }
  }
  return { status: res.status, body }
}

async function deshacer(apiKey: string, logId: string): Promise<Respuesta> {
  const res = await fetch(`${BASE}/api/import/undo`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ logId }),
  })
  const texto = await res.text()
  let body: Record<string, any> = {}
  try {
    body = JSON.parse(texto)
  } catch {
    body = { crudo: texto.slice(0, 400) }
  }
  return { status: res.status, body }
}

// ─── CSV ficticios ───────────────────────────────────────────────────────────

const MAPA_CLIENTES = [
  ['Nombre', 'nombre'],
  ['Email', 'email'],
  ['Telefono', 'telefono'],
  ['Empresa', 'empresa'],
  ['Direccion', 'direccion'],
  ['Ciudad', 'ciudad'],
  ['Pais', 'pais'],
  ['NIF', 'nif'],
].map(([sourceField, targetField]) => ({ sourceField, targetField }))

const MAPA_CATALOGO = [
  ['Nombre', 'nombre'],
  ['Descripcion', 'descripcion'],
  ['Precio', 'precio'],
  ['Duracion', 'duracion'],
].map(([sourceField, targetField]) => ({ sourceField, targetField }))

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** DNI válido y distinto en cada corrida: `rfc` es único global en el esquema. */
function dniAleatorio(): string {
  const numero = String(Math.floor(10000000 + Math.random() * 89999999))
  return `${numero}${LETRAS_DNI[Number.parseInt(numero, 10) % 23]}`
}

// Ocho filas: dos buenas, una actualización, un posible duplicado y cuatro
// maneras distintas de estar mal (NIF, email, nombre y repetido en el fichero).
function construirCsvClientes(nifAurora: string, nifSinCorreo: string): string {
  return [
    'Nombre,Email,Telefono,Empresa,Direccion,Ciudad,Pais,NIF',
    `Hotel Aurora,aurora@ficticio.test,600111222,Hoteles Aurora SL,Calle Luna 3,Madrid,España,${nifAurora}`,
    `Hotel Aurora Bis,aurora@ficticio.test,600333444,Hoteles Aurora SL,Calle Luna 3,Madrid,España,${nifAurora}`,
    'Bar NIF Roto,bar@ficticio.test,600555666,Bar SL,Calle Sol 1,Sevilla,España,B00000001',
    'Correo Roto,sin-arroba,600777888,,Calle Mar 2,Valencia,España,',
    ',vacio@ficticio.test,600999000,,,,',
    'Cliente Existente SA,existente@ficticio.test,611000111,Cliente Existente SA,Av. Nueva 1,Bilbao,España,',
    'Grupo Iberia,otro@ficticio.test,622000222,Grupo Iberia,Calle Nueva 9,Zaragoza,España,',
    `Sin Correo SL,,633000333,Sin Correo SL,Calle Río 4,Murcia,España,${nifSinCorreo}`,
  ].join('\n')
}

// Cinco filas: precio imposible, nombre repetido, casi-duplicado del catálogo
// existente (similitud 0,75) y una actualización exacta.
const CSV_CATALOGO = [
  'Nombre,Descripcion,Precio,Duracion',
  'Sesión de fisioterapia,Sesión de 60 min en cabina,45,60',
  'Sesión de fisioterapia,Repetida en el mismo fichero,45,60',
  'Masaje premium,Aceites esenciales,cuarenta,90',
  'Gestión redes sociales,Pack mensual,300,60',
  'Gestión redes sociales pro,Actualizado,350,90',
].join('\n')

// ─── Limpieza ────────────────────────────────────────────────────────────────

async function limpiar(slug: string) {
  const tenant = await prisma.tenant.findFirst({ where: { slug } })
  if (!tenant) {
    console.log(`No hay tenant con slug ${slug}`)
    return
  }
  await prisma.customerFiscalData.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.servicio.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.importLog.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.apiKey.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.lead.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.user.deleteMany({ where: { tenantId: tenant.id } })
  await prisma.tenant.delete({ where: { id: tenant.id } })
  console.log(`Limpiado el tenant ${tenant.id} (${slug})`)
}

// ─── Ensayo ──────────────────────────────────────────────────────────────────

async function main() {
  const marca = `e2e-r2-${Date.now()}`
  const csvClientesTexto = construirCsvClientes(dniAleatorio(), dniAleatorio())
  const tenant = await prisma.tenant.create({
    data: { nombre: 'E2E R2 Import (ficticio)', slug: marca, moneda: 'EUR', estado: 'activo' },
  })
  const user = await prisma.user.create({
    data: { email: `${marca}@ficticio.test`, name: 'E2E R2', tenantId: tenant.id, estado: 'activo' },
  })
  const apiKey = `vk_prod_${crypto.randomBytes(32).toString('hex')}`
  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      nombre: 'e2e-r2',
      keyHash: crypto.createHash('sha256').update(apiKey).digest('hex'),
      prefix: apiKey.slice(0, 16),
      scopes: SCOPES,
    },
  })

  // Datos previos: uno para actualizar por email, otro para disparar el aviso de
  // posible duplicado por nombre, y un servicio casi homónimo en el catálogo.
  const leadExistente = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      nombre: 'Cliente Existente SA',
      email: 'existente@ficticio.test',
      telefono: '699000000',
      empresa: 'Vieja Empresa',
      ubicacion: 'Calle Antigua 1, Bilbao, España',
    },
  })
  await prisma.lead.create({
    data: { tenantId: tenant.id, nombre: 'Grupo Iberia', email: 'iberia@ficticio.test', empresa: 'Grupo Iberia' },
  })
  const servicioExistente = await prisma.servicio.create({
    data: {
      tenantId: tenant.id,
      nombre: 'Gestión redes sociales pro',
      descripcion: 'Antes',
      precio: 100,
      duracionMinutos: 60,
      moneda: 'EUR',
    },
  })

  const leads = () => prisma.lead.count({ where: { tenantId: tenant.id } })
  const servicios = () => prisma.servicio.count({ where: { tenantId: tenant.id } })
  const logs = () =>
    prisma.importLog.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'asc' } })

  console.log(`\n▶ Tenant ficticio ${tenant.id} (${marca})`)
  igual(await leads(), 2, 'arranca con 2 clientes de prueba')

  // ── 1. Previsualización de clientes ────────────────────────────────────────
  console.log('\n▶ 1. Previsualización (CSV de clientes sucio)')
  const preview = await enviarCsv('/api/import/clients', apiKey, {
    csv: csvClientesTexto,
    nombre: 'clientes-ficticios.csv',
    mapping: MAPA_CLIENTES,
    mode: 'preview',
  })

  igual(preview.status, 200, 'la previsualización responde 200')
  igual(preview.body.mode, 'preview', 'devuelve mode=preview')
  igual(preview.body.escritos, 0, 'no escribe ningún registro')
  igual(preview.body.puedeDeshacerse, false, 'no ofrece deshacer (no hay nada escrito)')

  const informe = preview.body.informe ?? {}
  igual(informe.total, 8, 'cuenta las 8 filas')
  igual(informe.nuevas, 2, 'detecta 2 altas')
  igual(informe.actualizadas, 1, 'detecta 1 actualización por email')
  igual(informe.rechazadas, 4, 'rechaza 4 filas (NIF, email, nombre y repetida)')
  igual(informe.posiblesDuplicados, 1, 'marca 1 posible duplicado')

  const cuarentena: string = preview.body.cuarentenaCsv ?? ''
  ok(cuarentena.includes('NIF_INVALIDO'), 'la cuarentena explica el NIF inválido')
  ok(cuarentena.includes('EMAIL_INVALIDO'), 'la cuarentena explica el email inválido')
  ok(cuarentena.includes('DUPLICADO_FICHERO'), 'la cuarentena explica el duplicado del fichero')
  ok(cuarentena.includes('CAMPO_OBLIGATORIO'), 'la cuarentena explica el nombre que falta')

  igual(await leads(), 2, 'la previsualización NO ha tocado los clientes')
  igual(await servicios(), 1, 'la previsualización NO ha tocado el catálogo')

  const batchPreview: string | undefined = preview.body.batchId
  ok(Boolean(batchPreview), 'la previsualización devuelve batchId')
  const logPreview = (await logs()).find((l) => l.id === preview.body.logId)
  igual(logPreview?.mode, 'preview', 'el log de la previsualización queda como preview')
  igual(logPreview?.recordsImported, 0, 'el log de la previsualización registra 0 importados')
  igual(logPreview?.batchId, batchPreview, 'el log guarda el batchId devuelto')

  // ── 2. Commit heredando el lote ────────────────────────────────────────────
  console.log('\n▶ 2. Commit confirmando esa previsualización')
  const commit = await enviarCsv('/api/import/clients', apiKey, {
    csv: csvClientesTexto,
    nombre: 'clientes-ficticios.csv',
    mapping: MAPA_CLIENTES,
    mode: 'commit',
    batchId: batchPreview,
  })

  igual(commit.status, 200, 'el commit responde 200')
  igual(commit.body.escritos, 3, 'escribe 3 registros (2 altas + 1 actualización)')
  igual(commit.body.batchId, batchPreview, 'el commit conserva el batchId de la previsualización')
  ok(commit.body.logId !== preview.body.logId, 'el commit abre su propio log')
  igual(commit.body.puedeDeshacerse, true, 'el commit se puede deshacer')

  igual(await leads(), 4, 'quedan 4 clientes en la cuenta')

  const actualizado = await prisma.lead.findUnique({ where: { id: leadExistente.id } })
  igual(actualizado?.telefono, '611000111', 'la actualización escribió el teléfono nuevo')
  igual(actualizado?.empresa, 'Cliente Existente SA', 'la actualización escribió la empresa nueva')

  const aurora = await prisma.lead.findFirst({ where: { tenantId: tenant.id, email: 'aurora@ficticio.test' } })
  ok(Boolean(aurora), 'se creó el cliente con NIF válido')
  const fiscalAurora = aurora
    ? await prisma.customerFiscalData.findFirst({ where: { tenantId: tenant.id, leadId: aurora.id } })
    : null
  ok(Boolean(fiscalAurora), 'el NIF se guardó en los datos fiscales del cliente')
  igual(
    await prisma.lead.count({ where: { tenantId: tenant.id, nombre: 'Grupo Iberia' } }),
    1,
    'el posible duplicado no se escribió por defecto',
  )

  const logCommit = (await logs()).find((l) => l.id === commit.body.logId)
  igual(logCommit?.mode, 'commit', 'el log del commit queda como commit')
  igual(logCommit?.batchId, batchPreview, 'el log del commit comparte batchId')
  igual(logCommit?.status, 'completed', 'el log del commit queda completed')

  // ── 3. Deshacer ────────────────────────────────────────────────────────────
  console.log('\n▶ 3. Deshacer el lote')
  const undo = await deshacer(apiKey, commit.body.logId)
  igual(undo.status, 200, 'deshacer responde 200')
  igual(undo.body.borrados, 2, 'borra los 2 clientes creados')
  igual(undo.body.restaurados, 1, 'restaura el cliente actualizado')

  igual(await leads(), 2, 'la cuenta vuelve a sus 2 clientes')
  const restaurado = await prisma.lead.findUnique({ where: { id: leadExistente.id } })
  igual(restaurado?.telefono, '699000000', 'el teléfono anterior volvió')
  igual(restaurado?.empresa, 'Vieja Empresa', 'la empresa anterior volvió')
  const fiscalRestante = await prisma.customerFiscalData.count({ where: { tenantId: tenant.id } })
  igual(fiscalRestante, 0, 'el NIF del cliente borrado no queda huérfano')
  igual((await logs()).find((l) => l.id === commit.body.logId)?.status, 'reverted', 'el lote queda marcado reverted')

  const undoRepetido = await deshacer(apiKey, commit.body.logId)
  igual(undoRepetido.status, 409, 'deshacer dos veces se rechaza')
  igual(undoRepetido.body.motivo, 'ya_deshecho', 'el motivo es ya_deshecho')

  const undoPreview = await deshacer(apiKey, preview.body.logId)
  igual(undoPreview.status, 409, 'deshacer una previsualización se rechaza')
  igual(undoPreview.body.motivo, 'no_es_lote', 'el motivo es no_es_lote')

  // ── 4. Catálogo: precio imposible, repetido y casi-duplicado ───────────────
  console.log('\n▶ 4. Previsualización de catálogo')
  const previewCat = await enviarCsv('/api/import/catalog', apiKey, {
    csv: CSV_CATALOGO,
    nombre: 'catalogo-ficticio.csv',
    mapping: MAPA_CATALOGO,
    mode: 'preview',
  })

  igual(previewCat.status, 200, 'la previsualización de catálogo responde 200')
  const informeCat = previewCat.body.informe ?? {}
  igual(informeCat.total, 5, 'cuenta las 5 filas')
  igual(informeCat.nuevas, 1, 'detecta 1 alta de servicio')
  igual(informeCat.actualizadas, 1, 'detecta 1 servicio existente')
  igual(informeCat.rechazadas, 2, 'rechaza el precio imposible y el nombre repetido')
  igual(informeCat.posiblesDuplicados, 1, 'marca el servicio casi homónimo')
  igual(await servicios(), 1, 'la previsualización NO ha tocado el catálogo')

  // ── 5. Lote posterior bloquea deshacer de uno anterior ─────────────────────
  console.log('\n▶ 5. Orden de los lotes')
  const commitClientes = await enviarCsv('/api/import/clients', apiKey, {
    csv: csvClientesTexto,
    nombre: 'clientes-ficticios.csv',
    mapping: MAPA_CLIENTES,
    mode: 'commit',
  })
  igual(commitClientes.body.escritos, 3, 'el segundo lote de clientes escribe 3')

  const commitCat = await enviarCsv('/api/import/catalog', apiKey, {
    csv: CSV_CATALOGO,
    nombre: 'catalogo-ficticio.csv',
    mapping: MAPA_CATALOGO,
    mode: 'commit',
    incluirPosiblesDuplicados: true,
  })
  igual(commitCat.status, 200, 'el commit de catálogo responde 200')
  igual(commitCat.body.escritos, 3, 'con el flag escribe también el posible duplicado')
  igual(await servicios(), 3, 'quedan 3 servicios (1 previo + 2 creados)')

  const undoViejo = await deshacer(apiKey, commitClientes.body.logId)
  igual(undoViejo.status, 409, 'deshacer un lote con otro posterior se rechaza')
  igual(undoViejo.body.motivo, 'hay_lotes_posteriores', 'el motivo es hay_lotes_posteriores')

  const undoCats = await deshacer(apiKey, commitCat.body.logId)
  igual(undoCats.status, 200, 'el último lote sí se deshace')
  igual(await servicios(), 1, 'el catálogo vuelve a 1 servicio')
  const servicioRestaurado = await prisma.servicio.findUnique({ where: { id: servicioExistente.id } })
  igual(servicioRestaurado?.precio, 100, 'el precio anterior del servicio volvió')
  igual(servicioRestaurado?.descripcion, 'Antes', 'la descripción anterior volvió')

  const undoCli = await deshacer(apiKey, commitClientes.body.logId)
  igual(undoCli.status, 200, 'ya sin lotes posteriores, el segundo se deshace')
  igual(await leads(), 2, 'los clientes vuelven a 2')

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${comprobaciones - fallos}/${comprobaciones} comprobaciones OK`)
  console.log(`Tenant de prueba: ${tenant.id} — slug ${marca}`)
  console.log(`Para limpiar: npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-import-r2.ts --limpiar ${marca}`)
  if (fallos > 0) process.exitCode = 1
}

const args = process.argv.slice(2)
const limpiarIdx = args.indexOf('--limpiar')

const ejecucion = limpiarIdx >= 0 && args[limpiarIdx + 1] ? limpiar(args[limpiarIdx + 1]) : main()

ejecucion
  .catch((error) => {
    console.error('Error en el ensayo:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
