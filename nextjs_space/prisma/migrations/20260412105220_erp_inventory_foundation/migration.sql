-- CreateTable
CREATE TABLE "erp_warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_stock_levels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "catalogoItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION DEFAULT 0,
    "maxStock" DOUBLE PRECISION,
    "lastSync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "catalogoItemId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_warehouses_tenantId_idx" ON "erp_warehouses"("tenantId");

-- CreateIndex
CREATE INDEX "erp_stock_levels_tenantId_idx" ON "erp_stock_levels"("tenantId");

-- CreateIndex
CREATE INDEX "erp_stock_levels_catalogoItemId_idx" ON "erp_stock_levels"("catalogoItemId");

-- CreateIndex
CREATE UNIQUE INDEX "erp_stock_levels_warehouseId_catalogoItemId_key" ON "erp_stock_levels"("warehouseId", "catalogoItemId");

-- CreateIndex
CREATE INDEX "erp_stock_movements_tenantId_idx" ON "erp_stock_movements"("tenantId");

-- CreateIndex
CREATE INDEX "erp_stock_movements_warehouseId_idx" ON "erp_stock_movements"("warehouseId");

-- CreateIndex
CREATE INDEX "erp_stock_movements_catalogoItemId_idx" ON "erp_stock_movements"("catalogoItemId");

-- CreateIndex
CREATE INDEX "erp_stock_movements_type_idx" ON "erp_stock_movements"("type");

-- CreateIndex
CREATE INDEX "erp_stock_movements_createdAt_idx" ON "erp_stock_movements"("createdAt");

-- AddForeignKey
ALTER TABLE "erp_warehouses" ADD CONSTRAINT "erp_warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_levels" ADD CONSTRAINT "erp_stock_levels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_levels" ADD CONSTRAINT "erp_stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "erp_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_levels" ADD CONSTRAINT "erp_stock_levels_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_movements" ADD CONSTRAINT "erp_stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_movements" ADD CONSTRAINT "erp_stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "erp_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_movements" ADD CONSTRAINT "erp_stock_movements_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_movements" ADD CONSTRAINT "erp_stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
