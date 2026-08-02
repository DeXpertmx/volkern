-- Volkern Insurance — Ramos Autorizados (Bloque 2, complemento)
-- Aditiva: SOLO ADD COLUMN nullable. No toca datos existentes.
ALTER TABLE "insurance_aseguradoras" ADD COLUMN IF NOT EXISTS "ramosAutorizados" JSONB;
