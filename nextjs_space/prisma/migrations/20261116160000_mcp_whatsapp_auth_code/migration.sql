-- Autorización de envíos WhatsApp desde MCP mediante código enviado al
-- WhatsApp del negocio y validación en una página pública de riesgos.
ALTER TABLE "mcp_approval_requests"
  ADD COLUMN "whatsappCodeHash" TEXT,
  ADD COLUMN "whatsappCodeExpiresAt" TIMESTAMP,
  ADD COLUMN "whatsappCodeSentAt" TIMESTAMP,
  ADD COLUMN "whatsappCodeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "whatsappPhoneNumber" TEXT,
  ADD COLUMN "whatsappVerificationToken" TEXT UNIQUE;

CREATE INDEX "mcp_approval_requests_whatsappVerificationToken_idx"
  ON "mcp_approval_requests"("whatsappVerificationToken");

CREATE INDEX "mcp_approval_requests_whatsappCodeExpiresAt_idx"
  ON "mcp_approval_requests"("whatsappCodeExpiresAt");
