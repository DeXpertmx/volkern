-- CreateTable
-- ID de socio (partner id) del proveedor de conectividad, POR TENANT.
--
-- Cada hotel se registra con el proveedor y recibe el suyo: es la clave con la
-- que se piden SUS propiedades y con la que se empuja su inventario. La fila de
-- plataforma (`connectivity_providers`, creada en la migración de la capa de
-- conectividad) no se toca: sigue aportando el par Basic y su partner id como
-- respaldo de quien no tenga el propio.
--
-- El valor se guarda cifrado, igual que el resto de credenciales de la capa.
CREATE TABLE "hospitality_connectivity_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerIdEnc" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_connectivity_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Un partner id por cliente: la columna es única y es también el índice por el
-- que se resuelve en cada llamada a la capa (una lectura por tenant).
CREATE UNIQUE INDEX "hospitality_connectivity_config_tenantId_key" ON "hospitality_connectivity_config"("tenantId");

-- AddForeignKey
-- Si se elimina el cliente, su configuración se va con él: no aporta nada
-- huérfana y no debe bloquear el borrado del tenant.
ALTER TABLE "hospitality_connectivity_config" ADD CONSTRAINT "hospitality_connectivity_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
