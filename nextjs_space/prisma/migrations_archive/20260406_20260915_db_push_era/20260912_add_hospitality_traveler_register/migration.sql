-- Registro obligatorio de viajeros ante SES.HOSPEDAJES (Ministerio del Interior).
--
-- Cuatro tablas:
--   1. hospitality_compliance_config  — credenciales POR TENANT (cada cuenta se
--      registra como entidad ante SES.HOSPEDAJES y recibe las suyas), cifradas.
--   2. hospitality_travelers          — las personas alojadas en una reserva.
--   3. hospitality_compliance         — el registro de la reserva, con sus DOS
--      comunicaciones separadas: reserva de hospedaje (RH) y parte de viajeros (PV).
--   4. hospitality_compliance_events  — bitácora de envíos y respuestas.
--
-- Los datos personales son sensibles: la bitácora no guarda el XML con los
-- documentos completos, solo el resumen enmascarado y la respuesta del Ministerio.
-- Los ids externos del Ministerio nunca son identidad interna: es id + tenantId.

CREATE TABLE "hospitality_compliance_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "entorno" TEXT NOT NULL DEFAULT 'pruebas',
    "entidadNombre" TEXT,
    "entidadNif" TEXT,
    "usuarioEnc" TEXT,
    "passwordEnc" TEXT,
    "certificadoEnc" TEXT,
    "estadoConexion" TEXT NOT NULL DEFAULT 'sin_configurar',
    "ultimoEnvio" TIMESTAMP(3),
    "ultimoCodigo" TEXT,
    "ultimoError" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_compliance_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hospitality_compliance_config_tenantId_key" ON "hospitality_compliance_config"("tenantId");
CREATE INDEX "hospitality_compliance_config_estadoConexion_idx" ON "hospitality_compliance_config"("estadoConexion");

CREATE TABLE "hospitality_travelers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "esTitular" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "apellido1" TEXT NOT NULL,
    "apellido2" TEXT,
    "tipoDocumento" TEXT,
    "numeroDocumento" TEXT,
    "soporteDocumento" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "nacionalidad" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_travelers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_travelers_tenantId_idx" ON "hospitality_travelers"("tenantId");
CREATE INDEX "hospitality_travelers_reservationId_idx" ON "hospitality_travelers"("reservationId");
CREATE INDEX "hospitality_travelers_estado_idx" ON "hospitality_travelers"("estado");

CREATE TABLE "hospitality_compliance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "estadoReserva" TEXT NOT NULL DEFAULT 'pendiente',
    "estadoViajeros" TEXT NOT NULL DEFAULT 'pendiente',
    "codigoComunicacion" TEXT,
    "loteId" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "procesadoEn" TIMESTAMP(3),
    "codigoError" TEXT,
    "mensajeError" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospitality_compliance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hospitality_compliance_reservationId_key" ON "hospitality_compliance"("reservationId");
CREATE INDEX "hospitality_compliance_tenantId_idx" ON "hospitality_compliance"("tenantId");
CREATE INDEX "hospitality_compliance_estadoReserva_idx" ON "hospitality_compliance"("estadoReserva");
CREATE INDEX "hospitality_compliance_estadoViajeros_idx" ON "hospitality_compliance"("estadoViajeros");

CREATE TABLE "hospitality_compliance_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "complianceId" TEXT,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "codigoComunicacion" TEXT,
    "codigoError" TEXT,
    "mensajeError" TEXT,
    "detalle" TEXT,
    "usuarioId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hospitality_compliance_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hospitality_compliance_events_tenantId_idx" ON "hospitality_compliance_events"("tenantId");
CREATE INDEX "hospitality_compliance_events_reservationId_idx" ON "hospitality_compliance_events"("reservationId");
CREATE INDEX "hospitality_compliance_events_complianceId_idx" ON "hospitality_compliance_events"("complianceId");
CREATE INDEX "hospitality_compliance_events_tipo_idx" ON "hospitality_compliance_events"("tipo");

ALTER TABLE "hospitality_compliance_config"
  ADD CONSTRAINT "hospitality_compliance_config_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_travelers"
  ADD CONSTRAINT "hospitality_travelers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_travelers"
  ADD CONSTRAINT "hospitality_travelers_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_compliance"
  ADD CONSTRAINT "hospitality_compliance_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_compliance"
  ADD CONSTRAINT "hospitality_compliance_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_compliance_events"
  ADD CONSTRAINT "hospitality_compliance_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hospitality_compliance_events"
  ADD CONSTRAINT "hospitality_compliance_events_complianceId_fkey"
  FOREIGN KEY ("complianceId") REFERENCES "hospitality_compliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
