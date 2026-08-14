-- Añade el trato fiscal del proveedor: régimen legal y porcentajes de
-- retención aplicables al pagarle (IRPF/IVA).
--
--   fiscalRegime  : EMPRESA | PROFESIONAL | PRIMER_ANO | ARRENDADOR | CUSTOM
--   irpfRetention : % retención IRPF (p. ej. 15 → 15%)
--   ivaRetention  : % retención IVA (casos legales específicos)
--
-- Idempotente: proveedores existentes quedan con EMPRESA (sin retención).
ALTER TABLE "erp_suppliers"
  ADD COLUMN IF NOT EXISTS "fiscalRegime"  TEXT    NOT NULL DEFAULT 'EMPRESA',
  ADD COLUMN IF NOT EXISTS "irpfRetention" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ivaRetention"  DOUBLE PRECISION NOT NULL DEFAULT 0;
