-- Alta guiada: estado del descubrimiento y de la elección de módulos por tenant.
--
-- Un alta que se abandona a mitad no deja rastro hoy: ni el cliente sabe dónde
-- estaba ni soporte sabe en qué punto se cayó. `estado` es el paso actual
-- (descubrimiento → propuesta → seleccion → personalizacion → datos → listo),
-- `descubrimiento` guarda respuestas, «no lo sé» y notas, y `recomendacion`
-- guarda lo que se le propuso con su motivo (para poder explicar por qué).
CREATE TABLE "implantacion_tenant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'descubrimiento',
    "descubrimiento" JSONB,
    "recomendacion" JSONB,
    "aceptados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "descartados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completadoEn" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "implantacion_tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "implantacion_tenant_tenantId_key" ON "implantacion_tenant"("tenantId");

ALTER TABLE "implantacion_tenant" ADD CONSTRAINT "implantacion_tenant_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
