
-- Agregar nuevas columnas a digital_cards
ALTER TABLE "digital_cards" ADD COLUMN IF NOT EXISTS "telefonoMovil" TEXT;
ALTER TABLE "digital_cards" ADD COLUMN IF NOT EXISTS "telefonoOficina" TEXT;
ALTER TABLE "digital_cards" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "digital_cards" ADD COLUMN IF NOT EXISTS "telegram" TEXT;

-- Migrar datos del campo antiguo telefono a telefonoMovil si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'digital_cards'
        AND column_name = 'telefono'
    ) THEN
        UPDATE "digital_cards" SET "telefonoMovil" = "telefono" WHERE "telefono" IS NOT NULL AND "telefonoMovil" IS NULL;
        ALTER TABLE "digital_cards" DROP COLUMN "telefono";
    END IF;
END $$;
