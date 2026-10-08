/**
 * app/api/cron/cleanup-attendance/route.ts
 *
 * GET /api/cron/cleanup-attendance
 *
 * Job diario (03:00 UTC) programado en el crontab de root del VPS, que lo
 * invoca vía `deploy-vps/cron.sh cleanup-attendance`. Purga datos del sistema
 * de Control Horario conforme a la política de retención RGPD Art. 5.1.e.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ALCANCE DE LA PURGA
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  (a) **erp_attendance_logs** (modelo `Attendance`):
 *      Para CADA tenant activo, se eliminan los marcajes con
 *      `timestamp < now - tenant.attendanceRules.retentionDays`.
 *      Por defecto `retentionDays = 1460` (≈ 4 años), alineado con la
 *      prescripción de obligaciones tributarias (Ley Gral. Tributaria Art. 66)
 *      y laborales (LISOS Art. 7). Por tenant el DPO puede extenderlo hasta
 *      5 años como máximo recomendado.
 *
 *      ── Estrategia de purga ──
 *      Se itera en batches de 50k filas (`ATTENDANCE_BATCH_SIZE`) con:
 *        1. `attendance.findMany({select:{id}, take:50_000,
 *                                 where:{tenantId,timestamp:{lt:cutoff}},
 *                                 orderBy:{timestamp:'asc'}})`
 *        2. `attendance.deleteMany({where:{id:{in: ids}}})`
 *        3. Repetir hasta `rows.length < 50_000` (última batch parcial).
 *      El `orderBy` + `LIMIT` fuerza al planner de Postgres a usar **Index
 *      Scan** sobre el composite `@@index([tenantId, timestamp])` en lugar de
 *      un Bitmap Heap Scan entre los índices individuales. Verificable con
 *      `scripts/verify-cleanup-attendance-index.sql` (EXPLAIN ANALYZE).
 *
 *  (b) **erp_idempotency_keys** (modelo `IdempotencyKey`):
 *      Se eliminan todas las claves donde `expiresAt < now`. El TTL estándar
 *      es de 24h pero si un scope futuro usa TTL mayor, también se respeta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ NO SE PURGA
 * ────────────────────────────────────────────────────────────────────────────
 *   • `AuditLog`           → se conserva indefinidamente (trazabilidad inmutable).
 *   • `Employee.noticeAcknowledgedAt`, `acceptedPolicies` → metadatos de
 *                                 cumplimiento LOPDGDD Art. 88: se conservan
 *                                 mientras la relación esté vigente + 4 años.
 *   • `AttendanceRules`    → configuración del tenant, no datos personales.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ────────────────────────────────────────────────────────────────────────────
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (sólo en producción).
 *           Fuera de producción se permite sin auth para desarrollo local.
 *   • Riesgo de locking: el batch de 50k rows evita que un único
 *           `DELETE WHERE ...` mantenga row locks durante minutos. Si el
 *           dataset supera ~10⁶ filas por tenant, los batches consecutivos
 *           permiten concurrencia y replication lag acotado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONSIDERACIONES OPERATIVAS
 * ────────────────────────────────────────────────────────────────────────────
 *   • Duración máxima en Vercel Hobby: 60 s. En Pro: 300 s.
 *   • Si el job supera el límite, Vercel re-ejecuta al día siguiente — el
 *     endpoint es idempotente (la siguiente corrida recoge los rows restantes).
 *   • Dry-run (`?dryRun=1`): inspección con `count()` único por tenant; no
 *     ejecuta deletes efectivos.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Pro plan; en Hobby ajustar a 60 y partir en batches.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const DEFAULT_RETENTION_DAYS = 1460; // Espejo de `AttendanceRules.retentionDays @default(1460)`.
const MIN_RETENTION_DAYS = 1; // Floor operacional defensivo (no debería ser < 1 día).
const MAX_RETENTION_DAYS = 1825; // 5 años — techo recomendado por compliance.
const ATTENDANCE_BATCH_SIZE = 50_000; // 50k filas por batch — minimiza lock-time en Postgres.

interface TenantCleanupSummary {
  tenantId: string;
  tenantName: string;
  retentionDays: number;
  cutoffIso: string;
  deletedAttendance: number;
  /** Número de batches ejecutados para este tenant (1 en dry-run). */
  batches: number;
  error?: string;
}

