-- Volkern Insurance Vertical — Initial Migration
-- Creates: enums, tables, indexes, foreign keys

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "Ramo" AS ENUM ('AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS', 'EMPRESARIAL', 'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE', 'AHORRO', 'JUBILACION', 'OTROS');
CREATE TYPE "EstadoPoliza" AS ENUM ('ACTIVA', 'PROXIMA_A_VENCER', 'VENCIDA', 'CANCELADA', 'EN_TRAMITE');
CREATE TYPE "FormaPago" AS ENUM ('ANUAL', 'SEMESTRAL', 'TRIMESTRAL', 'MENSUAL');
CREATE TYPE "EstadoRenovacion" AS ENUM ('PENDIENTE', 'CONTACTO_INICIAL', 'REVISION', 'OFERTA_ENVIADA', 'RENOVADA', 'NO_RENOVADA', 'PERDIDA');
CREATE TYPE "OrigenOportunidad" AS ENUM ('IA', 'MANUAL', 'RENOVACION', 'REFERIDO');
CREATE TYPE "EstadoOportunidad" AS ENUM ('NUEVA', 'EN_ANALISIS', 'COTIZADA', 'EN_NEGOCIACION', 'GANADA', 'PERDIDA');

-- ─── Aseguradoras ─────────────────────────────────────────────────────────────
CREATE TABLE "insurance_aseguradoras" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nif" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "web" TEXT,
    "codigoExterno" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_aseguradoras_pkey" PRIMARY KEY ("id")
);

-- ─── ProductoSeguro ───────────────────────────────────────────────────────────
CREATE TABLE "insurance_productos_seguro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aseguradoraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ramo" "Ramo" NOT NULL,
    "subramo" TEXT,
    "descripcion" TEXT,
    "primaReferencia" DECIMAL(65,30),
    "comisionPct" DECIMAL(65,30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_productos_seguro_pkey" PRIMARY KEY ("id")
);

-- ─── Poliza ───────────────────────────────────────────────────────────────────
CREATE TABLE "insurance_polizas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "aseguradoraId" TEXT NOT NULL,
    "productoSeguroId" TEXT NOT NULL,
    "numeroPoliza" TEXT NOT NULL,
    "descripcion" TEXT,
    "sumaAsegurada" DECIMAL(65,30),
    "primaAnual" DECIMAL(65,30),
    "formaPago" "FormaPago",
    "moneda" TEXT NOT NULL DEFAULT 'EUR',
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoPoliza" NOT NULL DEFAULT 'ACTIVA',
    "comisionPct" DECIMAL(65,30),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "insurance_polizas_pkey" PRIMARY KEY ("id")
);

-- ─── Renovacion ───────────────────────────────────────────────────────────────
CREATE TABLE "insurance_renovaciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoRenovacion" NOT NULL DEFAULT 'PENDIENTE',
    "nuevaPrima" DECIMAL(65,30),
    "nuevaSumaAsegurada" DECIMAL(65,30),
    "condicionesDiferentes" TEXT,
    "fechaContactoInicial" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "resultado" TEXT,
    "riesgoPerdida" BOOLEAN NOT NULL DEFAULT false,
    "motivoRiesgo" TEXT,
    "agenteAsignadoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_renovaciones_pkey" PRIMARY KEY ("id")
);

-- ─── OportunidadComercial ─────────────────────────────────────────────────────
CREATE TABLE "insurance_oportunidades" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "polizaOrigenId" TEXT,
    "productoSugeridoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "origen" "OrigenOportunidad" NOT NULL DEFAULT 'IA',
    "probabilidad" INTEGER NOT NULL,
    "primaEstimada" DECIMAL(65,30),
    "estado" "EstadoOportunidad" NOT NULL DEFAULT 'NUEVA',
    "agenteAsignadoId" TEXT,
    "fechaCierre" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_oportunidades_pkey" PRIMARY KEY ("id")
);

-- ─── InsuranceImportLog ────────────────────────────────────────────────────────
CREATE TABLE "insurance_import_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "rowsImported" INTEGER NOT NULL,
    "rowsFailed" INTEGER NOT NULL,
    "errors" JSONB,
    "summary" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insurance_import_logs_pkey" PRIMARY KEY ("id")
);

