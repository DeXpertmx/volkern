-- Mensajería del canal (OTAs) con el huésped.
--
-- El proveedor de conectividad tiene dos endpoints de mensajería que hasta hoy
-- no usábamos: su webhook (nos entrega cada mensaje de una conversación de OTA)
-- y su API de respuesta (`/message-reply/{pms}`). Estas dos tablas son la
-- bandeja del hotel: una fila por hilo y una por mensaje, en las dos
-- direcciones.
--
-- Claves de diseño (ver lib/hospitality/mensajes-canal.ts y docs/hospitality-mensajes-canal.md):
--   * El hilo se identifica con la clave del PROVEEDOR (`channel` +
--     `conversation_id`): es del huésped y de la reserva, no de un usuario.
--   * Dedupe por `message_id` (`hospitality_canal_mensaje_conversacionId_mensajeExternoId_key`):
--     una entrega repetida del mismo mensaje no duplica nada.
--   * `enviadoEn` es la hora del proveedor y admite NULL a propósito: si viene
--     ilegible el mensaje se guarda sin ella (el hilo ordena por `fechaCreacion`)
--     en vez de inventarla.
--   * `estado = error` en un mensaje saliente significa que la respuesta NO
--     llegó al canal: se queda en el hilo con su motivo.
--
-- Aditiva y sin destructivos: solo crea dos tablas nuevas.
-- CreateTable
CREATE TABLE "hospitality_canal_conversacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT,
    "reservationId" TEXT,
    "canal" TEXT NOT NULL,
    "hotelCode" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "bookingExterno" TEXT,
    "huespedNombre" TEXT,
    "huespedEmail" TEXT,
    "huespedTelefono" TEXT,
    "ultimoMensajeEn" TIMESTAMP(3) NOT NULL,
    "sinLeer" INTEGER NOT NULL DEFAULT 0,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_canal_conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitality_canal_mensaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "mensajeExternoId" TEXT,
    "direccion" TEXT NOT NULL,
    "emisor" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'text',
    "enviadoEn" TIMESTAMP(3),
    "adjuntos" JSONB,
    "estado" TEXT NOT NULL DEFAULT 'recibido',
    "error" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_canal_mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospitality_canal_conversacion_tenantId_ultimoMensajeEn_idx" ON "hospitality_canal_conversacion"("tenantId", "ultimoMensajeEn");

-- CreateIndex
CREATE INDEX "hospitality_canal_conversacion_propertyId_idx" ON "hospitality_canal_conversacion"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_canal_conversacion_tenantId_canal_conversacionI_key" ON "hospitality_canal_conversacion"("tenantId", "canal", "conversacionId");

-- CreateIndex
CREATE INDEX "hospitality_canal_mensaje_tenantId_fechaCreacion_idx" ON "hospitality_canal_mensaje"("tenantId", "fechaCreacion");

-- CreateIndex
CREATE INDEX "hospitality_canal_mensaje_conversacionId_fechaCreacion_idx" ON "hospitality_canal_mensaje"("conversacionId", "fechaCreacion");

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_canal_mensaje_conversacionId_mensajeExternoId_key" ON "hospitality_canal_mensaje"("conversacionId", "mensajeExternoId");

-- AddForeignKey
ALTER TABLE "hospitality_canal_conversacion" ADD CONSTRAINT "hospitality_canal_conversacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_canal_conversacion" ADD CONSTRAINT "hospitality_canal_conversacion_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "hospitality_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_canal_conversacion" ADD CONSTRAINT "hospitality_canal_conversacion_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_canal_mensaje" ADD CONSTRAINT "hospitality_canal_mensaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitality_canal_mensaje" ADD CONSTRAINT "hospitality_canal_mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "hospitality_canal_conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

