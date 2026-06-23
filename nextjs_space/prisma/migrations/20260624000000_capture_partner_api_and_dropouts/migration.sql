-- AlterTable
ALTER TABLE "AttendanceRules" DROP COLUMN IF EXISTS "randomPulsesPerDay",
DROP COLUMN IF EXISTS "requireSelfie",
ADD COLUMN     "blockIfNotNoticed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxTravelKmh" INTEGER NOT NULL DEFAULT 250,
ADD COLUMN     "minPunchIntervalSec" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "noticeVersion" TEXT NOT NULL DEFAULT 'v1-2026-gps-only',
ADD COLUMN     "retentionDays" INTEGER NOT NULL DEFAULT 1460;

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "partnerLabel" TEXT,
ADD COLUMN     "rateLimitPerMin" INTEGER,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "erp_payroll_runs_es" RENAME CONSTRAINT "PayrollRunES_pkey" TO "erp_payroll_runs_es_pkey";

-- AlterTable
ALTER TABLE "incoming_webhooks" ADD COLUMN     "partnerLabel" TEXT,
ADD COLUMN     "rateLimitPerMin" INTEGER,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "erp_idempotency_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "apiKeyId" TEXT,
    "requestId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "incomingWebhookId" TEXT,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSON NOT NULL,
    "signature" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "responseHeaders" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "incomingWebhookId" TEXT,

    CONSTRAINT "partner_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_idempotency_keys_tenantId_idx" ON "erp_idempotency_keys"("tenantId");

-- CreateIndex
CREATE INDEX "erp_idempotency_keys_expiresAt_idx" ON "erp_idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "erp_idempotency_keys_tenantId_scope_key_key" ON "erp_idempotency_keys"("tenantId", "scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "api_request_logs_requestId_key" ON "api_request_logs"("requestId");

-- CreateIndex
CREATE INDEX "api_request_logs_tenantId_occurredAt_idx" ON "api_request_logs"("tenantId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "api_request_logs_apiKeyId_occurredAt_idx" ON "api_request_logs"("apiKeyId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "api_request_logs_statusCode_idx" ON "api_request_logs"("statusCode");

-- CreateIndex
CREATE UNIQUE INDEX "partner_webhook_deliveries_eventId_key" ON "partner_webhook_deliveries"("eventId");

-- CreateIndex
CREATE INDEX "partner_webhook_deliveries_tenantId_status_nextAttemptAt_idx" ON "partner_webhook_deliveries"("tenantId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "partner_webhook_deliveries_apiKeyId_createdAt_idx" ON "partner_webhook_deliveries"("apiKeyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "partner_webhook_deliveries_eventType_idx" ON "partner_webhook_deliveries"("eventType");

-- CreateIndex
CREATE INDEX "api_keys_webhookEnabled_idx" ON "api_keys"("webhookEnabled");

-- CreateIndex
CREATE INDEX "erp_payroll_runs_es_tenantId_idx" ON "erp_payroll_runs_es"("tenantId");

-- CreateIndex
CREATE INDEX "erp_payroll_runs_es_period_idx" ON "erp_payroll_runs_es"("period");

-- AddForeignKey
ALTER TABLE "erp_idempotency_keys" ADD CONSTRAINT "erp_idempotency_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_incomingWebhookId_fkey" FOREIGN KEY ("incomingWebhookId") REFERENCES "incoming_webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_webhook_deliveries" ADD CONSTRAINT "partner_webhook_deliveries_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_webhook_deliveries" ADD CONSTRAINT "partner_webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_webhook_deliveries" ADD CONSTRAINT "partner_webhook_deliveries_incomingWebhookId_fkey" FOREIGN KEY ("incomingWebhookId") REFERENCES "incoming_webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_payroll_runs_es" ADD CONSTRAINT "erp_payroll_runs_es_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

