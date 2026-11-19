-- Contexto de trabajo del agente conversacional (Etapa B).
--
-- Modelo AgentConversationContext en prisma/schema.prisma. Sustituye el uso de
-- `chatbotAuditLog` como memoria de trabajo: resumen de la conversación,
-- entidades activas (persona/propiedad/oportunidad/tarea) y contexto pendiente
-- del flujo determinista. La clave es sintética: `conversacion:<channelId>` o
-- `pendiente:<userId>`.

-- CreateTable
CREATE TABLE "agent_conversation_contexts" (
    "clave" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumen" JSONB,
    "entidades" JSONB,
    "pendiente" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversation_contexts_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "agent_conversation_contexts_tenantId_idx" ON "agent_conversation_contexts"("tenantId");

-- CreateIndex
CREATE INDEX "agent_conversation_contexts_userId_idx" ON "agent_conversation_contexts"("userId");
