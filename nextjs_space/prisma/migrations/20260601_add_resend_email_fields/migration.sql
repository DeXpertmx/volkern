-- Add Resend email domain fields to Tenant model
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "resendDomainId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emailDomainStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emailDomainConfiguredAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_resendDomainId_key" ON "Tenant"("resendDomainId");
