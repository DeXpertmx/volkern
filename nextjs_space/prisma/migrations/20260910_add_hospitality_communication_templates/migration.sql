-- Plantillas de comunicación automática de Hospitality (plan maestro §21).
-- Un tenant define una plantilla por evento y canal; al dispararse el evento
-- se reemplazan las variables y se envía por la integración existente.
CREATE TABLE "hospitality_communication_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "asunto" TEXT,
    "contenido" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_communication_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_communication_templates_tenantId_idx" ON "hospitality_communication_templates"("tenantId");
CREATE INDEX "hospitality_communication_templates_evento_idx" ON "hospitality_communication_templates"("evento");
CREATE INDEX "hospitality_communication_templates_canal_idx" ON "hospitality_communication_templates"("canal");
CREATE INDEX "hospitality_communication_templates_activo_idx" ON "hospitality_communication_templates"("activo");

ALTER TABLE "hospitality_communication_templates"
    ADD CONSTRAINT "hospitality_communication_templates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;