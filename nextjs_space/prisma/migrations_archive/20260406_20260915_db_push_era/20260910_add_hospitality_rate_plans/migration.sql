-- Planes de tarifa por unidad con restricciones de venta (plan maestro §6, §15)
CREATE TABLE "hospitality_rate_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "tarifa" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "minNoches" INTEGER NOT NULL DEFAULT 1,
    "maxNoches" INTEGER,
    "checkInDias" JSONB,
    "checkOutDias" JSONB,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_rate_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_rate_plans_tenantId_idx" ON "hospitality_rate_plans"("tenantId");
CREATE INDEX "hospitality_rate_plans_propertyId_idx" ON "hospitality_rate_plans"("propertyId");
CREATE INDEX "hospitality_rate_plans_unitId_idx" ON "hospitality_rate_plans"("unitId");

-- FK: tenant (cascade), property (cascade), unit (cascade)
ALTER TABLE "hospitality_rate_plans"
    ADD CONSTRAINT "hospitality_rate_plans_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_rate_plans"
    ADD CONSTRAINT "hospitality_rate_plans_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_rate_plans"
    ADD CONSTRAINT "hospitality_rate_plans_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;