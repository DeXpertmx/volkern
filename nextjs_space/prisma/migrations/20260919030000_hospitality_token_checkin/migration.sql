-- Token público del check-in online (registro de viajeros, RD 933/2021).
--
-- El huésped recibe un enlace con este token y sube desde ahí los documentos de
-- todo su grupo: es lo que hace que el parte de viajeros salga completo sin que
-- nadie del hotel lo complete a mano. Es único (un token = una reserva) y nulo
-- mientras no se haya generado: las reservas anteriores siguen funcionando, se
-- les asigna al primer envío de la comunicación de pre-llegada.

ALTER TABLE "hospitality_reservations" ADD COLUMN     "tokenCheckin" TEXT;

CREATE UNIQUE INDEX "hospitality_reservations_tokenCheckin_key" ON "hospitality_reservations"("tokenCheckin");
