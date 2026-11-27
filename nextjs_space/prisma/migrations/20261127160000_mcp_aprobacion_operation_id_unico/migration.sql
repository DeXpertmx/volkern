-- La solicitud de aprobación pasa a ser el recibo del envío: su id ya no se
-- duplica para el mismo `operationId` y usuario, así que un envío no puede
-- repetirse y la tabla auxiliar de recibos deja de tener sentido. El ámbito es
-- el usuario: dos personas de la misma empresa pueden usar el mismo valor sin
-- pisarse ni perder el identificador de la otra.
--
-- Antes de crear el índice se resuelven los duplicados que el gate pudo crear
-- mientras no había restricción: se conserva el más reciente de cada usuario y
-- los anteriores pierden el identificador (su operación ya está cerrada).
UPDATE "mcp_approval_requests" a
SET "operationId" = NULL
WHERE a."operationId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "mcp_approval_requests" b
    WHERE b."tenantId" = a."tenantId"
      AND b."requestedById" = a."requestedById"
      AND b."operationId" = a."operationId"
      AND (b."createdAt", b."id") > (a."createdAt", a."id")
  );

CREATE UNIQUE INDEX "mcp_approval_requests_tenantId_requestedById_operationId_key"
  ON "mcp_approval_requests"("tenantId", "requestedById", "operationId");

DROP TABLE IF EXISTS "whatsapp_send_receipts";
