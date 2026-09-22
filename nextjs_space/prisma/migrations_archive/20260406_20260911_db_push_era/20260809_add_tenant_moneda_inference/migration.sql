-- AddTenantMonedaInference
-- Modelo: Tenant (Prisma, sin `@map`) → tabla "Tenant" (Postgres, quoted PascalCase).
--
-- Trazabilidad programática de POR QUÉ cada tenant tiene su moneda actual:
--   • monedaInferida           — snapshot de la última moneda puesta (String, nullable).
--   • monedaInferenciaSource   — fuente de la inferencia (enum).
--
-- Valores del enum:
--   • EXPLICIT     — operador eligió vía CLI flag, API body, o PATCH manual.
--   • USER_PROMPT  — selección del usuario en prompt interactivo (TTY).
--   • IMPORT_AUTO  — auto-set por lib/insurance/post-import-moneda-autofix.ts.
--   • FALLBACK     — default heredado del schema ('MXN'), nunca establecido.
--
-- Por qué este migration:
--   1. Antes: el superadmin tenía que inferir el "porqué" leyendo scripts/
--      auditLogs uno por uno. Ahora puede listar en una query:
--        SELECT id, slug, moneda, "monedaInferenciaSource"
--        FROM "Tenant"
--        WHERE "monedaInferenciaSource" = 'FALLBACK';
--      y ver de un vistazo todos los tenants con moneda heredada del default MXN.
--
--   2. Antes: si un broker tenía `moneda='MXN'`, no sabíamos si fue:
--      (a) el default schema y nunca entrado al onboarding;
--      (b) el broker lo eligió explícitamente desde España;
--      (c) fue auto-set por import y algo lo revirtió después.
--      Ahora cada cambio a `moneda` debe actualizar también `monedaInferida`
--      y `monedaInferenciaSource` (regla documentada en
--      docs/MONEDA_TENANT_Y_PORTFOLIO.md → §Cómo prevenir regresiones futuras).
--
--   3. Nullable en migración: tenants existentes quedan con `monedaInferenciaSource=NULL`.
--      Un script backfill (`scripts/backfill-moneda-inference.ts`) los marca como
--      FALLBACK si `moneda=MXN` (el schema default), o como EXPLICIT si
--      auditoría histórica muestra cambio manual.
--
-- Naming convention (auditada en §7.3 de CRON-MAINTENANCE.md):
--   <Table>_<col1>[_<col2>...>_idx     (= mismo formato que los @@index preexistentes).
--
-- Decisión: CREATE INDEX estándar (sin CONCURRENTLY), siguiendo el precedente
-- de las cinco migraciones anteriores.

-- CreateEnum
CREATE TYPE "MonedaInferenciaSource" AS ENUM (
  'EXPLICIT',
  'USER_PROMPT',
  'IMPORT_AUTO',
  'FALLBACK'
);

-- AlterTable
ALTER TABLE "Tenant"
  ADD COLUMN "monedaInferida"          TEXT,
  ADD COLUMN "monedaInferenciaSource"  "MonedaInferenciaSource" DEFAULT 'FALLBACK';

-- CreateIndex (para queries del tipo "listar tenants con moneda heredada del default MXN")
CREATE INDEX "Tenant_monedaInferenciaSource_idx"
  ON "Tenant"("monedaInferenciaSource");
