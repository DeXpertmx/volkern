-- Preguntas personalizadas del check-in online: cada hotel define qué más
-- quiere saber del huésped (hora de llegada, matrícula, mascotas…). Las
-- respuestas viven en la reserva (`respuestasCheckin`) y nunca viajan al XML
-- del parte de viajeros: el esquema del Ministerio (XSD) es cerrado.
CREATE TABLE "hospitality_checkin_pregunta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    -- Pregunta y opciones en ES y EN (el formulario es bilingüe).
    "es" JSONB NOT NULL,
    "en" JSONB NOT NULL,
    -- texto | opcion | numero | fecha
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "opciones" JSONB,
    "requerida" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_checkin_pregunta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_checkin_pregunta_tenantId_activa_idx" ON "hospitality_checkin_pregunta"("tenantId", "activa");

ALTER TABLE "hospitality_checkin_pregunta" ADD CONSTRAINT "hospitality_checkin_pregunta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Respuestas del huésped ({preguntaId: valor}) en la reserva, para el hotel.
ALTER TABLE "hospitality_reservations" ADD COLUMN "respuestasCheckin" JSONB;
