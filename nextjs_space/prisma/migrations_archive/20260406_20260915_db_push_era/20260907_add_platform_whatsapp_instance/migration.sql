-- Instancia de WhatsApp de la PLATAFORMA (Volkern): número oficial usado para
-- notificaciones cuando un tenant NO tiene conectado su propio WhatsApp del
-- negocio. Es una única fila (singleton) gestionada desde el panel admin.
CREATE TABLE "platform_whatsapp_instances" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "PlatformWhatsAppInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformWhatsAppInstance_instanceName_key" ON "platform_whatsapp_instances"("instanceName");
CREATE INDEX "PlatformWhatsAppInstance_status_idx" ON "platform_whatsapp_instances"("status");
