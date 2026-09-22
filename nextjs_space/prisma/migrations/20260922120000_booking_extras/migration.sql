-- Extras comprables en el booking engine (desayuno, late check-out, traslado):
-- catálogo por propiedad con su precio. El huésped elige en la web; la ruta
-- pública valida contra ESTE catálogo y nunca usa el precio del cliente.
-- La línea de la reserva vive en hospitality_reservation_item (tipo 'extra')
-- reutilizando el desglose existente: Finanzas ya lo sabe sumar.
CREATE TABLE "hospitality_extra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcionEs" TEXT,
    "descripcionEn" TEXT,
    "precio" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "precioPorNoche" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_extra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_extra_tenantId_idx" ON "hospitality_extra"("tenantId");
CREATE INDEX "hospitality_extra_propertyId_activo_idx" ON "hospitality_extra"("propertyId", "activo");

ALTER TABLE "hospitality_extra" ADD CONSTRAINT "hospitality_extra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_extra" ADD CONSTRAINT "hospitality_extra_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
