-- Instantáneas del health score (C6) para calibrar pesos y cortes con datos.
-- Cada recálculo deja una fila con SUS entradas (días sin movimiento, días sin
-- actividad, SLA vencido) y el desenlace del deal — NULL mientras está
-- abierto; el PATCH del deal lo rellena ('ganado' | 'perdido') al cerrar.
-- El historial nunca se recrea: el snapshot anterior a un cierre conserva el
-- score de entonces, que es justo lo que hay que comparar con el desenlace.
CREATE TABLE "health_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "healthStatus" TEXT NOT NULL,
    "diasSinMovimiento" INTEGER NOT NULL,
    "diasSinActividad" INTEGER NOT NULL,
    "slaVencido" BOOLEAN NOT NULL,
    "desenlace" TEXT,
    "fechaCierre" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "health_snapshots_tenantId_idx" ON "health_snapshots"("tenantId");
CREATE INDEX "health_snapshots_dealId_idx" ON "health_snapshots"("dealId");
CREATE INDEX "health_snapshots_desenlace_idx" ON "health_snapshots"("desenlace");

ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
