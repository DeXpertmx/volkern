-- CreateTable
CREATE TABLE "SaaSMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "arr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "churnedCustomers" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "expansionRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractionRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trialConversions" INTEGER NOT NULL DEFAULT 0,
    "trialStarts" INTEGER NOT NULL DEFAULT 0,
    "trialConversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaaSMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaaSMetricSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaaSMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaaSMetric_tenantId_date_key" ON "SaaSMetric"("tenantId", "date");

-- CreateIndex
CREATE INDEX "SaaSMetric_tenantId_idx" ON "SaaSMetric"("tenantId");

-- CreateIndex
CREATE INDEX "SaaSMetric_date_idx" ON "SaaSMetric"("date");

-- CreateIndex
CREATE INDEX "SaaSMetricSnapshot_date_idx" ON "SaaSMetricSnapshot"("date");