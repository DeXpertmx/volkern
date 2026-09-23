-- Volkern Insurance — Migración aditiva completa: Aseguradora (6 bloques)
--
-- NOTA: Esta migración es la suma total de los 6 bloques de datos de la
-- aseguradora. Usa ADD COLUMN IF NOT EXISTS, por lo que es seguro aplicarla
-- sobre cualquier estado previo (incluyendo la migración Fase 1 ya aplicada
-- con los bloques 1-2). No toca datos existentes: solo añade columnas.

-- ─── Bloque 1: Identificación Legal y Fiscal ─────────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "razonSocial" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "nombreComercial" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "codigoPostal" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "provincia" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "pais" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "regimenFiscal" TEXT;

-- ─── Bloque 2: Regulación y Licencias ────────────────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "numeroRegistro" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "fechaVigenciaLicenciaInicio" TIMESTAMP(3);
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "fechaVigenciaLicenciaFin" TIMESTAMP(3);

-- ─── Bloque 3: Contacto y Representación Legal ───────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "representanteLegal" JSONB;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "mesaEntradas" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "contactosOperativos" JSONB;

-- ─── Bloque 4: Parámetros Operativos y Comerciales ───────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "modelosComision" JSONB;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "condicionesPago" JSONB;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "limitesSuscripcion" JSONB;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "gestionSiniestros" JSONB;

-- ─── Bloque 5: Configuración Financiera y Bancaria ───────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "cuentasBancarias" JSONB;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "monedaBase" TEXT;
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "monedaLiquidacion" TEXT;

-- ─── Bloque 6: Integración Técnica y Seguridad ───────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "integracionApi" JSONB;

-- ─── Notas internas ───────────────────────────────────────
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "notas" TEXT;
