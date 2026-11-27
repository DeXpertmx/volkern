-- Sin operationId, la identidad de una solicitud es su contenido: una sola
-- reserva pendiente por (empresa, herramienta, argumentos). Antes de imponerlo
-- se cierran como caducadas las pendientes duplicadas que hubiera, conservando
-- la más reciente.
WITH duplicadas AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "tenantId", "toolName", "argumentsHash"
    ORDER BY "createdAt" DESC, id DESC
  ) AS rn
  FROM "mcp_approval_requests"
  WHERE "status" = 'pending' AND "operationId" IS NULL
)
UPDATE "mcp_approval_requests" AS a
SET "status" = 'expired'
FROM duplicadas AS d
WHERE a.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX "mcp_approval_requests_pendiente_contenido_key"
  ON "mcp_approval_requests"("tenantId", "toolName", "argumentsHash")
  WHERE "status" = 'pending' AND "operationId" IS NULL;

-- La migración de octubre ya había creado un índice equivalente sin la
-- condición de `operationId`. Se reemplaza por el anterior para no dejar dos
-- índices solapados con predicados distintos.
DROP INDEX IF EXISTS "mcp_approval_requests_pendiente_unica";
