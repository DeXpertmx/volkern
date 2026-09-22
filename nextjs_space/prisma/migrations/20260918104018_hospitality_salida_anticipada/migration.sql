-- AlterTable
ALTER TABLE "hospitality_properties" ADD COLUMN     "politicaSalidaAnticipada" TEXT NOT NULL DEFAULT 'salida_real';

-- AlterTable
ALTER TABLE "hospitality_reservations" ADD COLUMN     "checkOutReal" TIMESTAMP(3);
