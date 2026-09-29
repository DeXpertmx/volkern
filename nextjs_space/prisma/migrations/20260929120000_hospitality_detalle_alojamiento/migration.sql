-- Detalle declarado del alojamiento (editor estilo Airbnb): habitaciones,
-- camas y servicios del establecimiento como JSONB. Null = sin configurar.
ALTER TABLE "hospitality_properties" ADD COLUMN     "detalleAlojamiento" JSONB;
