-- Bloqueos manuales de intervalos por unidad de Hospitality.
-- fechaInicio es inclusiva y fechaFin exclusiva, igual que las reservas.
CREATE TABLE "hospitality_unit_blocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'propietario',
    "motivo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_unit_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_unit_blocks_tenantId_idx" ON "hospitality_unit_blocks"("tenantId");
CREATE INDEX "hospitality_unit_blocks_unitId_idx" ON "hospitality_unit_blocks"("unitId");
CREATE INDEX "hospitality_unit_blocks_fechaInicio_fechaFin_idx" ON "hospitality_unit_blocks"("fechaInicio", "fechaFin");
CREATE INDEX "hospitality_unit_blocks_estado_idx" ON "hospitality_unit_blocks"("estado");

ALTER TABLE "hospitality_unit_blocks"
  ADD CONSTRAINT "hospitality_unit_blocks_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_unit_blocks"
  ADD CONSTRAINT "hospitality_unit_blocks_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
