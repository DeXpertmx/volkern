-- Ajustes de precio en rate plans (capa 2 del pricing dinámico).
--
-- Una columna opcional más en hospitality_rate_plans, Json y nulable: un plan
-- sin ajustes sigue cotizando exactamente igual que ayer (tarifa plana, o la
-- tarifa por noche de la capa 1 si tiene temporadas), así que la migración no
-- cambia ningún precio vivo ni pide migración de datos.
--
-- - "antelacion": [{ desdeDias, hastaDias, porcentaje, nombre? }] — tramos por
--   días entre la reserva y la llegada (null en hastaDias = sin techo).
-- - "ocupacion":  [{ desdePorcentaje, porcentaje, nombre? }] — tramos por % de
--   unidades vendibles ya ocupadas esa noche.
-- - "duracion":   [{ desdeNoches, porcentaje, nombre? }] — tramos por noches de
--   la estancia.
--
-- `porcentaje` es firmado: negativo descuenta, positivo recarga. La
-- normalización, la precedencia (un tramo por regla, el más específico) y el
-- suelo/techo del factor combinado viven en código
-- (lib/hospitality/ajustes.ts); la base solo guarda la configuración.

ALTER TABLE "hospitality_rate_plans" ADD COLUMN "ajustes" JSONB;
