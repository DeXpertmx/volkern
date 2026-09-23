-- CreateTable
CREATE TABLE "erp_financial_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_financial_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_financial_audits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "integrityCheck" TEXT NOT NULL,

    CONSTRAINT "erp_financial_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_security_incidents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "erp_security_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_financial_summaries_tenantId_idx" ON "erp_financial_summaries"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "erp_financial_summaries_month_year_tenantId_key" ON "erp_financial_summaries"("month", "year", "tenantId");

-- CreateIndex
CREATE INDEX "erp_financial_audits_tenantId_idx" ON "erp_financial_audits"("tenantId");

-- CreateIndex
CREATE INDEX "erp_financial_audits_userId_idx" ON "erp_financial_audits"("userId");

-- CreateIndex
CREATE INDEX "erp_security_incidents_tenantId_idx" ON "erp_security_incidents"("tenantId");

-- AddForeignKey
ALTER TABLE "erp_financial_summaries" ADD CONSTRAINT "erp_financial_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_financial_audits" ADD CONSTRAINT "erp_financial_audits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_security_incidents" ADD CONSTRAINT "erp_security_incidents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