interface CleanupSummary {
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  tenantsProcessed: number;
  tenantsFailed: number;
  idempotency: { deleted: number };
  attendance: {
    totalDeleted: number;
    /** Suma de batches ejecutados en todos los tenants. Útil para observabilidad. */
    totalBatches: number;
    byTenant: TenantCleanupSummary[];
  };
  dryRun: boolean;
}

/**
 * Helper compartido: ajusta `retentionDays` a un rango operativo seguro.
 * NUNCA borra más allá de lo que el DPO/admin del tenant configuró, pero
 * capamos por seguridad a un rango razonable.
 */
function clampRetention(rawDays: number | null | undefined): number {
  const d = typeof rawDays === 'number' && rawDays > 0 ? rawDays : DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.floor(d)));
}

/**
 * Purga marcajes de un tenant iterando en batches de `ATTENDANCE_BATCH_SIZE`.
 *
 * COMPORTAMIENTO:
 *   • `dryRun === true`  → ejecuta un único `count()` (no borra nada) → `batches: 1`.
 *   • `dryRun === false` → loop:
 *       1. `findMany({select:{id}, take:N, where:{tenantId,timestamp}, orderBy:{timestamp:'asc'}})`
 *       2. Si 0 rows → break.
 *       3. `deleteMany({where:{id:{in: ids}}})` → acumula `deleted += result.count`.
 *       4. Si `rows.length < ATTENDANCE_BATCH_SIZE` → última batch parcial → break.
 *     Total returned: `{deleted, batches}`.
 *
 * El `orderBy: {timestamp:'asc'}` junto con el `LIMIT` (vía `take`) fuerza al
 * planner a usar el composite `@@index([tenantId, timestamp])` mediante
 * Index Scan (no Bitmap Heap Scan entre los índices individuales). Esto evita
 * full-table scans para tenants con millones de marcajes.
 *
 * @throws Re-emite cualquier error de Prisma para que el caller per-tenant
 *         decida si continuar o abortar.
 */
async function purgeTenantInBatches(
  tenantId: string,
  cutoff: Date,
  dryRun: boolean,
): Promise<{ deleted: number; batches: number }> {
  if (dryRun) {
    // Inspección: un único count() con el where filtrado por el composite index.
    const count = await prisma.attendance.count({
      where: { tenantId, timestamp: { lt: cutoff } },
    });
    return { deleted: count, batches: 1 };
  }

  let deleted = 0;
  let batches = 0;
  while (true) {
    const rows = await prisma.attendance.findMany({
      select: { id: true },
      where: { tenantId, timestamp: { lt: cutoff } },
      take: ATTENDANCE_BATCH_SIZE,
      orderBy: { timestamp: 'asc' },
    });
    if (rows.length === 0) break;

    batches++;
    const result = await prisma.attendance.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    deleted += result.count;

    // Última batch parcial → no quedan más ids expirados.
    if (rows.length < ATTENDANCE_BATCH_SIZE) break;
  }
  return { deleted, batches };
}

