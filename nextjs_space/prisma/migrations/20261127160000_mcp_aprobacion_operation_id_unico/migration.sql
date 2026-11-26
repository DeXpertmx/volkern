-- La solicitud de aprobación pasa a ser el recibo del envío: su id ya no se
-- duplica para el mismo `operationId` dentro de una empresa, así que un envío
-- no puede repetirse y la tabla auxiliar de recibos deja de tener sentido.
--
-- Antes de crear el índice se resuelven los duplicados que el gate pudo crear
-- mientras no había restricción: se conserva el más reciente y los anteriores
-- pierden el identificador (su operación ya está cerrada).
UPDATE "mcp_approval_requests" a
SET "operationId" = NULL
WHERE a."operationId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "mcp_approval_requests" b
    WHERE b."tenantId" = a."tenantId"
      AND b."operationId" = a."operationId"
      AND (b."createdAt", b."id") > (a."createdAt", a."id")
  );

CREATE UNIQUE INDEX "mcp_approval_requests_tenantId_operationId_key"
  ON "mcp_approval_requests"("tenantId", "operationId");

DROP TABLE IF EXISTS "whatsapp_send_receipts";
