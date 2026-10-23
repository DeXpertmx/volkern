-- Tarifas adicionales por estancia (limpieza, gestión, mascota, ropa de cama,
-- resort, comunidad). Antes solo existía UNA tarifa de limpieza a nivel de
-- cuenta (`hospitality_booking_config.tarifaLimpieza`); esta tabla permite
-- varias por propiedad, obligatorias u opcionales, sin tocar ese campo (sigue
-- mandando para la limpieza clásica).
CREATE TABLE "hospitality_fee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcionEs" TEXT,
    "descripcionEn" TEXT,
    "importe" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "obligatoria" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_fee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_fee_tenantId_idx" ON "hospitality_fee"("tenantId");
CREATE INDEX "hospitality_fee_propertyId_activo_idx" ON "hospitality_fee"("propertyId", "activo");

ALTER TABLE "hospitality_fee" ADD CONSTRAINT "hospitality_fee_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_fee" ADD CONSTRAINT "hospitality_fee_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
