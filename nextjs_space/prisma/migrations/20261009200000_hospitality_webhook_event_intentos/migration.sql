-- Incidencias de mensajes del canal: contador de reintentos por código.
--
-- Los eventos de webhook ya se guardan por entrega, pero una entrega repetida de
-- un mensaje sin mapping llegaba cada 5 minutos durante días: una fila por
-- intento llena la tabla con la misma frase y no dice nada nuevo. Los mensajes
-- sin mapping se registran como UNA fila por (hotelCode, canal) que se refresca:
-- `intentos` cuenta las entregas y `ultimoIntentoEn` cuándo fue la última.
--
-- Aditiva y sin destructivos: dos columnas nuevas con valor por defecto, las
-- filas existentes (reservas) quedan con `intentos = 1`, que es lo que son.
-- AlterTable
ALTER TABLE "hospitality_webhook_events" ADD COLUMN     "intentos" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ultimoIntentoEn" TIMESTAMP(3);

