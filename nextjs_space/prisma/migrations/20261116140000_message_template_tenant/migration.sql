-- Las plantillas de mensajes pasan a ser por tenant. La columna es nullable
-- para no romper filas existentes; el backfill de las antiguas se hace aparte
-- porque el tenant correcto no se puede deducir desde el esquema.
ALTER TABLE "MessageTemplate" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "MessageTemplate_tenantId_idx" ON "MessageTemplate"("tenantId");
