-- CreateTable
CREATE TABLE "contrato_timeline" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "action" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_timeline_contratoId_createdAt_idx" ON "contrato_timeline"("contratoId", "createdAt");

-- AddForeignKey
ALTER TABLE "contrato_timeline" ADD CONSTRAINT "contrato_timeline_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
