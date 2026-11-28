-- El operationId es de cada usuario: dos personas de la misma empresa pueden
-- usar el mismo valor sin pisarse ni leer el desenlace del otro. Se conserva la
-- solicitud más reciente de cada (empresa, usuario, id) y se sueltan los
-- identificadores repetidos de las anteriores.
--
-- Es idempotente a propósito: repara también una base que hubiera aplicado una
-- versión anterior del índice con ámbito por empresa.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "tenantId", "requestedById", "operationId"
    ORDER BY "createdAt" DESC, id DESC
  ) AS rn
  FROM "mcp_approval_requests"
  WHERE "operationId" IS NOT NULL
)
UPDATE "mcp_approval_requests" AS a
SET "operationId" = NULL
FROM ranked AS r
WHERE a.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS "mcp_approval_requests_tenantId_operationId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_approval_requests_tenantId_requestedById_operationId_key"
  ON "mcp_approval_requests"("tenantId", "requestedById", "operationId");
