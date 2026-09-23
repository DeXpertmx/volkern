-- Dos correcciones que la historia de migraciones no había registrado. Salieron
-- al reproducir el esquema desde cero (`migrate diff --from-migrations`): las
-- migraciones y `schema.prisma` no coincidían, así que el job de drift de CI y
-- cualquier base nueva habrían discrepado del esquema que usa la aplicación.
--
-- 1. Una reseña IMPORTADA de una OTA no tiene reserva en el sistema
--    (`reservationId` nullable). La migración `20260922090000_review_importada`
--    lo dio por hecho — su comentario lo dice — pero nunca ejecutó el
--    `DROP NOT NULL`, de modo que la primera importación real habría fallado
--    contra una base levantada desde las migraciones.
-- 2. El token de reseña se mudó a la RESERVA en `20260921210000`; la columna
--    que quedó en `hospitality_review` es residuo y el esquema ya no la modela
--    (la reseña pública se resuelve por el token de su reserva).
--
-- Ambas son idempotentes: `DROP NOT NULL` no hace nada si la columna ya es
-- nullable, y `DROP COLUMN IF EXISTS` no hace nada donde no exista.
ALTER TABLE "hospitality_review" ALTER COLUMN "reservationId" DROP NOT NULL;

ALTER TABLE "hospitality_review" DROP COLUMN IF EXISTS "tokenResena";
