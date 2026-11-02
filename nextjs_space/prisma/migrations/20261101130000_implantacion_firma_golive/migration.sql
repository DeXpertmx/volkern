-- Cierre del alta: la firma del go-live.
--
-- El checklist daba por cerradas «Plantillas revisadas» y «Go-live firmado» en
-- cuanto el alta llegaba al último paso, sin que nadie hubiera firmado nada ni
-- escrito con qué criterio se mide. `firmaGoLive` guarda el criterio de éxito,
-- la confirmación de que las plantillas se revisaron con datos reales, cuándo
-- se firmó y quién; sin ella esas dos líneas siguen abiertas.
ALTER TABLE "implantacion_tenant" ADD COLUMN "firmaGoLive" JSONB;
