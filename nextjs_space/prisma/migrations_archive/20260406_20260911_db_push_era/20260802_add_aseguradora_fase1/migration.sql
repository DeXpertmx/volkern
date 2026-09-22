-- Volkern Insurance — Fase 1: Ampliación Aseguradora (Bloques 1 y 2)
-- Aditiva: SOLO ADD COLUMN nullable. No toca datos existentes.

-- ─── Identificación Legal y Fiscal (Bloque 1) ─────────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "razonSocial" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "nombreComercial" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "codigoPostal" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "provincia" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "pais" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "regimenFiscal" TEXT;

-- ─── Regulación y Licencias (Bloque 2) ────────────────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "numeroRegistro" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "fechaVigenciaLicenciaInicio" TIMESTAMP(3);
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "fechaVigenciaLicenciaFin" TIMESTAMP(3);

-- ─── Notas internas ───────────────────────────────────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "notas" TEXT;
