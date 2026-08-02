-- Volkern portfolio forecast alert — proactividad forecast → chatbot
-- Aporta columnas idempotentes: si la alerta proactiva ya se disparó en los
-- últimos 7 días, el endpoint no la repite.

ALTER TABLE "portfolio_forecast_log"
    ADD COLUMN "alertaEnviadaAt"      TIMESTAMP(3),
    ADD COLUMN "alertaConversacionId" TEXT;

-- Idempotencia: cuando el endpoint decide si dispara la alerta, hace una query
--   SELECT 1 FROM portfolio_forecast_log
--   WHERE tenantId=? AND alertaEnviadaAt > now() - 7 days
-- Este índice hace la query eficiente incluso con miles de logs históricos.
CREATE INDEX "portfolio_forecast_log_alertaEnviadaAt_idx"
    ON "portfolio_forecast_log"("alertaEnviadaAt");
