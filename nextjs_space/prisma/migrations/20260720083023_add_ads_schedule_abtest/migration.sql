-- ═══════════════════════════════════════════════
-- Purpose:   Add AdSchedule, AdABTest, AdABTestVariant tables
-- Strategy:  CREATE TABLE with FK to Tenant and AdCampaign
-- Reversible: Yes (DROP TABLE ... CASCADE)
-- ═══════════════════════════════════════════════

-- AdSchedule: programación horaria para campañas
CREATE TABLE "ad_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT,
    "name" TEXT NOT NULL,
    "daysOfWeek" JSONB NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "action" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ad_schedules_pkey" PRIMARY KEY ("id")
);

-- AdABTest: tests A/B
CREATE TABLE "ad_ab_tests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metric" TEXT NOT NULL,
    "significanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "trafficSplit" TEXT NOT NULL DEFAULT 'FIFTY_FIFTY',
    "winnerId" TEXT,
    "declaredAt" TIMESTAMPTZ,
    "autoDeclare" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMPTZ,
    "endDate" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ad_ab_tests_pkey" PRIMARY KEY ("id")
);

-- AdABTestVariant: variantes individuales
CREATE TABLE "ad_ab_test_variants" (
    "id" TEXT NOT NULL,
    "abTestId" TEXT NOT NULL,
    "adSetId" TEXT,
    "adId" TEXT,
    "label" TEXT NOT NULL,
    "trafficAllocation" DOUBLE PRECISION,
    "currentImpressions" INTEGER NOT NULL DEFAULT 0,
    "currentClicks" INTEGER NOT NULL DEFAULT 0,
    "currentConversions" INTEGER NOT NULL DEFAULT 0,
    "currentSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentMetric" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ad_ab_test_variants_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ad_schedules_tenant_id_idx" ON "ad_schedules" ("tenantId");
CREATE INDEX "ad_schedules_campaign_id_idx" ON "ad_schedules" ("campaignId");
CREATE INDEX "ad_schedules_enabled_idx" ON "ad_schedules" ("enabled");
CREATE INDEX "ad_ab_tests_tenant_id_idx" ON "ad_ab_tests" ("tenantId");
CREATE INDEX "ad_ab_tests_campaign_id_idx" ON "ad_ab_tests" ("campaignId");
CREATE INDEX "ad_ab_tests_status_idx" ON "ad_ab_tests" ("status");
CREATE INDEX "ad_ab_test_variants_ab_test_id_idx" ON "ad_ab_test_variants" ("abTestId");

-- Foreign keys
ALTER TABLE "ad_schedules" ADD CONSTRAINT "ad_schedules_tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;
ALTER TABLE "ad_schedules" ADD CONSTRAINT "ad_schedules_campaign_id_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "ad_ab_tests" ADD CONSTRAINT "ad_ab_tests_tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;
ALTER TABLE "ad_ab_tests" ADD CONSTRAINT "ad_ab_tests_campaign_id_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "ad_ab_test_variants" ADD CONSTRAINT "ad_ab_test_variants_ab_test_id_fkey" FOREIGN KEY ("abTestId") REFERENCES "ad_ab_tests"("id") ON DELETE CASCADE;
