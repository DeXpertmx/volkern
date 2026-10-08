-- AlterTable
-- Marca de conciliación: `NULL` = el gasto sigue siendo una estimación (el que
-- genera un pedido de compra al recibirse); con fecha = ya lo justifica la
-- factura del proveedor. Es aditiva y nullable, así que no reescribe filas.
ALTER TABLE "erp_expenses" ADD COLUMN "reconciledAt" TIMESTAMP(3);

-- CreateIndex
-- La búsqueda de candidatos siempre filtra por tenant, proveedor y «sin
-- conciliar»: el índice cubre las tres columnas en ese orden.
CREATE INDEX "erp_expenses_tenantId_supplierId_reconciledAt_idx" ON "erp_expenses"("tenantId", "supplierId", "reconciledAt");
