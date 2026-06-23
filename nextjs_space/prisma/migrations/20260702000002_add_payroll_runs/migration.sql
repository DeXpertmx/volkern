-- ════════════════════════════════════════════════════════════════════════════
-- Volkern Partner API — Phase 2 (payroll run + AEAT submission)
--
-- Purpose    : Permitir que Volkern Hostelería (SaaS restaurantero) dispare
--              el cálculo + sellado + envío AEAT de nóminas mensuales de sus
--              empleados, agrupadas bajo un mismo run (1 run = 1 mes del tenant).
--
-- Strategy   :
--   - Nueva tabla `PayrollRunES` (erp_payroll_runs_es) agrega nóminas (1 row
--     por mes × tenant). Permite estados asíncronos (PENDING → RUNNING → SEALED
--     → AEAT_QUEUED → AEAT_SUBMITTED|ACCEPTED|REJECTED|ERROR).
--   - FK `payrollRunId` en `PayrollRecordES` con `onDelete: SetNull` para que
--     borrar un run no rompa nóminas ya calculadas (preserva auditoría histórica).
--   - `@@unique([tenantId, period])` garantiza idempotencia a nivel mes/tenant
--     (no se pueden crear dos runs para el mismo periodo).
--   - `@@unique([tenantId, idempotencyKey])` para el cache de idempotency-key.
--
-- Reversible : DROP TABLE + DROP COLUMN son reversibles. Si quedan PayrollRecordES
--              con payrollRunId huerfano, el onDelete: SetNull los limpia.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "erp_payroll_runs_es" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "period"          TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "externalRunRef"  TEXT,
  "idempotencyKey"  TEXT,
  "totalRecords"    INTEGER NOT NULL DEFAULT 0,
  "acceptedCount"   INTEGER NOT NULL DEFAULT 0,
  "rejectedCount"   INTEGER NOT NULL DEFAULT 0,
  "errorCount"      INTEGER NOT NULL DEFAULT 0,
  "convenioCode"    TEXT,
  "lastError"       TEXT,
  "initiatedBy"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"     TIMESTAMP(3),
  "submittedAt"     TIMESTAMP(3),

  CONSTRAINT "PayrollRunES_pkey" PRIMARY KEY ("id")
);

-- AlterTable : añadir FK column a PayrollRecordES
ALTER TABLE "erp_payroll_records_es"
  ADD COLUMN "payrollRunId" TEXT;

-- CreateIndex (lookup por run)
CREATE INDEX "erp_payroll_records_es_payrollRunId_idx"
  ON "erp_payroll_records_es"("payrollRunId");

-- CreateIndex (uniqueness per tenant × period → idempotencia a nivel run)
CREATE UNIQUE INDEX "erp_payroll_runs_es_tenantId_period_key"
  ON "erp_payroll_runs_es"("tenantId", "period");

-- CreateIndex (uniqueness per tenant × idempotency-key → cache dedupe)
CREATE UNIQUE INDEX "erp_payroll_runs_es_tenantId_idempotencyKey_key"
  ON "erp_payroll_runs_es"("tenantId", "idempotencyKey");

-- CreateIndex (status — para listar runs activos)
CREATE INDEX "erp_payroll_runs_es_status_idx"
  ON "erp_payroll_runs_es"("status");

-- AddForeignKey : payrollRecord → payrollRun (SetNull preserva auditoría)
ALTER TABLE "erp_payroll_records_es"
  ADD CONSTRAINT "erp_payroll_records_es_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "erp_payroll_runs_es"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
