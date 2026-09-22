-- AlterTable
ALTER TABLE "erp_expenses" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "erp_stock_movements" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "erp_projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_project_milestones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "billingPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_projects_tenantId_idx" ON "erp_projects"("tenantId");

-- CreateIndex
CREATE INDEX "erp_projects_leadId_idx" ON "erp_projects"("leadId");

-- CreateIndex
CREATE INDEX "erp_projects_status_idx" ON "erp_projects"("status");

-- CreateIndex
CREATE INDEX "erp_project_milestones_tenantId_idx" ON "erp_project_milestones"("tenantId");

-- CreateIndex
CREATE INDEX "erp_project_milestones_projectId_idx" ON "erp_project_milestones"("projectId");

-- AddForeignKey
ALTER TABLE "erp_expenses" ADD CONSTRAINT "erp_expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "erp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_stock_movements" ADD CONSTRAINT "erp_stock_movements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "erp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_projects" ADD CONSTRAINT "erp_projects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_projects" ADD CONSTRAINT "erp_projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_project_milestones" ADD CONSTRAINT "erp_project_milestones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_project_milestones" ADD CONSTRAINT "erp_project_milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "erp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
