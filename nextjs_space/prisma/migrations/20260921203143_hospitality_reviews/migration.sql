-- CreateTable
CREATE TABLE "hospitality_review" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "unitId" TEXT,
    "tokenResena" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "puntuacion" INTEGER NOT NULL,
    "comentario" TEXT,
    "nombreHuesped" TEXT NOT NULL,
    "respuestaHotel" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_review_reservationId_key" ON "hospitality_review"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_review_tokenResena_key" ON "hospitality_review"("tokenResena");

-- CreateIndex
CREATE INDEX "hospitality_review_tenantId_estado_idx" ON "hospitality_review"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "hospitality_review_propertyId_estado_idx" ON "hospitality_review"("propertyId", "estado");

-- AddForeignKey
ALTER TABLE "hospitality_review" ADD CONSTRAINT "hospitality_review_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_review" ADD CONSTRAINT "hospitality_review_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_review" ADD CONSTRAINT "hospitality_review_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_review" ADD CONSTRAINT "hospitality_review_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
