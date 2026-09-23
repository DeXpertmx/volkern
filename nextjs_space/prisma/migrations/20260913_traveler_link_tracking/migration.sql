-- AlterTable: seguimiento del enlace de WhatsApp en los viajeros.
-- enlaceEnviadoEn/enlaceEnviados: cuándo se le pidió y cuántas veces.
-- datosRecibidosEn: cuándo respondió completando el formulario público.
ALTER TABLE "hospitality_travelers"
  ADD COLUMN "enlaceEnviadoEn" TIMESTAMP(3),
  ADD COLUMN "enlaceEnviados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "datosRecibidosEn" TIMESTAMP(3);
