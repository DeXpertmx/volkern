-- Dominio Hospitality (Volkern Hospitality): propiedades, unidades, reservas,
-- mapping de conectividad y eventos brutos del webhook de reservas.
-- Regla de aislamiento: toda entidad lleva tenantId; los IDs externos del
-- proveedor (bookingId, hotelCode, roomCode) NUNCA son la PK interna.

CREATE TABLE "hospitality_properties" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "ciudad" TEXT,
    "pais" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalityProperty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hospitality_units" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'apartamento',
    "capacidad" INTEGER NOT NULL DEFAULT 2,
    "estado" TEXT NOT NULL DEFAULT 'available',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalityUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connectivity_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'channel_connectivity',
    "externalPropertyId" TEXT NOT NULL,
    "externalUnitCode" TEXT,
    "externalRatePlanCode" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "metadata" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectivityMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hospitality_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "contactId" TEXT,
    "channel" TEXT NOT NULL,
    "externalBookingId" TEXT NOT NULL,
    "cmBookingId" TEXT,
    "action" TEXT NOT NULL DEFAULT 'book',
    "estado" TEXT NOT NULL DEFAULT 'confirmed',
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "bookedOn" TIMESTAMP(3),
    "segment" TEXT,
    "specialRequests" TEXT,
    "pah" BOOLEAN NOT NULL DEFAULT false,
    "amountAfterTax" DOUBLE PRECISION,
    "amountBeforeTax" DOUBLE PRECISION,
    "tax" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "commission" DOUBLE PRECISION,
    "tcs" DOUBLE PRECISION,
    "tds" DOUBLE PRECISION,
    "occupancyAdults" INTEGER NOT NULL DEFAULT 1,
    "occupancyChildren" INTEGER NOT NULL DEFAULT 0,
    "guestData" JSONB,
    "payload" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalityReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hospitality_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "reservationId" TEXT,
    "action" TEXT NOT NULL,
    "channel" TEXT,
    "hotelCode" TEXT,
    "bookingId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'recibido',
    "errorMensaje" TEXT,
    "payload" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalityWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- Índices y FKs
CREATE INDEX "HospitalityProperty_tenantId_idx" ON "hospitality_properties"("tenantId");
CREATE INDEX "HospitalityUnit_tenantId_idx" ON "hospitality_units"("tenantId");
CREATE INDEX "HospitalityUnit_propertyId_idx" ON "hospitality_units"("propertyId");
CREATE UNIQUE INDEX "HospitalityUnit_tenantId_codigo_key" ON "hospitality_units"("tenantId", "codigo");
CREATE UNIQUE INDEX "ConnectivityMapping_provider_externalPropertyId_externalUnitCode_key" ON "connectivity_mappings"("provider", "externalPropertyId", "externalUnitCode");
CREATE INDEX "ConnectivityMapping_tenantId_idx" ON "connectivity_mappings"("tenantId");
CREATE INDEX "ConnectivityMapping_propertyId_idx" ON "connectivity_mappings"("propertyId");
CREATE INDEX "ConnectivityMapping_unitId_idx" ON "connectivity_mappings"("unitId");
CREATE UNIQUE INDEX "HospitalityReservation_tenantId_channel_externalBookingId_key" ON "hospitality_reservations"("tenantId", "channel", "externalBookingId");
CREATE INDEX "HospitalityReservation_tenantId_idx" ON "hospitality_reservations"("tenantId");
CREATE INDEX "HospitalityReservation_propertyId_idx" ON "hospitality_reservations"("propertyId");
CREATE INDEX "HospitalityReservation_unitId_idx" ON "hospitality_reservations"("unitId");
CREATE INDEX "HospitalityReservation_estado_idx" ON "hospitality_reservations"("estado");
CREATE INDEX "HospitalityReservation_checkIn_idx" ON "hospitality_reservations"("checkIn");
CREATE INDEX "HospitalityReservation_externalBookingId_idx" ON "hospitality_reservations"("externalBookingId");
CREATE INDEX "HospitalityWebhookEvent_tenantId_idx" ON "hospitality_webhook_events"("tenantId");
CREATE INDEX "HospitalityWebhookEvent_reservationId_idx" ON "hospitality_webhook_events"("reservationId");
CREATE INDEX "HospitalityWebhookEvent_bookingId_idx" ON "hospitality_webhook_events"("bookingId");
CREATE INDEX "HospitalityWebhookEvent_fechaCreacion_idx" ON "hospitality_webhook_events"("fechaCreacion");

ALTER TABLE "hospitality_properties" ADD CONSTRAINT "HospitalityProperty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_units" ADD CONSTRAINT "HospitalityUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_units" ADD CONSTRAINT "HospitalityUnit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connectivity_mappings" ADD CONSTRAINT "ConnectivityMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connectivity_mappings" ADD CONSTRAINT "ConnectivityMapping_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connectivity_mappings" ADD CONSTRAINT "ConnectivityMapping_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hospitality_reservations" ADD CONSTRAINT "HospitalityReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_reservations" ADD CONSTRAINT "HospitalityReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_reservations" ADD CONSTRAINT "HospitalityReservation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hospitality_reservations" ADD CONSTRAINT "HospitalityReservation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hospitality_webhook_events" ADD CONSTRAINT "HospitalityWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_webhook_events" ADD CONSTRAINT "HospitalityWebhookEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;