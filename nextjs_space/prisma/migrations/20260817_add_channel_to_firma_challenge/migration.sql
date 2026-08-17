-- AlterTable
ALTER TABLE "contrato_firma_challenges" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "contrato_firma_challenges" ADD COLUMN "telefono" TEXT;
ALTER TABLE "contrato_firma_challenges" ALTER COLUMN "email" DROP NOT NULL;
