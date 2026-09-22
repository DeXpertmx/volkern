-- El token de reseña vive en la RESERVA, no en la reseña: el cron de solicitud
-- (§21) lo genera al hacer check-out, antes de que exista reseña (la reseña
-- nace cuando el huésped envía). Mismo patrón que tokenCheckin. La migración
-- anterior lo creó en hospitality_review; se traslada a hospitality_reservations.
ALTER TABLE "hospitality_reservations" ADD COLUMN     "tokenResena" TEXT;

CREATE UNIQUE INDEX "hospitality_reservations_tokenResena_key" ON "hospitality_reservations"("tokenResena");

DROP INDEX IF EXISTS "hospitality_review_tokenResena_key";
