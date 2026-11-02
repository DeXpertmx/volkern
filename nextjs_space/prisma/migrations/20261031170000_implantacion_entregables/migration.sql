-- Selección de informes y plantillas del alta guiada.
--
-- El alta ya proponía informes y plantillas, pero no guardaba cuáles elige el
-- cliente ni dejaba constancia de haberlas aplicado: al entrar, el panel estaba
-- vacío. `informes` y `plantillas` guardan la elección (ids del catálogo) y
-- `entregablesAplicadosEn` la última vez que se materializó en la cuenta, para
-- que aplicar sea idempotente y auditable.
ALTER TABLE "implantacion_tenant" ADD COLUMN "informes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "implantacion_tenant" ADD COLUMN "plantillas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "implantacion_tenant" ADD COLUMN "entregablesAplicadosEn" TIMESTAMP(3);
