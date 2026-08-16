-- WhatsApp del negocio (tenant): número dedicado para el chatbot y el equipo,
-- separado de las instancias personales de los usuarios.
CREATE TABLE "TenantWhatsAppInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "qrCode" TEXT,
    "qrCodeExpiry" TIMESTAMP(3),
    "profileName" TEXT,
    "profilePicUrl" TEXT,
    "totalMensajes" INTEGER NOT NULL DEFAULT 0,
    "ultimoMensaje" TIMESTAMP(3),
    "fechaConexion" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantWhatsAppInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantWhatsAppInstance_tenantId_key" ON "TenantWhatsAppInstance"("tenantId");
CREATE UNIQUE INDEX "TenantWhatsAppInstance_instanceName_key" ON "TenantWhatsAppInstance"("instanceName");
CREATE INDEX "TenantWhatsAppInstance_tenantId_idx" ON "TenantWhatsAppInstance"("tenantId");
CREATE INDEX "TenantWhatsAppInstance_status_idx" ON "TenantWhatsAppInstance"("status");

ALTER TABLE "TenantWhatsAppInstance" ADD CONSTRAINT "TenantWhatsAppInstance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