-- ─── Unique Constraints ───────────────────────────────────────────────────────
CREATE UNIQUE INDEX "insurance_aseguradoras_tenantId_nombre_key" ON "insurance_aseguradoras"("tenantId", "nombre");
CREATE UNIQUE INDEX "insurance_productos_seguro_tenantId_aseguradoraId_nombre_key" ON "insurance_productos_seguro"("tenantId", "aseguradoraId", "nombre");
CREATE UNIQUE INDEX "insurance_polizas_tenantId_numeroPoliza_key" ON "insurance_polizas"("tenantId", "numeroPoliza");

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "insurance_aseguradoras_tenantId_idx" ON "insurance_aseguradoras"("tenantId");
CREATE INDEX "insurance_productos_seguro_tenantId_ramo_idx" ON "insurance_productos_seguro"("tenantId", "ramo");
CREATE INDEX "insurance_productos_seguro_aseguradoraId_idx" ON "insurance_productos_seguro"("aseguradoraId");
CREATE INDEX "insurance_polizas_tenantId_estado_idx" ON "insurance_polizas"("tenantId", "estado");
CREATE INDEX "insurance_polizas_tenantId_fechaVencimiento_idx" ON "insurance_polizas"("tenantId", "fechaVencimiento");
CREATE INDEX "insurance_polizas_tenantId_productoSeguroId_idx" ON "insurance_polizas"("tenantId", "productoSeguroId");
CREATE INDEX "insurance_polizas_tenantId_aseguradoraId_idx" ON "insurance_polizas"("tenantId", "aseguradoraId");
CREATE INDEX "insurance_polizas_clienteId_idx" ON "insurance_polizas"("clienteId");
CREATE INDEX "insurance_renovaciones_tenantId_estado_idx" ON "insurance_renovaciones"("tenantId", "estado");
CREATE INDEX "insurance_renovaciones_tenantId_periodoInicio_idx" ON "insurance_renovaciones"("tenantId", "periodoInicio");
CREATE INDEX "insurance_renovaciones_polizaId_idx" ON "insurance_renovaciones"("polizaId");
CREATE INDEX "insurance_oportunidades_tenantId_estado_idx" ON "insurance_oportunidades"("tenantId", "estado");
CREATE INDEX "insurance_oportunidades_tenantId_clienteId_idx" ON "insurance_oportunidades"("tenantId", "clienteId");
CREATE INDEX "insurance_oportunidades_tenantId_origen_idx" ON "insurance_oportunidades"("tenantId", "origen");
CREATE INDEX "insurance_oportunidades_polizaOrigenId_idx" ON "insurance_oportunidades"("polizaOrigenId");
CREATE INDEX "insurance_import_logs_tenantId_idx" ON "insurance_import_logs"("tenantId");
CREATE INDEX "insurance_import_logs_createdAt_idx" ON "insurance_import_logs"("createdAt");

-- ─── Foreign Keys ──────────────────────────────────────────────────────────────
ALTER TABLE "insurance_aseguradoras" ADD CONSTRAINT "insurance_aseguradoras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "insurance_productos_seguro" ADD CONSTRAINT "insurance_productos_seguro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_productos_seguro" ADD CONSTRAINT "insurance_productos_seguro_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "insurance_aseguradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "insurance_polizas" ADD CONSTRAINT "insurance_polizas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_polizas" ADD CONSTRAINT "insurance_polizas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_polizas" ADD CONSTRAINT "insurance_polizas_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "insurance_aseguradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_polizas" ADD CONSTRAINT "insurance_polizas_productoSeguroId_fkey" FOREIGN KEY ("productoSeguroId") REFERENCES "insurance_productos_seguro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_polizas" ADD CONSTRAINT "insurance_polizas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "insurance_renovaciones" ADD CONSTRAINT "insurance_renovaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_renovaciones" ADD CONSTRAINT "insurance_renovaciones_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "insurance_polizas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_renovaciones" ADD CONSTRAINT "insurance_renovaciones_agenteAsignadoId_fkey" FOREIGN KEY ("agenteAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT "insurance_oportunidades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT "insurance_oportunidades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT "insurance_oportunidades_polizaOrigenId_fkey" FOREIGN KEY ("polizaOrigenId") REFERENCES "insurance_polizas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT "insurance_oportunidades_productoSugeridoId_fkey" FOREIGN KEY ("productoSugeridoId") REFERENCES "insurance_productos_seguro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT "insurance_oportunidades_agenteAsignadoId_fkey" FOREIGN KEY ("agenteAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "insurance_import_logs" ADD CONSTRAINT "insurance_import_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_import_logs" ADD CONSTRAINT "insurance_import_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
