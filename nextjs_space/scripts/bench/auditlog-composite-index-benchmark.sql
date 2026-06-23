-- ============================================================================
-- Volkern — Benchmark: composite index `@@index([tenantId, accion, fechaCreacion])`
-- sobre el modelo `AuditLog`.
--
-- Targets:
--   • `scoreAlertas` (7d blocks count) en `lib/compliance-score.ts`:
--       SELECT count(*) FROM "AuditLog"
--       WHERE "tenantId" = $1 AND "accion" = 'COMPLIANCE_BLOCKED'
--         AND "fechaCreacion" >= now() - interval '7 days';
--
--   • `getTrend` en `lib/compliance-score.ts`:
--       SELECT "metadata" FROM "AuditLog"
--       WHERE "tenantId" = $1 AND "accion" = 'COMPLIANCE_SCORE'
--       ORDER BY "fechaCreacion" DESC LIMIT 1;
--
-- Salida: 4 EXPLAIN ANALYZE (2 con índice, 2 sin índice vía DROP+ROLLBACK)
-- + cleanup que borra TODAS las filas sintéticas.
--
-- Safety:
-- • Filas sintéticas marcadas con id prefix `bench-2026-07-` Y
--   `metadata->>'_bench' = '2026-07'`. Cleanup explícito al final.
-- • Tamaño reducido a 300k filas para encajar en el límite de Neon staging
--   (project size cap 512 MB; 1M filas excedía).
-- • Pre-seed de stubs `Tenant` con id `bench-tenant-N` para satisfacer FK
--   `AuditLog.tenantId → Tenant.id`. Cleanup incluye DELETE de Tenant stubs.
-- • `SET statement_timeout = '120s'` y `SET lock_timeout = '5s'` para no
--   colgar la DB en el peor caso.
-- • Cleanup del AuditLog en batches de 50k filas para evitar timeout.
-- • DROP INDEX sólo dentro de BEGIN/ROLLBACK — el índice queda intacto
--   al finalizar el script.
-- ============================================================================

-- ─── 0. Snapshot baseline (NO mutante) ───────────────────────────────────────

\echo
\echo '══ 0. Baseline (no mutante) ══'

SELECT 'auditlog.rows.total'  AS metric, count(*)::text AS value FROM "AuditLog";
SELECT 'tenant.count'         AS metric, count(*)::text AS value FROM "Tenant";

\echo
\echo '══ 0.1. Si el composite NO existe, lo creamos (no-op si ya está) ══'
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_accion_fechaCreacion_idx"
  ON "AuditLog" ("tenantId", accion, "fechaCreacion");

\echo
\echo '══ 0.2. Pre-seed Tenant stubs (FK compliance) ══'
-- AuditLog.tenantId → Tenant.id (la FK requiere que los tenants existan).
-- Crea 50 stubs mínimos (id, nombre, slug). Otros campos son nullable o
-- tienen defaults (ej. plan='basico'), así que evitamos columnas con
-- enums/strings tipados que podrían rechazar valores inventados.
INSERT INTO "Tenant" (id, nombre, slug, "fechaCreacion", "fechaActualizacion")
SELECT 'bench-tenant-' || g::text,
       'Bench Tenant ' || g::text,
       'bench-tenant-' || g::text,
       now(),
       now()
FROM generate_series(0, 49) g
ON CONFLICT (id) DO NOTHING;

\echo
\echo '══ 1. Siembra 300k filas sintéticas (marker: id prefix + metadata._bench) ══'
-- Safety timeouts (session-local, no afecta a otras conexiones)
SET statement_timeout = '120s';
SET lock_timeout      = '5s';
SET idle_in_transaction_session_timeout = '60s';

