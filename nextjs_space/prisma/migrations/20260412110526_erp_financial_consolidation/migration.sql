-- CreateTable
CREATE TABLE "erp_payroll_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_payroll_records_tenantId_idx" ON "erp_payroll_records"("tenantId");

-- CreateIndex
CREATE INDEX "erp_payroll_records_period_idx" ON "erp_payroll_records"("period");

-- AddForeignKey
ALTER TABLE "erp_payroll_records" ADD CONSTRAINT "erp_payroll_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_payroll_records" ADD CONSTRAINT "erp_payroll_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
