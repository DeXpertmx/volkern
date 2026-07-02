-- ═══════════════════════════════════════════════
-- Purpose:   Add address fields to Lead and Contact
-- Strategy:  ALTER TABLE ADD COLUMN for 4 optional
--            String fields on both models
-- Reversible: Yes (ALTER TABLE DROP COLUMN)
-- ═══════════════════════════════════════════════

-- Add address fields to Lead
ALTER TABLE "Lead" ADD COLUMN "direccion" TEXT;
ALTER TABLE "Lead" ADD COLUMN "ciudad" TEXT;
ALTER TABLE "Lead" ADD COLUMN "codigoPostal" TEXT;
ALTER TABLE "Lead" ADD COLUMN "pais" TEXT;

-- Add address fields to Contact
ALTER TABLE "Contact" ADD COLUMN "direccion" TEXT;
ALTER TABLE "Contact" ADD COLUMN "ciudad" TEXT;
ALTER TABLE "Contact" ADD COLUMN "codigoPostal" TEXT;
ALTER TABLE "Contact" ADD COLUMN "pais" TEXT;
