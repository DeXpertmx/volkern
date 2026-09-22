-- Reseñas HISTÓRICAS importadas de OTAs: la web pública no debe arrancar
-- vacía solo porque el ciclo §21 sea nuevo. Una importada no tiene reserva en
-- el sistema (reservationId pasa a nullable), nace `publicada` (ya pasó el
-- filtro real: el canal la mostró) y lleva una huella sha256 única para que
-- importar el mismo CSV dos veces no duplique reseñas.
ALTER TABLE "hospitality_review" DROP CONSTRAINT "hospitality_review_reservationId_fkey";

ALTER TABLE "hospitality_review" ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'nativa';
ALTER TABLE "hospitality_review" ADD COLUMN "fechaEstancia" TIMESTAMP(3);
ALTER TABLE "hospitality_review" ADD COLUMN "huellaImport" TEXT;

-- Backfill: la fecha de estancia de las nativas vive en su reserva (check-in).
UPDATE "hospitality_review"
SET "fechaEstancia" = r."checkIn"
FROM "hospitality_reservations" r
WHERE "hospitality_review"."reservationId" = r."id";

CREATE UNIQUE INDEX "hospitality_review_huellaImport_key" ON "hospitality_review"("huellaImport");

ALTER TABLE "hospitality_review" ADD CONSTRAINT "hospitality_review_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
