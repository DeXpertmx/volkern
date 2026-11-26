-- Desenlace real del envío. El id del mensaje casa el ACK que manda Evolution
-- con la solicitud que lo originó, así que un envío que no confirmó al
-- responder deja de ser un caso abierto: o se confirma la entrega o se marca
-- fallido, sin volver a mandar el mensaje.
ALTER TABLE "mcp_approval_requests"
  ADD COLUMN "whatsappMessageId" TEXT,
  ADD COLUMN "entregaEstado" TEXT,
  ADD COLUMN "entregaActualizadaEn" TIMESTAMP(3);

CREATE INDEX "mcp_approval_requests_whatsappMessageId_idx"
  ON "mcp_approval_requests"("whatsappMessageId");
