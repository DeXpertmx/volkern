-- Credencial de conectividad POR PROPIEDAD y PROVEEDOR.
--
-- NOBEDS emite un token por hotel y lo exige en la ruta de cada llamada
-- (`/api/{Recurso}/{token}`), mientras que `hospitality_connectivity_config`
-- guarda UN partner id por TENANT. Con un hotel por cliente ese modelo aguanta;
-- con varios no: dos propiedades del mismo tenant acabarían compartiendo
-- credencial y viendo el catálogo de la otra.
--
-- Esta tabla convive con la anterior durante la migración. No sustituye a
-- `connectivity_providers` (la fila de plataforma con el par Basic del proveedor
-- actual): añade el secreto de una propiedad concreta para un proveedor concreto.
--
-- `tokenEnc` va cifrado con `lib/core/crypto.ts` y NUNCA se registra ni se
-- devuelve por API: en NOBEDS el token viaja en la URL y quedaría en logs de
-- proxies. La decisión de quién escribe no se toma aquí, sino en
-- `lib/hospitality/conectividad-proveedores.ts` (un solo escritor por propiedad).
CREATE TABLE "hospitality_connectivity_property_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalPropertyId" TEXT NOT NULL,
    "tokenEnc" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    -- `escritura` | `lectura`. El proveedor anterior se queda en `lectura`
    -- mientras el nuevo escribe: lee y reconcilia, no empuja nada.
    "modo" TEXT NOT NULL DEFAULT 'escritura',
    "estado" TEXT NOT NULL DEFAULT 'sin_configurar',
    "ultimoChequeo" TIMESTAMP(3),
    "ultimoError" TEXT,
    "configuracion" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_connectivity_property_config_pkey" PRIMARY KEY ("id")
);

-- Una credencial por propiedad y proveedor: la misma propiedad puede tener el
-- proveedor actual activo y el nuevo en pruebas sin pisarse.
-- El nombre está truncado a 63 caracteres A PROPÓSITO: es exactamente el que
-- genera Prisma para `@@unique([tenantId, propertyId, provider])`. Escribirlo
-- largo haría que Postgres lo truncara por su cuenta con otro corte y
-- `migrate diff` vería un índice fantasma.
CREATE UNIQUE INDEX "hospitality_connectivity_property_config_tenantId_propertyI_key"
  ON "hospitality_connectivity_property_config"("tenantId", "propertyId", "provider");
CREATE INDEX "hospitality_connectivity_property_config_tenantId_idx"
  ON "hospitality_connectivity_property_config"("tenantId");
CREATE INDEX "hospitality_connectivity_property_config_provider_estado_idx"
  ON "hospitality_connectivity_property_config"("provider", "estado");

ALTER TABLE "hospitality_connectivity_property_config"
  ADD CONSTRAINT "hospitality_connectivity_property_config_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_connectivity_property_config"
  ADD CONSTRAINT "hospitality_connectivity_property_config_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
