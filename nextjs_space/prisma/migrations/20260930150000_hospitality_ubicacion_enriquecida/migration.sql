-- Ubicación enriquecida del alojamiento (editor estilo Airbnb, benchmark UI/UX):
-- distancias a transporte (JSONB con unidad km|millas), indicaciones de llegada
-- multi-idioma (JSONB Record<idioma, texto>) y mapa personalizado (URL de la
-- imagen subida por el operador). Aditivo: null = sin configurar.
ALTER TABLE "hospitality_properties" ADD COLUMN     "distancias" JSONB;
ALTER TABLE "hospitality_properties" ADD COLUMN     "indicaciones" JSONB;
ALTER TABLE "hospitality_properties" ADD COLUMN     "mapaPersonalizadoUrl" TEXT;
