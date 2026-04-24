-- VOLKERN TASKFORCE: ROLLBACK DE SLA Y AUDITORÍA
-- Objetivo: Revertir cambios de columnas SLA en caso de fallo crítico.
-- Uso: psql -d volkern_local -f rollback.sql

BEGIN;

-- Eliminar columnas añadidas en support_tickets
ALTER TABLE "support_tickets" 
DROP COLUMN IF EXISTS "slaPriority",
DROP COLUMN IF EXISTS "slaStartedAt",
DROP COLUMN IF EXISTS "slaDueAt",
DROP COLUMN IF EXISTS "slaBreachAt",
DROP COLUMN IF EXISTS "slaState",
DROP COLUMN IF EXISTS "escalatedTo",
DROP COLUMN IF EXISTS "acknowledgeAt";

-- Eliminar columnas añadidas en AuditLog
ALTER TABLE "AuditLog"
DROP COLUMN IF EXISTS "metadata",
DROP COLUMN IF EXISTS "hash";

-- Nota: Los ENUMs se mantienen para evitar errores de dependencia 
-- si otras tablas los usan, pero pueden borrarse manualmente si es necesario.

COMMIT;
