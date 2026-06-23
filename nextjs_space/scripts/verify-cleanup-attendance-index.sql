-- =====================================================================
-- scripts/verify-cleanup-attendance-index.sql
--
-- Verifica con EXPLAIN ANALYZE que el cron job `app/api/cron/cleanup-attendance`
-- usa el composite index `@@index([tenantId, timestamp])` del modelo Attendance
-- para procesar DELETE WHERE tenantId=X AND timestamp<Y en batches de 50k.
--
-- USO:
--   $ psql "$DATABASE_URL" -f scripts/verify-cleanup-attendance-index.sql
--
-- SALIDA ESPERADA (texto del plan, fragmento crítico):
--   Limit  (cost=... rows=... width=...) (actual time=... rows=... loops=...)
--     ->  Index Scan using Attendance_tenantId_timestamp_idx on erp_attendance_logs
--           Index Cond: (("tenantId" = 't-...') AND ("timestamp" < ...))
--           ...
--
-- RED FLAGS (regresión ⇒ el composite index NO se está usando):
--   * "Bitmap Heap Scan"     → indica BitmapAnd entre índices individuales (más lento).
--   * "Seq Scan on erp_attendance_logs" → table scan (muy malo a escala).
--   * Sort node entre Index Scan y Limit → re-sort en memoria (overhead).
--
-- IMPORTANTE:
--   • Prisma preserva camelCase en columnas Postgres usando comillas dobles.
--     Por eso usamos "tenantId" y "timestamp" (no `tenant_id`).
--   • El `ORDER BY "timestamp" ASC` es CRÍTICO: sin él, Postgres podría usar
--     Bitmap Heap Scan entre índices individuales aunque el composite exista.
--   • El nombre del índice es `Attendance_tenantId_timestamp_idx` (basado en
--     el NOMBRE DEL MODELO, no del @map("erp_attendance_logs")). Si Prisma
--     version-future cambia la naming convention, ajustar este script.
-- =====================================================================

-- ─── Parámetros editables (ajustar al tenant real si se necesita) ────
\set tenant_id  '''t-demo'''
\set cutoff_iso '''2022-07-21 03:00:00+00'''  -- ahora - 1460 días (default retention)

-- ─── Plan del helper purgeTenantInBatches (Postgres 12+) ────────────
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id
FROM erp_attendance_logs
WHERE "tenantId" = :tenant_id
  AND "timestamp" < :cutoff_iso
ORDER BY "timestamp" ASC
LIMIT 50000;

-- ─── Sanity adicional: distribución por tenant para confirmar que el ─
--     índice resuelve rápido incluso con miles de filas por tenant. ──
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM erp_attendance_logs
WHERE "tenantId" = :tenant_id
  AND "timestamp" < :cutoff_iso;
