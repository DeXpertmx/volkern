-- Registro de idempotencia de acciones de automatización ya ejecutadas.
-- Evita que un webhook reenviado o una regla re-evaluada cree dos tareas,
-- dos limpiezas o envíe dos veces el mismo mensaje: la clave (acción +
-- ámbito + variante) es única por tenant.
CREATE TABLE "automation_action_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "entityId" TEXT,
    "jobId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'done',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_action_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_action_executions_tenantId_key_key" ON "automation_action_executions"("tenantId", "key");
CREATE INDEX "automation_action_executions_tenantId_idx" ON "automation_action_executions"("tenantId");
CREATE INDEX "automation_action_executions_estado_idx" ON "automation_action_executions"("estado");

ALTER TABLE "automation_action_executions"
    ADD CONSTRAINT "automation_action_executions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
