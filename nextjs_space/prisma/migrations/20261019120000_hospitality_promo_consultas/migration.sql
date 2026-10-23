-- Consultas de códigos promocionales en la web pública. Es el INTENTO: sirve
-- para medir la conversión de cada código, porque hasta ahora solo se guardaba
-- la reserva ya creada (y el intento que no reservó no dejaba rastro).
--
-- `resultado` es «aplicada» o el motivo del rechazo; `reservationId` se rellena
-- cuando esa misma sesión acaba reservando. `sesionId` lo genera el asistente:
-- la unicidad por (tenant, sesión, código) evita que aplicar el código varias
-- veces en la misma visita infle el denominador.
CREATE TABLE "hospitality_promo_consulta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "resultado" TEXT NOT NULL DEFAULT 'aplicada',
    "motivo" TEXT,
    "sesionId" TEXT,
    "reservationId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospitality_promo_consulta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hospitality_promo_consulta_tenantId_sesionId_codigo_key"
  ON "hospitality_promo_consulta"("tenantId", "sesionId", "codigo");
CREATE INDEX "hospitality_promo_consulta_tenantId_codigo_checkIn_idx"
  ON "hospitality_promo_consulta"("tenantId", "codigo", "checkIn");
CREATE INDEX "hospitality_promo_consulta_tenantId_checkIn_idx"
  ON "hospitality_promo_consulta"("tenantId", "checkIn");

ALTER TABLE "hospitality_promo_consulta" ADD CONSTRAINT "hospitality_promo_consulta_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
