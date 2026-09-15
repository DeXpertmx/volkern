-- Booking Engine de Hospitality (FASE 3.D): configuración de la reserva directa.
--
-- Una fila por tenant. Guarda solo lo que es política del canal directo: qué
-- propiedades se publican, la política de cancelación, el anticipo, la tarifa de
-- limpieza y con qué divisa se publican los precios.
--
-- `moneda` es anulable a propósito: nulo significa "la del tenant"
-- (`Tenant.moneda`), que es la fuente autoritativa de la divisa. El valor por
-- defecto del esquema no participa en esa decisión.
--
-- No hay aquí ni disponibilidad ni reservas: el Booking Engine consume el
-- Availability Engine y escribe por el Reservation Engine, como cualquier canal.

CREATE TABLE "hospitality_booking_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT,
    "descripcion" TEXT,
    "emailContacto" TEXT,
    "telefonoContacto" TEXT,
    "moneda" TEXT,
    "politicaCancelacion" TEXT,
    "anticipoPorcentaje" INTEGER NOT NULL DEFAULT 0,
    "tarifaLimpieza" DOUBLE PRECISION,
    "requierePagoOnline" BOOLEAN NOT NULL DEFAULT false,
    "propiedadesPublicadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_booking_config_pkey" PRIMARY KEY ("id")
);

-- Un tenant tiene una sola página pública, y su slug es único en toda la
-- plataforma: es la dirección que el tenant publica y comparte.
CREATE UNIQUE INDEX "hospitality_booking_config_tenantId_key" ON "hospitality_booking_config"("tenantId");
CREATE UNIQUE INDEX "hospitality_booking_config_slug_key" ON "hospitality_booking_config"("slug");

ALTER TABLE "hospitality_booking_config" ADD CONSTRAINT "hospitality_booking_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
