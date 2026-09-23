-- CreateTable
CREATE TABLE "cotizacion_acceptance_challenges" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destinationMasked" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "challengeTokenHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_acceptance_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizacion_acceptance_challenges_cotizacionId_createdAt_idx" ON "cotizacion_acceptance_challenges"("cotizacionId", "createdAt");

-- CreateIndex
CREATE INDEX "cotizacion_acceptance_challenges_tenantId_idx" ON "cotizacion_acceptance_challenges"("tenantId");

-- CreateIndex
CREATE INDEX "cotizacion_acceptance_challenges_expiresAt_idx" ON "cotizacion_acceptance_challenges"("expiresAt");

-- AddForeignKey
ALTER TABLE "cotizacion_acceptance_challenges" ADD CONSTRAINT "cotizacion_acceptance_challenges_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
