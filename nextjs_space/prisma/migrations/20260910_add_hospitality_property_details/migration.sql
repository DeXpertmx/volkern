-- Enriquecer HospitalityProperty y HospitalityUnit (plan maestro §6, UX de real estate)
-- Propiedad: descripción, código, zona, ubicación completa, coordenadas y fotos
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "descripcion" TEXT;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "zona" TEXT;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "estadoProvincia" TEXT;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "cp" TEXT;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "latitud" DOUBLE PRECISION;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "longitud" DOUBLE PRECISION;
ALTER TABLE "hospitality_properties" ADD COLUMN IF NOT EXISTS "fotos" JSONB;

-- Unidad: descripción, fotos y amenidades
ALTER TABLE "hospitality_units" ADD COLUMN IF NOT EXISTS "descripcion" TEXT;
ALTER TABLE "hospitality_units" ADD COLUMN IF NOT EXISTS "fotos" JSONB;
ALTER TABLE "hospitality_units" ADD COLUMN IF NOT EXISTS "amenidades" JSONB;
