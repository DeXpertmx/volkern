-- AlterTable
ALTER TABLE "Curso" ADD COLUMN "hotmartProductId" TEXT;
ALTER TABLE "Curso" ADD COLUMN "hotmartSubdomain" TEXT;
ALTER TABLE "Curso" ADD COLUMN "proveedorContenido" TEXT NOT NULL DEFAULT 'propio';

-- AlterTable
ALTER TABLE "Estudiante" ADD COLUMN "hotmartUserId" TEXT;

-- AlterTable
ALTER TABLE "Inscripcion" ADD COLUMN "hotmartTransactionId" TEXT;
ALTER TABLE "Inscripcion" ADD COLUMN "metodoPago" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Estudiante_hotmartUserId_key" ON "Estudiante"("hotmartUserId");