-- Log de sincronización con la capa de conectividad (plan maestro §29/§30)
CREATE TABLE "hospitality_sync_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT,
    "tipo" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "httpStatus" INTEGER,
    "requestPayload" JSONB,
    "responseBody" JSONB,
    "errorMensaje" TEXT,
    "duracionMs" INTEGER,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospitality_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_sync_logs_tenantId_idx" ON "hospitality_sync_logs"("tenantId");
CREATE INDEX "hospitality_sync_logs_propertyId_idx" ON "hospitality_sync_logs"("propertyId");
CREATE INDEX "hospitality_sync_logs_tipo_idx" ON "hospitality_sync_logs"("tipo");
CREATE INDEX "hospitality_sync_logs_estado_idx" ON "hospitality_sync_logs"("estado");
CREATE INDEX "hospitality_sync_logs_fechaCreacion_idx" ON "hospitality_sync_logs"("fechaCreacion");

ALTER TABLE "hospitality_sync_logs" ADD CONSTRAINT "hospitality_sync_logs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_sync_logs" ADD CONSTRAINT "hospitality_sync_logs_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tarifa base por noche y moneda por unidad (campo interno Volkern; se usa
-- para construir el Rate Push hacia la capa de conectividad).
ALTER TABLE "hospitality_units" ADD COLUMN "tarifaBase" DOUBLE PRECISION;
ALTER TABLE "hospitality_units" ADD COLUMN "moneda" TEXT NOT NULL DEFAULT 'MXN';