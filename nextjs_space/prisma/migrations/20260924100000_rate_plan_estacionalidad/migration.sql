-- Estacionalidad en rate plans (capa 1 del pricing dinámico).
--
-- Dos columnas opcionales en hospitality_rate_plans, ambas Json nulas por
-- defecto: un plan sin configuración sigue cotizando exactamente igual que
-- ayer (tarifa plana), así que la migración no cambia ningún precio vivo.
--
-- - "temporadas":  [{ desde, hasta, tarifa, nombre? }] — precio ABSOLUTO por
--   noche dentro del rango (la noche cuesta la tarifa de SU fecha).
-- - "finDeSemana": { dias: number[], porcentaje } — recargo porcentual sobre
--   la tarifa de noches SIN temporada (0=domingo … 6=sábado).
--
-- La normalización y la precedencia viven en código
-- (lib/hospitality/estacionalidad.ts); la base solo guarda la configuración.

ALTER TABLE "hospitality_rate_plans" ADD COLUMN "temporadas" JSONB;
ALTER TABLE "hospitality_rate_plans" ADD COLUMN "finDeSemana" JSONB;
