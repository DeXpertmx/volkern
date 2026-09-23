-- ════════════════════════════════════════════════════════════════════════════
-- Volkern Partner API — Phase 1.5 (employees pass-through)
--
-- Purpose    : Permitir que Volkern Hostelería (SaaS restaurantero) identifique
--              empleados en Volkern Core mediante un `externalEmployeeId` propio,
--              sin colisiones entre tenants.
--
-- Strategy   : Column `externalEmployeeId String?` nullable (empleados legacy
--              sin integrar quedan intactos). Composite UNIQUE per-tenant —
--              Gold Standard B2B SaaS mapping (lock-free para upserts
--              concurrentes). Index compuesto para lookup O(log n) desde
--              `GET /api/v1/partner/employees?externalEmployeeId=X`.
--
-- Reversible : DROP INDEX + DROP COLUMN son operaciones reversibles sin pérdida.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "erp_employees" ADD COLUMN "externalEmployeeId" TEXT;

-- CreateIndex (lookup)
-- Permite `WHERE tenantId = $1 AND externalEmployeeId = $2` con index scan.
CREATE INDEX "erp_employees_tenantId_externalEmployeeId_idx"
  ON "erp_employees"("tenantId", "externalEmployeeId");

-- CreateIndex (uniqueness constraint per-tenant)
-- Bloquea duplicados cross-tenant: un restaurante SaaS nunca podrá tener dos
-- empleados con el mismo externalEmployeeId, pero el mismo externalEmployeeId
-- PUEDE existir en distintos tenants (ideal si migra de restaurante).
CREATE UNIQUE INDEX "erp_employees_tenantId_externalEmployeeId_key"
  ON "erp_employees"("tenantId", "externalEmployeeId");
