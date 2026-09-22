-- Registro de viajeros — comunicación al Ministerio del Interior
-- (SES Hospedajes, RD 933/2021 art. 6). El XML de la solicitud y el sobre SOAP
-- se construyen en lib/hospitality/registro-viajeros.ts conforme a la interfaz
-- oficial v3.1.2; aquí solo vive lo que hay que persistir: el código de
-- establecimiento por propiedad, la configuración del arrendador por tenant
-- (con las credenciales cifradas) y la traza de cada comunicación enviada.

-- AlterTable
ALTER TABLE "hospitality_properties" ADD COLUMN     "codigoEstablecimientoMIR" TEXT;

-- CreateTable
CREATE TABLE "hospitality_mir_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigoArrendador" TEXT NOT NULL,
    "aplicacion" TEXT NOT NULL DEFAULT 'Volkern',
    "entorno" TEXT NOT NULL DEFAULT 'pre',
    "usuarioEnc" TEXT,
    "passwordEnc" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoEnvio" TIMESTAMP(3),
    "ultimoError" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_mir_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitality_guest_registry_communications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT,
    "tipoComunicacion" TEXT NOT NULL DEFAULT 'PV',
    "tipoOperacion" TEXT NOT NULL DEFAULT 'A',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "referencia" TEXT,
    "codigoEstablecimiento" TEXT,
    "lote" TEXT,
    "codigoComunicacion" TEXT,
    "codigoRetorno" TEXT,
    "descripcion" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "errores" JSONB,
    "xmlSolicitud" TEXT,
    "respuesta" TEXT,
    "fechaEnvio" TIMESTAMP(3),
    "fechaRespuesta" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_guest_registry_communications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_mir_config_tenantId_key" ON "hospitality_mir_config"("tenantId");

-- CreateIndex
CREATE INDEX "hospitality_guest_registry_communications_tenantId_idx" ON "hospitality_guest_registry_communications"("tenantId");

-- CreateIndex
CREATE INDEX "hospitality_guest_registry_communications_estado_idx" ON "hospitality_guest_registry_communications"("estado");

-- CreateIndex
CREATE INDEX "hospitality_guest_registry_communications_lote_idx" ON "hospitality_guest_registry_communications"("lote");

-- CreateIndex
CREATE INDEX "hospitality_guest_registry_communications_reservationId_idx" ON "hospitality_guest_registry_communications"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_guest_registry_communications_tenantId_reservat_key" ON "hospitality_guest_registry_communications"("tenantId", "reservationId", "tipoComunicacion", "tipoOperacion");

-- AddForeignKey
ALTER TABLE "hospitality_mir_config" ADD CONSTRAINT "hospitality_mir_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_guest_registry_communications" ADD CONSTRAINT "hospitality_guest_registry_communications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_guest_registry_communications" ADD CONSTRAINT "hospitality_guest_registry_communications_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
