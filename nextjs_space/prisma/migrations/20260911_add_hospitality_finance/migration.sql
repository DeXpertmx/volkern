-- Finanzas de la reserva (FASE 3: Booking Engine + Payments).
-- El desglose de una reserva vive en sus líneas; los pagos son filas
-- independientes para que el estado de cobro se derive de la suma real.

-- Líneas de desglose: alojamiento, limpieza, extras u otro.
CREATE TABLE "hospitality_reservation_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'alojamiento',
    "concepto" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "importeUnitario" DOUBLE PRECISION NOT NULL,
    "importeTotal" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_reservation_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_reservation_items_tenantId_idx" ON "hospitality_reservation_items"("tenantId");
CREATE INDEX "hospitality_reservation_items_reservationId_idx" ON "hospitality_reservation_items"("reservationId");
CREATE INDEX "hospitality_reservation_items_propertyId_idx" ON "hospitality_reservation_items"("propertyId");
CREATE INDEX "hospitality_reservation_items_tipo_idx" ON "hospitality_reservation_items"("tipo");

ALTER TABLE "hospitality_reservation_items"
  ADD CONSTRAINT "hospitality_reservation_items_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_reservation_items"
  ADD CONSTRAINT "hospitality_reservation_items_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_reservation_items"
  ADD CONSTRAINT "hospitality_reservation_items_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_reservation_items"
  ADD CONSTRAINT "hospitality_reservation_items_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pagos de una reserva (incluye parciales y reembolsos).
CREATE TABLE "hospitality_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "importe" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "metodo" TEXT NOT NULL DEFAULT 'manual',
    "estado" TEXT NOT NULL DEFAULT 'pagado',
    "referenciaExterna" TEXT,
    "stripePaymentIntentId" TEXT,
    "fechaPago" TIMESTAMP(3),
    "notas" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_payments_tenantId_idx" ON "hospitality_payments"("tenantId");
CREATE INDEX "hospitality_payments_reservationId_idx" ON "hospitality_payments"("reservationId");
CREATE INDEX "hospitality_payments_propertyId_idx" ON "hospitality_payments"("propertyId");
CREATE INDEX "hospitality_payments_estado_idx" ON "hospitality_payments"("estado");

ALTER TABLE "hospitality_payments"
  ADD CONSTRAINT "hospitality_payments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_payments"
  ADD CONSTRAINT "hospitality_payments_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_payments"
  ADD CONSTRAINT "hospitality_payments_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_payments"
  ADD CONSTRAINT "hospitality_payments_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cuenta de cobro del tenant (Stripe Connect). Una por tenant y proveedor.
CREATE TABLE "hospitality_payment_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "stripeAccountId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'sin_conectar',
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "pais" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_payment_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hospitality_payment_accounts_tenantId_provider_key" ON "hospitality_payment_accounts"("tenantId", "provider");
CREATE INDEX "hospitality_payment_accounts_tenantId_idx" ON "hospitality_payment_accounts"("tenantId");

ALTER TABLE "hospitality_payment_accounts"
  ADD CONSTRAINT "hospitality_payment_accounts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
