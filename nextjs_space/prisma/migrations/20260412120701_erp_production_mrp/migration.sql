-- DropIndex
DROP INDEX "Tenant_estado_idx";

-- DropIndex
DROP INDEX "Tenant_slug_idx";

-- DropIndex
DROP INDEX "Tenant_stripeCustomerId_idx";

-- CreateTable
CREATE TABLE "erp_bom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT,
    "components" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_work_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "quantityToMake" INTEGER NOT NULL,
    "quantityProduced" INTEGER NOT NULL DEFAULT 0,
    "wasteReported" INTEGER NOT NULL DEFAULT 0,
    "wasteImage" TEXT,
    "batchNumber" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_production_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "itemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_production_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_bom_tenantId_idx" ON "erp_bom"("tenantId");

-- CreateIndex
CREATE INDEX "erp_bom_productId_idx" ON "erp_bom"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "erp_work_orders_batchNumber_key" ON "erp_work_orders"("batchNumber");

-- CreateIndex
CREATE INDEX "erp_work_orders_tenantId_idx" ON "erp_work_orders"("tenantId");

-- CreateIndex
CREATE INDEX "erp_work_orders_bomId_idx" ON "erp_work_orders"("bomId");

-- CreateIndex
CREATE INDEX "erp_work_orders_projectId_idx" ON "erp_work_orders"("projectId");

-- CreateIndex
CREATE INDEX "erp_production_logs_tenantId_idx" ON "erp_production_logs"("tenantId");

-- CreateIndex
CREATE INDEX "erp_production_logs_workOrderId_idx" ON "erp_production_logs"("workOrderId");

-- AddForeignKey
ALTER TABLE "erp_bom" ADD CONSTRAINT "erp_bom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_bom" ADD CONSTRAINT "erp_bom_productId_fkey" FOREIGN KEY ("productId") REFERENCES "catalogo_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_work_orders" ADD CONSTRAINT "erp_work_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_work_orders" ADD CONSTRAINT "erp_work_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "erp_bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_work_orders" ADD CONSTRAINT "erp_work_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "erp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_production_logs" ADD CONSTRAINT "erp_production_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_production_logs" ADD CONSTRAINT "erp_production_logs_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "erp_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
