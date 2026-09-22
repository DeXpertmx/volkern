-- Traza de la factura del ERP emitida por una línea de reserva. Solo la usa la
-- penalización por no-show (lib/hospitality/penalizaciones.ts): permite saber
-- qué cargo ya está facturado y evita facturarlo dos veces.
ALTER TABLE "hospitality_reservation_items" ADD COLUMN "invoiceId" TEXT;

-- CreateIndex
CREATE INDEX "hospitality_reservation_items_invoiceId_idx" ON "hospitality_reservation_items"("invoiceId");
