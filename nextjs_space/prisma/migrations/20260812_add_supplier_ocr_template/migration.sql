-- CreateTable
CREATE TABLE IF NOT EXISTS "erp_supplier_ocr_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "nif" TEXT,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_supplier_ocr_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "erp_supplier_ocr_templates_tenantId_supplierName_idx" ON "erp_supplier_ocr_templates"("tenantId", "supplierName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "erp_supplier_ocr_templates_tenantId_nif_idx" ON "erp_supplier_ocr_templates"("tenantId", "nif");

-- AddForeignKey
ALTER TABLE "erp_supplier_ocr_templates" ADD CONSTRAINT "erp_supplier_ocr_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
