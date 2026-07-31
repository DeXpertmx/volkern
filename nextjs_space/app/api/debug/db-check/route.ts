/**
 * ⚠️ ENDPOINT TEMPORAL DE DIAGNÓSTICO ⚠️
 *
 * Devuelve información SANITIZADA sobre qué DB está usando el server de
 * producción y si puede ver los usuarios del bootstrap.
 *
 * BORRAR este archivo después de identificar la causa del 401 en login.
 *
 * GET /api/debug/db-check → JSON con:
 *   - dbHost (solo hostname, sin credenciales)
 *   - nodeEnv
 *   - adminUser / dexpertUser: existence + tenant subdomain + role + bcrypt match
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  }

  // ── DB host sanitizado (hostname only, sin password ni path) ──
  const dbUrl = process.env.DATABASE_URL ?? ''
  if (!dbUrl) {
    result.dbHost = '(MISSING — process.env.DATABASE_URL is undefined!)'
    result.dbEnvSet = false
  } else {
    try {
      const u = new URL(dbUrl)
      result.dbHost = u.host
      result.dbProtocol = u.protocol.replace(':', '')
      result.dbEnvSet = true
    } catch {
      result.dbHost = '(UNPARSEABLE)'
      result.dbEnvSet = true
    }
  }

  // ── Admin (tenant=admin) ──
  try {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@volkern.app' },
      select: {
        id: true, email: true, estado: true,
        tenant: { select: { subdomain: true, accountType: true } },
        role: { select: { nombre: true } },
      },
    })
    let adminPwd: boolean | null = null
    if (admin) {
      const raw = await prisma.user.findUnique({
        where: { id: admin.id },
        select: { password: true },
      })
      if (raw?.password) adminPwd = await bcrypt.compare('Admin123!', raw.password)
    }
    result.admin = {
      exists: !!admin,
      tenant: admin?.tenant?.subdomain ?? null,
      accountType: admin?.tenant?.accountType ?? null,
      role: admin?.role?.nombre ?? null,
      passwordOk: adminPwd,
    }
  } catch (e: any) {
    result.admin = { error: e?.message?.slice(0, 200) ?? String(e).slice(0, 200) }
  }

  // ── DeXpert (tenant=dexpert) ──
  try {
    const dexpert = await prisma.user.findUnique({
      where: { email: 'admin@dexpert.volkern.app' },
      select: {
        id: true, email: true, estado: true,
        tenant: { select: { subdomain: true, accountType: true } },
        role: { select: { nombre: true } },
      },
    })
    let dexpertPwd: boolean | null = null
    if (dexpert) {
      const raw = await prisma.user.findUnique({
        where: { id: dexpert.id },
        select: { password: true },
      })
      if (raw?.password) dexpertPwd = await bcrypt.compare('Dexpert123!', raw.password)
    }
    result.dexpert = {
      exists: !!dexpert,
      tenant: dexpert?.tenant?.subdomain ?? null,
      accountType: dexpert?.tenant?.accountType ?? null,
      role: dexpert?.role?.nombre ?? null,
      passwordOk: dexpertPwd,
    }
  } catch (e: any) {
    result.dexpert = { error: e?.message?.slice(0, 200) ?? String(e).slice(0, 200) }
  }

  // ── Conteo de users y tenants (para detectar DBs distintas) ──
  try {
    result.counts = {
      users:   await prisma.user.count(),
      tenants: await prisma.tenant.count(),
      roles:   await prisma.role.count(),
    }
  } catch (e: any) {
    result.counts = { error: e?.message?.slice(0, 200) ?? String(e).slice(0, 200) }
  }

  return NextResponse.json(result, { status: 200 })
}
