-- Personalización del Booking Engine: plantilla visual, personalización y
-- dominio propio del tenant.
-- Toda aditiva: sin defaults raros ni backfill — null es "clásica" y "sin
-- personalización", y dominio null es "sin dominio propio".
ALTER TABLE "hospitality_booking_config" ADD COLUMN "plantilla" TEXT;
ALTER TABLE "hospitality_booking_config" ADD COLUMN "personalizacion" JSONB;
ALTER TABLE "hospitality_booking_config" ADD COLUMN "dominio" TEXT;
ALTER TABLE "hospitality_booking_config" ADD COLUMN "dominioVerificado" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_booking_config_dominio_key" ON "hospitality_booking_config"("dominio");
