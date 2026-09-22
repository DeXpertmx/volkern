-- El XSD de alta de partes de viajeros exige el bloque `pago` con un
-- `tipoPago` del catálogo TIPO_PAGO del Ministerio. Ese catálogo lo publica el
-- servicio (operación `catalogo`) y no se inventa en el código: se configura
-- por tenant, con un mapa desde el método de pago interno y un valor por
-- defecto. Sin configurar, el parte queda en `datos_incompletos` en vez de
-- enviarse con un código falso.

-- AlterTable
ALTER TABLE "hospitality_mir_config" ADD COLUMN     "tipoPagoDefecto" TEXT,
ADD COLUMN     "mapaTiposPago" JSONB;
