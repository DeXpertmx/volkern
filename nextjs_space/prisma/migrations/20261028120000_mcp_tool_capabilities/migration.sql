-- Gate de herramientas MCP: overrides por empresa y solicitudes de aprobación.
--
-- Modelos en prisma/schema.prisma (McpToolCapability, McpApprovalRequest).
-- La decisión por defecto NO vive aquí: es la matriz estática de
-- lib/mcp/tool-policy.ts, para que un cliente no pueda declarar inofensiva
-- una herramienta destructiva.

-- CreateTable
CREATE TABLE "mcp_tool_capabilities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "roleName" TEXT,
    "decision" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_tool_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_approval_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "argumentsHash" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "roleName" TEXT,
    "via" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tool_capabilities_tenantId_toolName_roleName_key" ON "mcp_tool_capabilities"("tenantId", "toolName", "roleName");

-- CreateIndex
CREATE INDEX "mcp_tool_capabilities_tenantId_idx" ON "mcp_tool_capabilities"("tenantId");

-- CreateIndex
CREATE INDEX "mcp_approval_requests_tenantId_status_idx" ON "mcp_approval_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "mcp_approval_requests_tenantId_createdAt_idx" ON "mcp_approval_requests"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "mcp_approval_requests_argumentsHash_idx" ON "mcp_approval_requests"("argumentsHash");

-- Una sola solicitud pendiente por empresa + herramienta + argumentos: si el
-- agente reintenta la misma acción, se reutiliza la solicitud viva en lugar de
-- inundar de duplicados al que aprueba. Índice parcial: sólo aplica a
-- 'pending', así que el histórico de ejecutadas y rechazadas no colisiona.
CREATE UNIQUE INDEX "mcp_approval_requests_pendiente_unica"
    ON "mcp_approval_requests"("tenantId", "toolName", "argumentsHash")
    WHERE "status" = 'pending';
