-- Hash de los argumentos del envío en el recibo. Sin `operationId`, permite
-- bloquear un segundo envío del mismo contenido mientras el anterior siga en
-- vuelo o sin confirmar: el cierre de la solicitud por el barrido ya no reabre
-- el duplicado.
ALTER TABLE "whatsapp_send_receipts" ADD COLUMN "argumentsHash" TEXT;

-- Relleno de los recibos existentes desde su solicitud.
UPDATE "whatsapp_send_receipts" r
SET "argumentsHash" = a."argumentsHash"
FROM "mcp_approval_requests" a
WHERE a."id" = r."approvalId";

CREATE INDEX "whatsapp_send_receipts_tenantId_toolName_argumentsHash_idx"
  ON "whatsapp_send_receipts"("tenantId", "toolName", "argumentsHash");
