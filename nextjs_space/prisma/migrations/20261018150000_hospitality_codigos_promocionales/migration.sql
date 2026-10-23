-- Códigos promocionales del canal directo. El descuento se aplica SOLO al
-- alojamiento y lo calcula el servidor: la web únicamente manda el código.
-- `usos` es el contador de reservas creadas con el código; `maxUsos` nulo = sin
-- límite. La unicidad es por tenant: dos hoteles pueden usar «VERANO2027».
CREATE TABLE "hospitality_promo_code" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'porcentaje',
    "valor" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "desde" TIMESTAMP(3),
    "hasta" TIMESTAMP(3),
    "minNoches" INTEGER NOT NULL DEFAULT 1,
    "maxUsos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "descripcion" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_promo_code_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hospitality_promo_code_tenantId_codigo_key" ON "hospitality_promo_code"("tenantId", "codigo");
CREATE INDEX "hospitality_promo_code_tenantId_idx" ON "hospitality_promo_code"("tenantId");

ALTER TABLE "hospitality_promo_code" ADD CONSTRAINT "hospitality_promo_code_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
