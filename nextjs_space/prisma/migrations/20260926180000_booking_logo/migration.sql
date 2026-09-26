-- Logo del hotel para la cabecera de la página pública del Booking Engine.
-- Guarda la URL pública del archivo (subida a S3/R2 o URL externa): el módulo
-- puro `booking-plantillas.logoDeValor` decide si vale como logo y la cabecera
-- cae al título cuando no lo hay. Aditiva: sin datos que convertir.
ALTER TABLE "hospitality_booking_config" ADD COLUMN "logo" TEXT;
