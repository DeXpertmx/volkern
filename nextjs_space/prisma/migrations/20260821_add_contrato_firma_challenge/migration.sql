-- CreateTable
CREATE TABLE "contrato_firma_challenges" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "challengeTokenHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_firma_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_firma_challenges_contratoId_idx" ON "contrato_firma_challenges"("contratoId");

-- CreateIndex
CREATE INDEX "contrato_firma_challenges_tenantId_idx" ON "contrato_firma_challenges"("tenantId");

-- AddForeignKey
ALTER TABLE "contrato_firma_challenges" ADD CONSTRAINT "contrato_firma_challenges_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_firma_challenges" ADD CONSTRAINT "contrato_firma_challenges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
