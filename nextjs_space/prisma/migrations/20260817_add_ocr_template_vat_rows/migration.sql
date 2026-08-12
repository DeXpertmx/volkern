-- Plantilla de tramos de IVA por proveedor: posiciones (relativas 0..1) de las
-- columnas tipo/base/cuota de cada fila de impuestos, aprendidas cuando el
-- usuario confirma los tramos tras el escaneo.
ALTER TABLE "erp_supplier_ocr_templates" ADD COLUMN IF NOT EXISTS "vatRows" JSONB;
