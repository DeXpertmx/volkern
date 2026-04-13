-- CreateTable
CREATE TABLE "sales_playbook_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "objection" TEXT NOT NULL,
    "bestResponse" TEXT NOT NULL,
    "technique" TEXT,
    "sourceSessionId" TEXT,
    "agentId" TEXT,
    "score" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_playbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_playbook_entries_tenantId_idx" ON "sales_playbook_entries"("tenantId");

-- CreateIndex
CREATE INDEX "sales_playbook_entries_topic_idx" ON "sales_playbook_entries"("topic");

-- CreateIndex
CREATE INDEX "sales_playbook_entries_status_idx" ON "sales_playbook_entries"("status");

-- AddForeignKey
ALTER TABLE "sales_playbook_entries" ADD CONSTRAINT "sales_playbook_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_playbook_entries" ADD CONSTRAINT "sales_playbook_entries_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
