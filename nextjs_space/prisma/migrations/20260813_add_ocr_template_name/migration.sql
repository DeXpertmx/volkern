-- Múltiples plantillas por proveedor: cada una con un nombre (formato).
ALTER TABLE "erp_supplier_ocr_templates" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Formato 1';

-- Índice único por (tenantId, supplierName, name)
DROP INDEX IF EXISTS "erp_supplier_ocr_templates_tenantId_supplierName_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "erp_supplier_ocr_templates_tenantId_supplierName_name_idx" ON "erp_supplier_ocr_templates"("tenantId", "supplierName", "name");
