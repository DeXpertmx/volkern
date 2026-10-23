-- Unidades que, aun estando en una propiedad publicada, no salen en la página
-- pública del Booking Engine. Vacío = salen todas (comportamiento anterior).
-- Solo afecta a la web directa: no cambia disponibilidad ni el push a canales.
ALTER TABLE "hospitality_booking_config"
  ADD COLUMN "unidadesExcluidas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
