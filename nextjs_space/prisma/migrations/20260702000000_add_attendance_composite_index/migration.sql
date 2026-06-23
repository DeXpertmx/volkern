-- CreateIndex
-- Modelo: Attendance (Prisma) → tabla erp_attendance_logs (Postgres physical).
-- Composite @@index([tenantId, timestamp]) requerido por el cron
-- `app/api/cron/cleanup-attendance` para garantizar `Index Scan` (no Sort/Seq Scan)
-- sobre `SELECT id WHERE "tenantId"=X AND "timestamp"<Y ORDER BY "timestamp" LIMIT 50000`.
--
-- Naming: snake_case basado en `@map("erp_attendance_logs")` (convención Prisma
-- confirmada tras auditoría 2026-06-21 — ver §7.3 callout de CRON-MAINTENANCE.md).
-- Precedente: `system_metrics_tenantId_metricType_timestamp_idx` en
-- `prisma/migrations/20260601091455_add_catalogoItemId_to_deal/migration.sql`.
--
-- Decisión: CREATE INDEX estándar (sin CONCURRENTLY).
-- Trade-off: lock de writes breve durante la creación del índice B-Tree sobre
-- millones de filas. Para staging/producción pequeña-media (≤ 1M filas), el lock
-- es del orden de segundos. Ejecutar en ventana off-peak según §11.6 del doc.
-- Si la tabla crece a billones de filas, mover a `migrations/manual/` con
-- CONCURRENTLY + paso manual `prisma migrate resolve --applied`.
CREATE INDEX "erp_attendance_logs_tenantId_timestamp_idx"
  ON "erp_attendance_logs" ("tenantId", "timestamp");
