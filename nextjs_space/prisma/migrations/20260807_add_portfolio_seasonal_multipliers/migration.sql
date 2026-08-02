-- Volkern Seasonal Multipliers — aprendido del histórico para forecast smart
-- Tabla cache de multipliers estacionales por tenant × evento × ramo.

CREATE TABLE "portfolio_seasonal_multipliers" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "eventoKey"       TEXT NOT NULL,
    "ramo"            TEXT,
    "ventanaMdInicio" INTEGER NOT NULL,
    "ventanaMdFin"    INTEGER NOT NULL,
    "multiplier"      DECIMAL(4, 2) NOT NULL,
    "baselinePrima"   DECIMAL(18, 2),
    "muestras"        INTEGER NOT NULL,
    "confianza"       DECIMAL(4, 2),
    "fuente"          TEXT NOT NULL DEFAULT 'learned',
    "computedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_seasonal_multipliers_pkey" PRIMARY KEY ("id")
);

-- Idempotencia del upsert: el mismo (tenant, evento, ramo) genera la misma fila.
CREATE UNIQUE INDEX "portfolio_seasonal_multipliers_tenantId_eventoKey_ramo_key"
    ON "portfolio_seasonal_multipliers"("tenantId", "eventoKey", "ramo");

-- Lookups típicos:
--   · Smart endpoint: where tenantId=? and eventoKey IN (...)
--   · Refresh job:    where computedAt < now() - 30 days
CREATE INDEX "portfolio_seasonal_multipliers_tenantId_idx"
    ON "portfolio_seasonal_multipliers"("tenantId");
CREATE INDEX "portfolio_seasonal_multipliers_eventoKey_idx"
    ON "portfolio_seasonal_multipliers"("eventoKey");
CREATE INDEX "portfolio_seasonal_multipliers_computedAt_idx"
    ON "portfolio_seasonal_multipliers"("computedAt");

-- FK con cascada.
ALTER TABLE "portfolio_seasonal_multipliers"
    ADD CONSTRAINT "portfolio_seasonal_multipliers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
