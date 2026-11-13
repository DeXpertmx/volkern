-- Fecha de baja propia de la cuenta.
--
-- El churn se fechaba con `fechaActualizacion`, que cambia con cualquier
-- edición del tenant (un cambio de plan, de dominio, de MRR…). Así una cuenta
-- suspendida en junio podía contarse como baja en el periodo en el que alguien
-- tocó cualquier otro campo. `fechaBaja` se escribe solo al entrar en un estado
-- de baja y se limpia al reactivar.
ALTER TABLE "Tenant" ADD COLUMN "fechaBaja" TIMESTAMP(3);

-- Cuentas ya dadas de baja: no hay histórico fiable de cuándo cambiaron de
-- estado, así que se toma su última actualización como mejor aproximación.
-- Solo se rellena cuando el estado actual es de baja.
UPDATE "Tenant"
SET "fechaBaja" = "fechaActualizacion"
WHERE "estado" IN ('cancelado', 'suspendido', 'inactivo')
  AND "fechaBaja" IS NULL;

CREATE INDEX "Tenant_fechaBaja_idx" ON "Tenant"("fechaBaja");
