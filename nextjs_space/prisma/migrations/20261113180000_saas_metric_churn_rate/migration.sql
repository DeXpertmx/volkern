-- El histórico recalculaba la tasa como `churnedCustomers / activeCustomers`,
-- una segunda fórmula de churn que podía no coincidir con la definición única
-- (ver calcularVentanaChurn). El snapshot guarda ahora la tasa y su base.
--
-- Ambas columnas son nullable a propósito: las filas anteriores no tienen esa
-- tasa calculada y el histórico las muestra sin dato en vez de inventarlo.
ALTER TABLE "saas_metrics" ADD COLUMN "churnRate" DOUBLE PRECISION;
ALTER TABLE "saas_metrics" ADD COLUMN "churnBase" INTEGER;
