-- El detalle declarado del alojamiento (habitaciones y distribución de camas)
-- es de la UNIDAD: cada unidad de un complejo tiene su propia distribución.
-- En la propiedad solo quedan las áreas comunes e instalaciones del complejo
-- (`detalleAlojamiento.servicios`), que ya viven ahí.
-- Backfill: la declaración de la propiedad pasa a cada unidad de esa propiedad
-- que no tenga la suya (mismo shape; el campo `servicios` no se copia: en la
-- unidad el catálogo vivo es `amenidades`). La propiedad conserva su
-- `detalleAlojamiento` intacto: la relectura la encoge a solo servicios y la
-- UI muestra habitaciones/camas como agregado de sus unidades.
ALTER TABLE "hospitality_units" ADD COLUMN     "detalleAlojamiento" JSONB;

UPDATE "hospitality_units" u
SET "detalleAlojamiento" = sub.detalle
FROM (
  SELECT p.id AS property_id, p."detalleAlojamiento" AS detalle
  FROM "hospitality_properties" p
  WHERE p."detalleAlojamiento" IS NOT NULL
    AND p."detalleAlojamiento" ? 'habitaciones'
    AND p."detalleAlojamiento"->'habitaciones' <> '{}'::jsonb
) sub
WHERE u."propertyId" = sub.property_id
  AND u."detalleAlojamiento" IS NULL;
