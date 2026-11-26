-- Recibo de idempotencia de los envíos WhatsApp aprobados por MCP. La clave se
-- crea antes de llamar al proveedor: un reintento con los mismos argumentos no
-- duplica el mensaje aunque la solicitud anterior se cerrara sin desenlace.
CREATE TABLE "whatsapp_send_receipts" (
    "key" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'en_curso',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_send_receipts_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "whatsapp_send_receipts_status_check" CHECK ("status" IN ('en_curso', 'enviado'))
);

CREATE INDEX "whatsapp_send_receipts_approvalId_idx" ON "whatsapp_send_receipts"("approvalId");
