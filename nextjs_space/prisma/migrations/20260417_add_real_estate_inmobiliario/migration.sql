-- Migration: Add Real Estate (Inmobiliario) module support
-- Fase 0.1: GIN indexes, PipelineStage.categoria, Automation @@unique

-- 1. Add categoria column to pipeline_stages
ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "categoria" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "pipeline_stages_categoria_idx" ON "pipeline_stages" ("categoria");

-- 2. Add @@unique([tenantId, nombre]) to Automation if not exists
-- First clean up any duplicates that would violate the unique constraint
DELETE FROM "Automation" a USING (
  SELECT MIN("id") as id, "tenantId", "nombre"
  FROM "Automation"
  GROUP BY "tenantId", "nombre"
  HAVING COUNT(*) > 1
) b
WHERE a."tenantId" = b."tenantId" 
  AND a."nombre" = b."nombre" 
  AND a."id" != b."id";

-- Keep most recent automation when there are duplicates
DELETE FROM "Automation" a USING (
  SELECT "id", "tenantId", "nombre",
         ROW_NUMBER() OVER (PARTITION BY "tenantId", "nombre" ORDER BY "fechaCreacion" DESC) as rn
  FROM "Automation"
) dups
WHERE a."id" = dups."id" AND dups.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Automation_tenantId_nombre_key" ON "Automation" ("tenantId", "nombre");

-- 3. GIN indexes for JSONB queries on CatalogoItem.customFieldValues
-- Index for filtering properties by status (disponible, reservada, etc.)
-- Nota: No se usa CONCURRENTLY porque Prisma ejecuta migraciones dentro de transacciones.
CREATE INDEX IF NOT EXISTS "idx_catalogo_items_inmueble_status"
ON "CatalogoItem" USING gin ("customFieldValues" jsonb_path_ops)
WHERE "tipo" = 'inmueble' AND "activo" = true;

-- Index for search by city/zone
CREATE INDEX IF NOT EXISTS "idx_catalogo_items_ciudad"
ON "CatalogoItem" USING gin ("customFieldValues" jsonb_path_ops)
WHERE "tipo" = 'inmueble';

-- Composite index for common tenant queries
CREATE INDEX IF NOT EXISTS "idx_catalogo_items_tenant_tipo"
ON "CatalogoItem" ("tenantId", "tipo", "activo");