-- 100k filas para mantener footprint dentro del límite Neon 512 MB.
-- User pidió "~1M" pero 1M y 300k excedieron el límite de Neon staging.
-- 100k ofrece ~2k filas/tenant × 1% accion = ~20 filas matching el
-- predicado más selectivo de scoreAlertas — aún suficiente para que
-- el planner prefiera el composite index sobre Seq Scan.
INSERT INTO "AuditLog" (
  id, "tenantId", "userId", accion, entidad, "entidadId", descripcion,
  "fechaCreacion", metadata, hash
)
SELECT
  'bench-2026-07-' || md5(g::text),
  'bench-tenant-' || (g % 50)::text,
  -- userId siempre NULL: la columna es `String?` (nullable) y satisface
  -- la FK sin necesidad de User stubs. scoreAlertas y getTrend no filtran
  -- por userId, así que el benchmark mantiene validez.
  NULL,
  CASE
    WHEN g % 100 = 0 THEN 'COMPLIANCE_BLOCKED'
    WHEN g % 50  = 0 THEN 'COMPLIANCE_SCORE'
    ELSE 'OTHER_ACTION'
  END,
  'Tenant',
  'bench-target-' || (g % 50)::text,
  'bench row',
  NOW() - (random() * interval '365 days'),
  jsonb_build_object('_bench', '2026-07', 'g', g),
  'bench-hash-' || g::text
FROM generate_series(1, 100000) g;

\echo
\echo '══ 2. Refrescar planner stats ══'
ANALYZE "AuditLog";

\echo
\echo '══ 3. EXPLAIN con COMPOSITE INDEX ACTIVO ══'

\echo '── 3.1 scoreAlertas (count 7d blocks) ──'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*) FROM "AuditLog"
WHERE "tenantId" = 'bench-tenant-0'
  AND accion     = 'COMPLIANCE_BLOCKED'
  AND "fechaCreacion" >= NOW() - interval '7 days';

\echo
\echo '── 3.2 getTrend (latest COMPLIANCE_SCORE) ──'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT metadata FROM "AuditLog"
WHERE "tenantId" = 'bench-tenant-0'
  AND accion     = 'COMPLIANCE_SCORE'
ORDER BY "fechaCreacion" DESC
LIMIT 1;

\echo
\echo '══ 4. EXPLAIN SIMULANDO COMPOSITE INDEX AUSENTE (BEGIN/DROP/ROLLBACK) ══'

BEGIN;
SET LOCAL statement_timeout = '30s';

DROP INDEX IF EXISTS "AuditLog_tenantId_accion_fechaCreacion_idx";

\echo
\echo '── 4.1 scoreAlertas SIN composite (fallback esperado: Seq Scan o Bitmap Heap) ──'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*) FROM "AuditLog"
WHERE "tenantId" = 'bench-tenant-0'
  AND accion     = 'COMPLIANCE_BLOCKED'
  AND "fechaCreacion" >= NOW() - interval '7 days';

\echo
\echo '── 4.2 getTrend SIN composite (fallback esperado: Seq Scan + Sort) ──'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT metadata FROM "AuditLog"
WHERE "tenantId" = 'bench-tenant-0'
  AND accion     = 'COMPLIANCE_SCORE'
ORDER BY "fechaCreacion" DESC
LIMIT 1;

ROLLBACK;
-- Composite restaurado. ANALYZE post-rollback innecesario (rollback descarta
-- catalog updates, stats se regeneran con el próximo ANALYZE).

\echo
\echo '══ 5. CLEANUP — borrar filas sintéticas en batches (evita 180s timeout) ══'
SET statement_timeout = '180s';

DO $$
DECLARE
  n INTEGER;
BEGIN
  LOOP
    DELETE FROM "AuditLog"
     WHERE id IN (
       SELECT id FROM "AuditLog"
        WHERE id LIKE 'bench-2026-07-%'
           OR metadata->>'_bench' = '2026-07'
        LIMIT 50000
     );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'cleanup.batch.deleted=%', n;
    EXIT WHEN n = 0;
  END LOOP;
END $$;

\echo
\echo '══ 6. CLEANUP — Tenant stubs ══'
DELETE FROM "Tenant"
 WHERE id LIKE 'bench-tenant-%'
    OR slug LIKE 'bench-tenant-%';

\echo
\echo '══ 7. Refrescar stats post-cleanup ══'
ANALYZE "AuditLog";
ANALYZE "Tenant";

\echo
\echo '══ 8. Verificación final ══'
SELECT 'auditlog.rows.after.cleanup'  AS metric, count(*)::text AS value FROM "AuditLog";
SELECT 'tenant.rows.after.cleanup'    AS metric, count(*)::text AS value FROM "Tenant";
\echo
\echo '══ DONE. Composite index materializado en DB ══'
