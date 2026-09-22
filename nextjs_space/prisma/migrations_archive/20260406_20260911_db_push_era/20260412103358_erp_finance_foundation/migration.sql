-- CreateTable
CREATE TABLE "erp_suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "category" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "leadId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "category" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_suppliers_tenantId_idx" ON "erp_suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "erp_suppliers_category_idx" ON "erp_suppliers"("category");

-- CreateIndex
CREATE INDEX "erp_expenses_tenantId_idx" ON "erp_expenses"("tenantId");

-- CreateIndex
CREATE INDEX "erp_expenses_supplierId_idx" ON "erp_expenses"("supplierId");

-- CreateIndex
CREATE INDEX "erp_expenses_leadId_idx" ON "erp_expenses"("leadId");

-- CreateIndex
CREATE INDEX "erp_expenses_category_idx" ON "erp_expenses"("category");

-- CreateIndex
CREATE INDEX "erp_expenses_status_idx" ON "erp_expenses"("status");

-- CreateIndex
CREATE INDEX "erp_expenses_date_idx" ON "erp_expenses"("date");

-- AddForeignKey
ALTER TABLE "erp_suppliers" ADD CONSTRAINT "erp_suppliers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "erp_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
