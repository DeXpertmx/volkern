-- Trazabilidad por herramienta del agente (P5).
--
-- Modelo ToolExecution en prisma/schema.prisma. Cada ejecución de una
-- herramienta del agente deja una fila: identidad de la sesión, herramienta,
-- origen, argumentos y resultado saneados, duración y desenlace. El writer es
-- best-effort: si la tabla aún no existe, el chat sigue funcionando y la
-- traza se pierde sin romper la operación.

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "toolName" TEXT NOT NULL,
    "origin" TEXT,
    "arguments" JSONB,
    "result" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "errorMessage" TEXT,
    "idempotent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_executions_tenantId_createdAt_idx" ON "tool_executions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tool_executions_conversationId_idx" ON "tool_executions"("conversationId");

-- CreateIndex
CREATE INDEX "tool_executions_toolName_idx" ON "tool_executions"("toolName");
