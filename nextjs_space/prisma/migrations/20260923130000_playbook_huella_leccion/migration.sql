-- Deduplicación de la cosecha al Playbook (C4): dos sesiones muy parecidas
-- no deben crear entradas casi iguales. La huella (tema + objeción
-- normalizada) nace con la cosecha y el par (tenantId, huellaLeccion) es
-- único: la segunda cosecha de la misma lección encuentra la entrada y se
-- devuelve sin crear fila duplicada. NULL (entradas manuales) no participa:
-- en Postgres los NULL son distintos entre sí dentro de un unique.
ALTER TABLE "sales_playbook_entries" ADD COLUMN "huellaLeccion" TEXT;

CREATE UNIQUE INDEX "sales_playbook_entries_tenantId_huellaLeccion_key"
  ON "sales_playbook_entries"("tenantId", "huellaLeccion");
