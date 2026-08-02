-- Volkern Portfolio Forecast Logging — Aritmetical accuracy tracking
-- Crea portfolio_forecast_log (auditoría de predicciones del forecast ejecutivo).

CREATE TABLE "portfolio_forecast_log" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "mesProyectado"      TIMESTAMP(3) NOT NULL,
    "proyectado"         DECIMAL(18, 2) NOT NULL,
    "real"               DECIMAL(18, 2),
    "errorPct"           DECIMAL(7, 2),
    "slope"              DECIMAL(18, 4),
    "intercepto"         DECIMAL(18, 4),
    "r2"                 DECIMAL(7, 4),
    "ventanaMeses"       INTEGER NOT NULL DEFAULT 6,
    "sourceVersion"      TEXT NOT NULL DEFAULT 'v1-linear-6m',
    "generadoEn"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "backfilledEn"       TIMESTAMP(3),

    CONSTRAINT "portfolio_forecast_log_pkey" PRIMARY KEY ("id")
);

-- Idempotencia: el mismo (tenant, mes, versión) genera siempre la MISMA fila.
-- Un upsert en el endpoint evita duplicar logs cuando el usuario refresca.
CREATE UNIQUE INDEX "portfolio_forecast_log_tenantId_mesProyectado_sourceVersion_key"
    ON "portfolio_forecast_log"("tenantId", "mesProyectado", "sourceVersion");

-- Queries típicos:
--   · MAPE histórico: where tenantId=? and real IS NOT NULL and generadoEn>=now-30d
--   · Backfill sweep: where mesProyectado < now-month-start and real IS NULL
--   · Listado por tenant: where tenantId=? order by generadoEn desc
CREATE INDEX "portfolio_forecast_log_tenantId_idx" ON "portfolio_forecast_log"("tenantId");
CREATE INDEX "portfolio_forecast_log_generadoEn_idx" ON "portfolio_forecast_log"("generadoEn");
CREATE INDEX "portfolio_forecast_log_real_idx" ON "portfolio_forecast_log"("real");

-- FK con cascada: si se elimina el tenant, se elimina su historial de forecasts.
ALTER TABLE "portfolio_forecast_log"
    ADD CONSTRAINT "portfolio_forecast_log_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
