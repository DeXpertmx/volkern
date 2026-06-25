export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma, getTenantDb } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// ─── Config ──────────────────────────────────────────────────────────────────

const MONTHS_BACK = 6

interface HistoryEntry {
  month: string // 'YYYY-MM'
  [feature: string]: number | string
}

const TRACKED_HISTORY_FEATURES = [
  { key: 'leads', label: 'Leads', table: 'lead', dateField: 'fechaCreacion' },
  { key: 'invoices', label: 'Facturas', table: 'invoice', dateField: 'fechaEmision' },
  { key: 'pages', label: 'Páginas', table: 'page', dateField: 'fechaCreacion' },
  { key: 'courses', label: 'Cursos', table: 'course', dateField: 'fechaCreacion' },
  { key: 'students', label: 'Estudiantes', table: 'student', dateField: 'fechaCreacion' },
  { key: 'catalogo_items', label: 'Productos', table: 'catalogoItem', dateField: 'fechaCreacion' },
  { key: 'contratos_sign', label: 'Contratos', table: 'contrato', dateField: 'fechaCreacion' },
]

// ─── Helper: genera meses como ['YYYY-MM', ...] ──────────────────────────────

function generateMonthsBack(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const GET = (withTenantAuth as any)(async (_request: NextRequest, auth: any) => {
  try {
    const tenantId = auth.tenant!.id
    const months = generateMonthsBack(MONTHS_BACK)

    // Build a map: month → { month, leads, invoices, ... }
    const historyMap = new Map<string, HistoryEntry>()
    for (const m of months) {
      const entry: HistoryEntry = { month: m }
      for (const feat of TRACKED_HISTORY_FEATURES) {
        entry[feat.key] = 0
      }
      historyMap.set(m, entry)
    }

    // For each feature, query the tenant DB and count by month
    for (const feat of TRACKED_HISTORY_FEATURES) {
      try {
        const tenantDb = await getTenantDb(tenantId)
        const rows: Array<{ month: string; count: bigint }> = await tenantDb.client.$queryRawUnsafe(`
          SELECT
            TO_CHAR("${feat.dateField}", 'YYYY-MM') AS month,
            COUNT(*)::bigint AS count
          FROM "${feat.table}"
          WHERE "tenantId" = $1
            AND "${feat.dateField}" >= $2::date
          GROUP BY month
          ORDER BY month ASC
        `, tenantId, `${months[0]}-01`)

        for (const row of rows) {
          const monthStr = String(row.month)
          if (historyMap.has(monthStr)) {
            historyMap.get(monthStr)![feat.key] = Number(row.count)
          }
        }
      } catch (err) {
        // Silently fail for missing tables or columns
        console.warn(`[UsageHistory] Skipping ${feat.key}: ${err}`)
      }
    }

    // Calculate monthly growth (delta vs previous month)
    const history = Array.from(historyMap.values()).sort((a, b) => a.month.localeCompare(b.month))

    const historyWithGrowth = history.map((entry, idx) => {
      const growth: Record<string, number> = {}
      if (idx > 0) {
        const prev = history[idx - 1]
        for (const feat of TRACKED_HISTORY_FEATURES) {
          const current = (entry[feat.key] as number) || 0
          const previous = (prev[feat.key] as number) || 0
          growth[`${feat.key}_growth`] = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0
        }
      } else {
        for (const feat of TRACKED_HISTORY_FEATURES) {
          growth[`${feat.key}_growth`] = 0
        }
      }
      return { ...entry, ...growth }
    })

    return NextResponse.json({
      months,
      features: TRACKED_HISTORY_FEATURES,
      history: historyWithGrowth,
    })
  } catch (error) {
    console.error('[GET /api/subscriptions/usage/history] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}, ['subscriptions:read'])
