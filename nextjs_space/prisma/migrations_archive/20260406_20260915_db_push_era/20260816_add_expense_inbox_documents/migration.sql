CREATE TABLE "erp_expense_inbox_documents" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'invoice',
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "pageStart" INTEGER NOT NULL DEFAULT 1,
  "pageEnd" INTEGER NOT NULL DEFAULT 1,
  "extractedData" JSONB,
  "expenseId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "erp_expense_inbox_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "erp_expense_inbox_documents_tenantId_status_idx" ON "erp_expense_inbox_documents"("tenantId", "status");
CREATE INDEX "erp_expense_inbox_documents_tenantId_createdAt_idx" ON "erp_expense_inbox_documents"("tenantId", "createdAt");
ALTER TABLE "erp_expense_inbox_documents" ADD CONSTRAINT "erp_expense_inbox_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "erp_expense_inbox_documents" ADD CONSTRAINT "erp_expense_inbox_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
