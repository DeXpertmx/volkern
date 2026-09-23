-- Tareas de limpieza de unidades alojativas (plan maestro §18.3)
CREATE TABLE "hospitality_cleaning_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reservationId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prioridad" TEXT NOT NULL DEFAULT 'normal',
    "responsable" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pending',
    "notas" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_cleaning_tasks_pkey" PRIMARY KEY ("id")
);

-- Incidencias de mantenimiento (plan maestro §18.4)
CREATE TABLE "hospitality_maintenance_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "incidencia" TEXT NOT NULL,
    "descripcion" TEXT,
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "responsable" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'abierta',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_maintenance_tasks_pkey" PRIMARY KEY ("id")
);

-- Índices y FKs
CREATE INDEX "hospitality_cleaning_tasks_tenantId_idx" ON "hospitality_cleaning_tasks"("tenantId");
CREATE INDEX "hospitality_cleaning_tasks_unitId_idx" ON "hospitality_cleaning_tasks"("unitId");
CREATE INDEX "hospitality_cleaning_tasks_estado_idx" ON "hospitality_cleaning_tasks"("estado");
CREATE INDEX "hospitality_maintenance_tasks_tenantId_idx" ON "hospitality_maintenance_tasks"("tenantId");
CREATE INDEX "hospitality_maintenance_tasks_unitId_idx" ON "hospitality_maintenance_tasks"("unitId");
CREATE INDEX "hospitality_maintenance_tasks_estado_idx" ON "hospitality_maintenance_tasks"("estado");

ALTER TABLE "hospitality_cleaning_tasks" ADD CONSTRAINT "hospitality_cleaning_tasks_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_cleaning_tasks" ADD CONSTRAINT "hospitality_cleaning_tasks_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_cleaning_tasks" ADD CONSTRAINT "hospitality_cleaning_tasks_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "hospitality_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hospitality_maintenance_tasks" ADD CONSTRAINT "hospitality_maintenance_tasks_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospitality_maintenance_tasks" ADD CONSTRAINT "hospitality_maintenance_tasks_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "hospitality_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;