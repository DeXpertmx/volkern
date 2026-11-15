-- Analítica del portal público por cuenta (sin datos personales).
CREATE TABLE "PortalEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL DEFAULT 'foto',
    "propiedadId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalEvento_tenantId_tipo_fecha_idx" ON "PortalEvento"("tenantId", "tipo", "fecha");
CREATE INDEX "PortalEvento_tenantId_fecha_idx" ON "PortalEvento"("tenantId", "fecha");
