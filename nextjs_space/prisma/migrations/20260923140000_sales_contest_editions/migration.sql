-- Ediciones mensuales del concurso de cerradores (C5): cada MES es una
-- edición con ganador. Se cierra ON-READ: la primera lectura del ranking tras
-- terminar un mes congela su ganador con las sesiones de ESE mes. El unique
-- (tenantId, periodo) hace el cierre idempotente: una sola fila por edición.
CREATE TABLE "sales_contest_editions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "ganadorId" TEXT NOT NULL,
    "ganadorNombre" TEXT NOT NULL,
    "mediaGanador" INTEGER NOT NULL,
    "sesionesGanador" INTEGER NOT NULL,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_contest_editions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_contest_editions_tenantId_periodo_key" ON "sales_contest_editions"("tenantId", "periodo");
CREATE INDEX "sales_contest_editions_tenantId_cerradoEn_idx" ON "sales_contest_editions"("tenantId", "cerradoEn");

ALTER TABLE "sales_contest_editions" ADD CONSTRAINT "sales_contest_editions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_contest_editions" ADD CONSTRAINT "sales_contest_editions_ganadorId_fkey" FOREIGN KEY ("ganadorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