export async function GET(request: NextRequest) {
  // ── Auth (Header Bearer CRON_SECRET) ────────────────────────────────────
  // Patrón consistente con `uptime-developers` y los demás cron handlers activos en `app/api/cron/`.
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido en producción.' },
        { status: 401 },
      );
    }
  }

  const startedAt = new Date();
  const now = startedAt;

  const summary: CleanupSummary = {
    startedAtIso: startedAt.toISOString(),
    finishedAtIso: '',
    durationMs: 0,
    tenantsProcessed: 0,
    tenantsFailed: 0,
    idempotency: { deleted: 0 },
    attendance: { totalDeleted: 0, totalBatches: 0, byTenant: [] },
    dryRun: false,
  };

  // Soporte ?dryRun=1 para inspección manual sin deletes efectivos.
  const url = new URL(request.url);
  summary.dryRun = url.searchParams.get('dryRun') === '1';

  try {
    // ════════════════════════════════════════════════════════════════════════
    // (b) Idempotency keys — purga global independiente del tenant.
    //     `expiresAt < now` ya está indexado (ver schema.prisma @@index([expiresAt]))
    //     por lo que el deleteMany es O(log n) en planificación.
    // ════════════════════════════════════════════════════════════════════════
    if (summary.dryRun) {
      summary.idempotency.deleted = await prisma.idempotencyKey.count({
        where: { expiresAt: { lt: now } },
      });
    } else {
      const result = await prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      summary.idempotency.deleted = result.count;
    }

    // ════════════════════════════════════════════════════════════════════════
    // (a) Marcajes — purga por tenant respetando `retentionDays` configurado.
    //
    //     Estrategia: cargar (id, slug, attendanceRules.retentionDays) en una
    //     sola query (no N+1), luego iterar batches de 50k por tenant. Manejo
    //     de errores per-tenant: si un tenant falla, seguimos procesando los
    //     demás (un fallo en uno no debe bloquear la cleanup global).
    // ════════════════════════════════════════════════════════════════════════
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        nombre: true,
        attendanceRules: { select: { retentionDays: true } },
      },
    });

    for (const tenant of tenants) {
      // Contador en scope externo al try: si deleteMany de un batch N falla,
      // preservamos los deletes parciales de los batches 1..N-1.
      let deletedCount = 0;
      let batchesCount = 0;
      try {
        const retentionDays = clampRetention(
          tenant.attendanceRules?.retentionDays,
        );
        const cutoff = new Date(
          now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
        );

        const result = await purgeTenantInBatches(
          tenant.id,
          cutoff,
          summary.dryRun,
        );
        deletedCount = result.deleted;
        batchesCount = result.batches;

        summary.attendance.byTenant.push({
          tenantId: tenant.id,
          tenantName: tenant.nombre,
          retentionDays,
          cutoffIso: cutoff.toISOString(),
          deletedAttendance: deletedCount,
          batches: batchesCount,
        });
        summary.attendance.totalDeleted += deletedCount;
        summary.attendance.totalBatches += batchesCount;
        summary.tenantsProcessed++;
      } catch (err: any) {
        summary.tenantsFailed++;
        summary.attendance.byTenant.push({
          tenantId: tenant.id,
          tenantName: tenant.nombre,
          retentionDays: clampRetention(
            tenant.attendanceRules?.retentionDays,
          ),
          cutoffIso: '',
          deletedAttendance: deletedCount, // preserva deletes parciales exitosos.
          batches: batchesCount, // preserva nº de batches ejecutados antes del fallo.
          error: err?.message ?? String(err),
        });
        console.error(
          `[Cron/CleanupAttendance] Tenant ${tenant.id} falló en purga ` +
          `(deletedParciales=${deletedCount}, batchesOk=${batchesCount}):`,
          err?.message ?? err,
        );
        // NO re-throw: continuar con siguientes tenants para no abortar el job.
      }
    }

    summary.finishedAtIso = new Date().toISOString();
    summary.durationMs = summary.finishedAtIso
      ? new Date(summary.finishedAtIso).getTime() - startedAt.getTime()
      : 0;

    console.log(
      `[Cron/CleanupAttendance] ${summary.dryRun ? 'DRY-RUN' : 'DONE'} ` +
        `idempotencyKeys=${summary.idempotency.deleted} ` +
        `attendance=${summary.attendance.totalDeleted} ` +
        `batches=${summary.attendance.totalBatches} ` +
        `tenantsOK=${summary.tenantsProcessed} ` +
        `tenantsFailed=${summary.tenantsFailed} ` +
        `durationMs=${summary.durationMs}`,
    );

    const httpStatus = summary.tenantsFailed === tenants.length ? 500 : 200;
    return NextResponse.json({ success: httpStatus === 200, summary }, {
      status: httpStatus,
    });
  } catch (error: any) {
    console.error('[Cron/CleanupAttendance] Error fatal:', error);
    summary.finishedAtIso = new Date().toISOString();
    summary.durationMs =
      new Date(summary.finishedAtIso).getTime() - startedAt.getTime();
    return NextResponse.json(
      {
        error: error?.message ?? 'Error desconocido en cleanup-attendance',
        summary,
      },
      { status: 500 },
    );
  }
}
