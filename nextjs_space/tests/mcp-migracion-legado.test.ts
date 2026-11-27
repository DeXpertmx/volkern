/**
 * Despliegue de las migraciones nuevas sobre una base en el estado de origin.
 *
 * Las pruebas del gate usan una base ya migrada, así que no cubren el riesgo
 * del día del despliegue: que las migraciones fallen al limpiar datos legados.
 * Origin (`20261127120000`) permite `operationId` repetidos porque aún no tiene
 * el índice único; una base real puede tenerlos. Aquí se monta ESE esquema, se
 * siembran duplicados y solicitudes pendientes repetidas, y se aplican las
 * migraciones nuevas con `prisma migrate deploy`.
 *
 * El índice de octubre impide pendientes duplicadas en origin, así que para
 * ejercitar la limpieza de `20261127210000` se elimina ese índice antes de
 * sembrar: representa una base anterior a él, que es justo el caso que la
 * migración declara reparar.
 *
 * Se salta salvo que `MCP_GATE_POSTGRES=1` y `DATABASE_URL` apunten a una base
 * desechable SIN el esquema que usa la prueba (lo crea y lo borra ella):
 *
 *   docker run -d --rm --name volkern-gate-pg -p 55432:5432 \
 *     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gate_test postgres:16-alpine
 *   MCP_GATE_POSTGRES=1 \
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/gate_test?schema=public' \
 *   npx vitest run tests/mcp-migracion-legado.test.ts
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

const HABILITADO = process.env.MCP_GATE_POSTGRES === '1' && Boolean(process.env.DATABASE_URL)

/** Última migración que existe en `origin/feat/nobeds-f1-lectura`. */
const ULTIMA_DE_ORIGIN = '20261127120000_mcp_approval_operation_id'

const RAIZ = process.cwd()
const DIR_MIGRACIONES = join(RAIZ, 'prisma', 'migrations')
const ESQUEMA = `migracion_legado_${Date.now()}`

const TENANT = 'tenant-legado'
const T0 = new Date('2026-11-27T10:00:00Z')
const minuto = (n: number) => new Date(T0.getTime() + n * 60_000)

type Fila = {
  id: string
  userId: string
  toolName: string
  hash: string
  operationId: string | null
  status: string
  creada: Date
}

/** Copia el esquema y las migraciones hasta `hasta` (o todas) a un directorio temporal. */
function prepararDirectorio(hasta?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'volkern-migracion-'))
  cpSync(join(RAIZ, 'prisma', 'schema.prisma'), join(dir, 'schema.prisma'))
  mkdirSync(join(dir, 'migrations'))

  for (const entrada of readdirSync(DIR_MIGRACIONES, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue
    if (hasta && entrada.name > hasta) continue
    cpSync(join(DIR_MIGRACIONES, entrada.name), join(dir, 'migrations', entrada.name), {
      recursive: true,
    })
  }
  return dir
}

