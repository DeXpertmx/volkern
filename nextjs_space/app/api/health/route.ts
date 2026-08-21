import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 *
 * Health check público de la plataforma. Se referencia desde el API catalog
 * (RFC 9727) con la relación `status`. Devuelve 200 con estado básico del
 * servicio; si la BD principal no responde, devuelve 503.
 */
export async function GET() {
  const started = Date.now()
  let dbOk = false
  let dbError: string | null = null

  try {
    // Ping ligero a la BD global (sin query costosa)
    const { globalPrisma } = await import('@/lib/db')
    await globalPrisma.$queryRaw`SELECT 1`
    dbOk = true
  } catch (err: any) {
    dbError = err?.message || 'database unreachable'
  }

  const body = {
    status: dbOk ? 'ok' : 'degraded',
    service: 'volkern-erp',
    version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    time: new Date().toISOString(),
    latencyMs: Date.now() - started,
    checks: {
      database: dbOk ? 'ok' : 'error',
    },
    ...(dbError ? { error: dbError } : {}),
  }

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
