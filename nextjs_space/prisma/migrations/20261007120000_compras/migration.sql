-- CreateTable
CREATE TABLE "erp_compras" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proveedorId" TEXT,
    "almacenId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "fechaPedido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntrega" TIMESTAMP(3),
    "fechaRecepcion" TIMESTAMP(3),
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalImpuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "gastoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_compra_items" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "catalogoItemId" TEXT,
    "concepto" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "porcentajeImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "montoImpuesto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cantidadRecibida" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "erp_compras_gastoId_key" ON "erp_compras"("gastoId");

-- CreateIndex
CREATE INDEX "erp_compras_tenantId_estado_idx" ON "erp_compras"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "erp_compras_proveedorId_idx" ON "erp_compras"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "erp_compras_tenantId_numero_key" ON "erp_compras"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "erp_compra_items_compraId_idx" ON "erp_compra_items"("compraId");

-- CreateIndex
CREATE INDEX "erp_compra_items_catalogoItemId_idx" ON "erp_compra_items"("catalogoItemId");

-- AddForeignKey
ALTER TABLE "erp_compras" ADD CONSTRAINT "erp_compras_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "erp_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_compras" ADD CONSTRAINT "erp_compras_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_compras" ADD CONSTRAINT "erp_compras_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "erp_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_compras" ADD CONSTRAINT "erp_compras_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "erp_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_compras" ADD CONSTRAINT "erp_compras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_compra_items" ADD CONSTRAINT "erp_compra_items_catalogoItemId_fkey" FOREIGN KEY ("catalogoItemId") REFERENCES "catalogo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_compra_items" ADD CONSTRAINT "erp_compra_items_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "erp_compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

