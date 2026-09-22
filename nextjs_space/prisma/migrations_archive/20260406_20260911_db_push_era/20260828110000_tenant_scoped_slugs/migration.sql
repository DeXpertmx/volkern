-- Slugs de booking y tarjeta únicos POR TENANT (antes: únicos globales).
-- Dos tenants pueden ahora usar el mismo bookingSlug / urlUnica sin conflicto.
-- Las lookups públicos filtran por el subdominio del tenant y hacen fallback
-- global para QRs ya impresos (ver lib/public-slug-lookup.ts).

-- 1. Eliminar las constraints globales anteriores
DROP INDEX IF EXISTS "User_bookingSlug_key";
DROP INDEX IF EXISTS "digital_cards_urlUnica_key";

-- 2. Constraints compuestas por tenant
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_bookingSlug_key" ON "User"("tenantId", "bookingSlug");
CREATE UNIQUE INDEX IF NOT EXISTS "digital_cards_tenantId_urlUnica_key" ON "digital_cards"("tenantId", "urlUnica");

-- 3. Índice para el fallback global de QRs (lookup por slug sin tenant)
CREATE INDEX IF NOT EXISTS "User_bookingSlug_idx" ON "User"("bookingSlug");
