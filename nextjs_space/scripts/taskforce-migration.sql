-- VOLKERN TASKFORCE: MIGRACIÓN DE SLA Y AUDITORÍA
-- Objetivo: Añadir campos de control de SLA y backfill de datos históricos.
-- Uso: psql -d volkern_local -f migration.sql

BEGIN;

-- 1. Crear tipos ENUM si no existen (Postgres)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketStatus') THEN
        CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_CLIENT', 'RESOLVED', 'CLOSED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketPriority') THEN
        CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SlaState') THEN
        CREATE TYPE "SlaState" AS ENUM ('ON_TIME', 'AT_RISK', 'BREACHED');
    END IF;
END $$;

-- 2. Alterar tabla SupportTicket para añadir columnas SLA
-- Nota: Usamos comillas dobles para respetar el case-sensitivity de Prisma
ALTER TABLE "support_tickets" 
ADD COLUMN IF NOT EXISTS "slaPriority" "SupportTicketPriority",
ADD COLUMN IF NOT EXISTS "slaStartedAt" TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "slaDueAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "slaBreachAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "slaState" "SlaState" DEFAULT 'ON_TIME',
ADD COLUMN IF NOT EXISTS "escalatedTo" TEXT,
ADD COLUMN IF NOT EXISTS "acknowledgeAt" TIMESTAMPTZ;

-- 3. BACKFILL: Sincronizar datos históricos
-- Establecer slaStartedAt basado en la creación
UPDATE "support_tickets" SET "slaStartedAt" = "createdAt" WHERE "slaStartedAt" IS NULL;

-- Calcular slaDueAt según la prioridad (Mapping: 8h, 48h, 7d, 30d)
UPDATE "support_tickets" SET "slaDueAt" = "slaStartedAt" + interval '8 hours' WHERE "priority"::text = 'CRITICAL' AND "slaDueAt" IS NULL;
UPDATE "support_tickets" SET "slaDueAt" = "slaStartedAt" + interval '48 hours' WHERE "priority"::text = 'HIGH' AND "slaDueAt" IS NULL;
UPDATE "support_tickets" SET "slaDueAt" = "slaStartedAt" + interval '7 days' WHERE "priority"::text = 'MEDIUM' AND "slaDueAt" IS NULL;
UPDATE "support_tickets" SET "slaDueAt" = "slaStartedAt" + interval '30 days' WHERE "priority"::text = 'LOW' AND "slaDueAt" IS NULL;

-- 4. Marcar BREACHED para tickets pasados de fecha ya cerrados o abiertos
UPDATE "support_tickets" 
SET "slaState" = 'BREACHED', "slaBreachAt" = "slaDueAt"
WHERE "slaDueAt" < NOW() AND "status"::text != 'RESOLVED' AND "status"::text != 'CLOSED' AND "slaState" = 'ON_TIME';

-- 5. Actualizar AuditLog para soportar Forensic Seals
ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "hash" TEXT;

COMMIT;
