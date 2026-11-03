-- Importación con simulación previa y deshacer por lote.
--
-- Hasta ahora un `ImportLog` solo guardaba totales: se sabía cuántos registros
-- entraron, pero no cuáles, así que deshacer era imposible sin adivinar.
-- `report` guarda las trazas (ids creados e instantáneas de lo actualizado) y
-- `revertedAt` marca el lote ya deshecho. `mode` separa la previsualización
-- (que no escribe datos) del commit, y `batchId` empareja las dos.
ALTER TABLE "import_logs" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'commit';
ALTER TABLE "import_logs" ADD COLUMN "batchId" TEXT;
ALTER TABLE "import_logs" ADD COLUMN "report" JSONB;
ALTER TABLE "import_logs" ADD COLUMN "revertedAt" TIMESTAMP(3);

CREATE INDEX "import_logs_tenantId_mode_createdAt_idx"
  ON "import_logs"("tenantId", "mode", "createdAt");
