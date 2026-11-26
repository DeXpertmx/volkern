-- Identificador explícito de operación que manda el cliente MCP. Se guarda en
-- la solicitud y es la identidad de idempotencia del envío WhatsApp: repetir el
-- mismo operationId no reenvía; uno nuevo permite repetir el mismo mensaje.
ALTER TABLE "mcp_approval_requests" ADD COLUMN "operationId" TEXT;
