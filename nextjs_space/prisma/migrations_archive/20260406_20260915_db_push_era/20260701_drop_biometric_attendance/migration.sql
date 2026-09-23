-- Migration: drop_biometric_attendance
-- Fecha: 2026-07-01
-- Descripción: Elimina captura biométrica facial (selfie + vector facial) del
-- sistema de control horario de Volkern. Solo se conserva geolocalización puntual
-- (RGPD Art. 6) más la cadena de integridad HMAC-SHA256.
--
-- Antes de ejecutar esta migración en producción:
--   1. Avisar a los tenants activos (email admin@volkern.app).
--   2. Hacer backup completo de la DB.
--   3. Borrar archivos físicos del storage (S3 / GCS) a los que apuntaba `evidence_url`.
--   4. Mantener un registro de auditoría en `securityIncidents` por si surgen
--      disputas laborales basadas en selfies pasadas.

-- 1) Eliminar columna evidenceUrl de erp_attendance_logs
ALTER TABLE "erp_attendance_logs" DROP COLUMN IF EXISTS "evidenceUrl";

-- 2) Eliminar la tabla erp_attendance_challenges completamente (era RANDOM_SELFIE pulses)
DROP TABLE IF EXISTS "erp_attendance_challenges";

-- 3) Eliminar columna faceVector de erp_employees (legacy biometric embedding)
ALTER TABLE "erp_employees" DROP COLUMN IF EXISTS "faceVector";

-- 4) Nuevas columnas para cumplimiento RGPD/LOPDGDD Art. 88
ALTER TABLE "erp_employees" ADD COLUMN IF NOT EXISTS "noticeAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "erp_employees" ADD COLUMN IF NOT EXISTS "noticeVersionAccepted" TEXT;
ALTER TABLE "erp_employees" ADD COLUMN IF NOT EXISTS "acceptedPolicies" JSONB DEFAULT '[]'::jsonb;

-- 5) Nuevas columnas en erp_attendance_rules (config anti-spoofing + compliance)
ALTER TABLE "erp_attendance_rules" ADD COLUMN IF NOT EXISTS "maxTravelKmh" INTEGER NOT NULL DEFAULT 250;
ALTER TABLE "erp_attendance_rules" ADD COLUMN IF NOT EXISTS "minPunchIntervalSec" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "erp_attendance_rules" ADD COLUMN IF NOT EXISTS "retentionDays" INTEGER NOT NULL DEFAULT 1460;
ALTER TABLE "erp_attendance_rules" ADD COLUMN IF NOT EXISTS "noticeVersion" TEXT NOT NULL DEFAULT 'v1-2026-gps-only';
ALTER TABLE "erp_attendance_rules" ADD COLUMN IF NOT EXISTS "blockIfNotNoticed" BOOLEAN NOT NULL DEFAULT false;

-- 6) DROP de las columnas obsolete de erp_attendance_rules
ALTER TABLE "erp_attendance_rules" DROP COLUMN IF EXISTS "requireSelfie";
ALTER TABLE "erp_attendance_rules" DROP COLUMN IF EXISTS "randomPulsesPerDay";

-- 7) Crear tabla erp_idempotency_keys (lock-free idempotency RFC Stripe-style)
CREATE TABLE IF NOT EXISTS "erp_idempotency_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "erp_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- UNIQUE constraint previene race conditions entre dos POST concurrentes con mismo key
CREATE UNIQUE INDEX IF NOT EXISTS "erp_idempotency_keys_tenantId_scope_key_key"
    ON "erp_idempotency_keys"("tenantId", "scope", "key");
CREATE INDEX IF NOT EXISTS "erp_idempotency_keys_tenantId_idx"
    ON "erp_idempotency_keys"("tenantId");
CREATE INDEX IF NOT EXISTS "erp_idempotency_keys_expiresAt_idx"
    ON "erp_idempotency_keys"("expiresAt");

-- 8) FK constraint al tenant (cascade on delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'erp_idempotency_keys_tenantId_fkey'
    ) THEN
        ALTER TABLE "erp_idempotency_keys"
        ADD CONSTRAINT "erp_idempotency_keys_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;
    END IF;
END$$;

-- 9) Comentarios SQL para auditoría futura
COMMENT ON TABLE "erp_idempotency_keys" IS
    'Cache de respuestas idempotentes estilo Stripe. Retiene hasta 24h con UNIQUE(scope, key) atomico.';
COMMENT ON TABLE "erp_attendance_logs" IS
    'Marcajes de asistencia: SOLO GPS + HMAC integrity. RGPD: Art. 9 (no biometricos).';
