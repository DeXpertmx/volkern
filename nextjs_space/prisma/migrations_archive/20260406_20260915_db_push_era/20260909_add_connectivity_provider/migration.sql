-- Proveedor de conectividad de canales (Hospitality): credenciales de la capa
-- de conectividad gestionadas desde el panel admin. Una fila por providerKey
-- (singleton por proveedor). Los secretos viajan cifrados (*_enc).
CREATE TABLE "connectivity_providers" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "nombreVisible" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "partnerIdEnc" TEXT,
    "usernameEnc" TEXT,
    "passwordEnc" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'sin_configurar',
    "ultimaSincronizacion" TIMESTAMP(3),
    "ultimoEvento" TIMESTAMP(3),
    "contadorErrores" INTEGER NOT NULL DEFAULT 0,
    "configuracion" JSONB,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectivityProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectivityProvider_providerKey_key" ON "connectivity_providers"("providerKey");
CREATE INDEX "ConnectivityProvider_estado_idx" ON "connectivity_providers"("estado");