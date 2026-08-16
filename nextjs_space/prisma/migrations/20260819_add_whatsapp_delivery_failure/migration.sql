-- CreateTable
CREATE TABLE "WhatsAppDeliveryFailure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceName" TEXT,
    "chatwootAccountId" INTEGER NOT NULL,
    "chatwootConversationId" INTEGER NOT NULL,
    "contactoNombre" TEXT,
    "telefono" TEXT,
    "mensajeFallido" TEXT,
    "notaAgente" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "resueltoPor" TEXT,
    "fechaResolucion" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppDeliveryFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryFailure_tenantId_estado_idx" ON "WhatsAppDeliveryFailure"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryFailure_chatwootConversationId_idx" ON "WhatsAppDeliveryFailure"("chatwootConversationId");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryFailure_fechaCreacion_idx" ON "WhatsAppDeliveryFailure"("fechaCreacion");