function desplegar(dir: string, url: string) {
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', join(dir, 'schema.prisma')], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}

async function insertar(client: Client, fila: Fila) {
  await client.query(
    `INSERT INTO "mcp_approval_requests"
       ("id","tenantId","toolName","arguments","argumentsHash","operationId",
        "requestedById","via","status","expiresAt","createdAt")
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,'/mcp',$8,$9,$10)`,
    [
      fila.id,
      TENANT,
      fila.toolName,
      JSON.stringify({ id: fila.id }),
      fila.hash,
      fila.operationId,
      fila.userId,
      fila.status,
      new Date(fila.creada.getTime() + 60 * 60_000),
      fila.creada,
    ]
  )
}

describe.skipIf(!HABILITADO)('migraciones nuevas sobre una base legada', () => {
  it(
    'aplica el esquema nuevo sobre operationIds duplicados y pendientes repetidas sin fallar',
    async () => {
      const url = new URL(process.env.DATABASE_URL!)
      url.searchParams.set('schema', ESQUEMA)

      const admin = new Client({ connectionString: url.toString() })
      await admin.connect()
      await admin.query(`CREATE SCHEMA "${ESQUEMA}"`)
      await admin.end()

      let origin: string | undefined
      let completo: string | undefined
      const client = new Client({ connectionString: url.toString() })

      try {
        // 1. Base en el estado de origin.
        origin = prepararDirectorio(ULTIMA_DE_ORIGIN)
        desplegar(origin, url.toString())

        await client.connect()
        await client.query(`SET search_path TO "${ESQUEMA}"`)

        // Sin el índice de octubre, como una base anterior a él, para poder
        // sembrar pendientes repetidas y ejercitar su limpieza.
        await client.query('DROP INDEX "mcp_approval_requests_pendiente_unica"')

        // Mismo operationId del mismo usuario (el índice único aún no existe).
        await insertar(client, {
          id: 'op-vieja', userId: 'user-ana', toolName: 'volkern_send_whatsapp',
          hash: 'hash-op-1', operationId: 'op-repetido', status: 'executed', creada: minuto(0),
        })
        await insertar(client, {
          id: 'op-viva', userId: 'user-ana', toolName: 'volkern_send_whatsapp',
          hash: 'hash-op-2', operationId: 'op-repetido', status: 'pending', creada: minuto(1),
        })
        // El mismo valor en otro usuario debe sobrevivir: el ámbito es por usuario.
        await insertar(client, {
          id: 'op-otro-usuario', userId: 'user-luis', toolName: 'volkern_send_whatsapp',
          hash: 'hash-op-3', operationId: 'op-repetido', status: 'pending', creada: minuto(2),
        })
        // Reintentos pendientes idénticos sin operationId (el caso que limpia 210000).
        await insertar(client, {
          id: 'pend-vieja', userId: 'user-carla', toolName: 'volkern_delete_contact',
          hash: 'hash-pend', operationId: null, status: 'pending', creada: minuto(3),
        })
        await insertar(client, {
          id: 'pend-nueva', userId: 'user-carla', toolName: 'volkern_delete_contact',
          hash: 'hash-pend', operationId: null, status: 'pending', creada: minuto(4),
        })

        // 2. Despliegue real: mismas migraciones ya aplicadas + las nuevas.
        completo = prepararDirectorio()
        desplegar(completo, url.toString())

        // 3. El despliegue terminó; los datos quedaron reparados.
        const { rows } = await client.query(
          `SELECT id, "operationId", status FROM "mcp_approval_requests" ORDER BY id`
        )
        const porId = Object.fromEntries(
          rows.map((f) => [f.id, { operationId: f.operationId, status: f.status }])
        )

        expect(porId['op-vieja']).toEqual({ operationId: null, status: 'executed' })
        expect(porId['op-viva'].operationId).toBe('op-repetido')
        expect(porId['op-otro-usuario'].operationId).toBe('op-repetido')
        expect(porId['pend-vieja'].status).toBe('expired')
        expect(porId['pend-nueva'].status).toBe('pending')

        const { rows: indices } = await client.query(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname = $1 AND tablename = 'mcp_approval_requests'`,
          [ESQUEMA]
        )
        const nombres = indices.map((f) => f.indexname)
        expect(nombres).toContain('mcp_approval_requests_tenantId_requestedById_operationId_key')
        expect(nombres).toContain('mcp_approval_requests_pendiente_contenido_key')
        expect(nombres).not.toContain('mcp_approval_requests_pendiente_unica')

        // El índice nuevo ya impide el reintento pendiente duplicado.
        await expect(
          insertar(client, {
            id: 'pend-extra', userId: 'user-carla', toolName: 'volkern_delete_contact',
            hash: 'hash-pend', operationId: null, status: 'pending', creada: minuto(6),
          })
        ).rejects.toMatchObject({ code: '23505' })

        const { rows: columnas } = await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'mcp_approval_requests'`,
          [ESQUEMA]
        )
        expect(columnas.map((f) => f.column_name)).toEqual(
          expect.arrayContaining(['whatsappMessageId', 'entregaEstado', 'entregaActualizadaEn'])
        )
      } finally {
        await client.end().catch(() => {})
        const limpieza = new Client({ connectionString: url.toString() })
        await limpieza.connect().catch(() => {})
        await limpieza.query(`DROP SCHEMA IF EXISTS "${ESQUEMA}" CASCADE`).catch(() => {})
        await limpieza.end().catch(() => {})
        if (origin) rmSync(origin, { recursive: true, force: true })
        if (completo) rmSync(completo, { recursive: true, force: true })
      }
    },
    180_000
  )
})
