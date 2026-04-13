-- CreateTable
CREATE TABLE "erp_qc_points" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" TEXT,
    "tolerance" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_qc_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_qc_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "workOrderId" TEXT,
    "pointId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PASSED',
    "measuredValue" TEXT,
    "notes" TEXT,
    "inspectorId" TEXT,
    "evidenceUrl" TEXT,
    "integrityHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_qc_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_qc_non_conformities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "workOrderId" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "reportedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_qc_non_conformities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "erp_qc_points_tenantId_idx" ON "erp_qc_points"("tenantId");

-- CreateIndex
CREATE INDEX "erp_qc_checks_tenantId_idx" ON "erp_qc_checks"("tenantId");

-- CreateIndex
CREATE INDEX "erp_qc_checks_projectId_idx" ON "erp_qc_checks"("projectId");

-- CreateIndex
CREATE INDEX "erp_qc_checks_workOrderId_idx" ON "erp_qc_checks"("workOrderId");

-- CreateIndex
CREATE INDEX "erp_qc_non_conformities_tenantId_idx" ON "erp_qc_non_conformities"("tenantId");

-- CreateIndex
CREATE INDEX "erp_qc_non_conformities_projectId_idx" ON "erp_qc_non_conformities"("projectId");

-- CreateIndex
CREATE INDEX "erp_qc_non_conformities_workOrderId_idx" ON "erp_qc_non_conformities"("workOrderId");

-- AddForeignKey
ALTER TABLE "erp_qc_points" ADD CONSTRAINT "erp_qc_points_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_checks" ADD CONSTRAINT "erp_qc_checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_checks" ADD CONSTRAINT "erp_qc_checks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "erp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_checks" ADD CONSTRAINT "erp_qc_checks_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "erp_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_checks" ADD CONSTRAINT "erp_qc_checks_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "erp_qc_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_non_conformities" ADD CONSTRAINT "erp_qc_non_conformities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_non_conformities" ADD CONSTRAINT "erp_qc_non_conformities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "erp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_qc_non_conformities" ADD CONSTRAINT "erp_qc_non_conformities_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "erp_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
