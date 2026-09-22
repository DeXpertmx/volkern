-- CreateTable
CREATE TABLE "contrato_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'servicio',
    "descripcion" TEXT,
    "clausulas" TEXT,
    "condicionesPago" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "esPorDefecto" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_templates_tenantId_idx" ON "contrato_templates"("tenantId");

-- AddForeignKey
ALTER TABLE "contrato_templates" ADD CONSTRAINT "contrato_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
