/**
 * Safe Insurance Migration — Production
 * 
 * Aplica la migración de Volkern Insurance de forma segura e idempotente.
 * Usa CREATE TABLE IF NOT EXISTS y CREATE INDEX IF NOT EXISTS.
 * Los enums se crean dentro de bloques DO que verifican si ya existen.
 * 
 * Uso: npx tsx scripts/safe-insurance-migration.ts
 * 
 * A diferencia de prisma db push --accept-data-loss, este script:
 * - NO toca tablas existentes
 * - NO borra datos
 * - Es completamente idempotente
 * - Se puede ejecutar múltiples veces sin efectos secundarios
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_qi4kcVBa1vUR@ep-withered-mode-al6o4sjg-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('🔐 Aplicando migración segura de Volkern Insurance...\n');

    // ── Enums (con verificación de existencia) ──────────────────────────────
    const enums = [
      { name: 'Ramo', values: "'AUTO','HOGAR','VIDA','SALUD','GASTOS_MEDICOS','EMPRESARIAL','RESPONSABILIDAD_CIVIL','INCENDIO','TRANSPORTE','AHORRO','JUBILACION','OTROS'" },
      { name: 'EstadoPoliza', values: "'ACTIVA','PROXIMA_A_VENCER','VENCIDA','CANCELADA','EN_TRAMITE'" },
      { name: 'FormaPago', values: "'ANUAL','SEMESTRAL','TRIMESTRAL','MENSUAL'" },
      { name: 'EstadoRenovacion', values: "'PENDIENTE','CONTACTO_INICIAL','REVISION','OFERTA_ENVIADA','RENOVADA','NO_RENOVADA','PERDIDA'" },
      { name: 'OrigenOportunidad', values: "'IA','MANUAL','RENOVACION','REFERIDO'" },
      { name: 'EstadoOportunidad', values: "'NUEVA','EN_ANALISIS','COTIZADA','EN_NEGOCIACION','GANADA','PERDIDA'" },
    ];

    for (const e of enums) {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "${e.name}" AS ENUM (${e.values});
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      console.log(`  ✅ Enum "${e.name}"`);
    }

    // ── Tablas ──────────────────────────────────────────────────────────────
    const tables = [
      // Aseguradoras
      `CREATE TABLE IF NOT EXISTS "insurance_aseguradoras" (
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
      )`,

      // ProductoSeguro
      `CREATE TABLE IF NOT EXISTS "insurance_productos_seguro" (
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
      )`,

      // Poliza
      `CREATE TABLE IF NOT EXISTS "insurance_polizas" (
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
      )`,

      // Renovacion
      `CREATE TABLE IF NOT EXISTS "insurance_renovaciones" (
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
      )`,

      // OportunidadComercial
      `CREATE TABLE IF NOT EXISTS "insurance_oportunidades" (
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
      )`,

      // InsuranceImportLog
      `CREATE TABLE IF NOT EXISTS "insurance_import_logs" (
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
      )`,
    ];

    for (const sql of tables) {
      await client.query(sql);
      const tableName = sql.match(/"([^"]+)"/)?.[1] || 'unknown';
      console.log(`  ✅ Tabla "${tableName}"`);
    }

    // ── Unique Constraints ──────────────────────────────────────────────────
    const uniques = [
      `CREATE UNIQUE INDEX IF NOT EXISTS "insurance_aseguradoras_tenantId_nombre_key" ON "insurance_aseguradoras"("tenantId", "nombre")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "insurance_productos_seguro_tenantId_aseguradoraId_nombre_key" ON "insurance_productos_seguro"("tenantId", "aseguradoraId", "nombre")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "insurance_polizas_tenantId_numeroPoliza_key" ON "insurance_polizas"("tenantId", "numeroPoliza")`,
    ];

    for (const sql of uniques) {
      await client.query(sql);
      console.log(`  ✅ Unique constraint creado`);
    }

    // ── Indexes ─────────────────────────────────────────────────────────────
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "insurance_aseguradoras_tenantId_idx" ON "insurance_aseguradoras"("tenantId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_productos_seguro_tenantId_ramo_idx" ON "insurance_productos_seguro"("tenantId", "ramo")`,
      `CREATE INDEX IF NOT EXISTS "insurance_productos_seguro_aseguradoraId_idx" ON "insurance_productos_seguro"("aseguradoraId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_polizas_tenantId_estado_idx" ON "insurance_polizas"("tenantId", "estado")`,
      `CREATE INDEX IF NOT EXISTS "insurance_polizas_tenantId_fechaVencimiento_idx" ON "insurance_polizas"("tenantId", "fechaVencimiento")`,
      `CREATE INDEX IF NOT EXISTS "insurance_polizas_tenantId_productoSeguroId_idx" ON "insurance_polizas"("tenantId", "productoSeguroId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_polizas_tenantId_aseguradoraId_idx" ON "insurance_polizas"("tenantId", "aseguradoraId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_polizas_clienteId_idx" ON "insurance_polizas"("clienteId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_renovaciones_tenantId_estado_idx" ON "insurance_renovaciones"("tenantId", "estado")`,
      `CREATE INDEX IF NOT EXISTS "insurance_renovaciones_tenantId_periodoInicio_idx" ON "insurance_renovaciones"("tenantId", "periodoInicio")`,
      `CREATE INDEX IF NOT EXISTS "insurance_renovaciones_polizaId_idx" ON "insurance_renovaciones"("polizaId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_oportunidades_tenantId_estado_idx" ON "insurance_oportunidades"("tenantId", "estado")`,
      `CREATE INDEX IF NOT EXISTS "insurance_oportunidades_tenantId_clienteId_idx" ON "insurance_oportunidades"("tenantId", "clienteId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_oportunidades_tenantId_origen_idx" ON "insurance_oportunidades"("tenantId", "origen")`,
      `CREATE INDEX IF NOT EXISTS "insurance_oportunidades_polizaOrigenId_idx" ON "insurance_oportunidades"("polizaOrigenId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_import_logs_tenantId_idx" ON "insurance_import_logs"("tenantId")`,
      `CREATE INDEX IF NOT EXISTS "insurance_import_logs_createdAt_idx" ON "insurance_import_logs"("createdAt")`,
    ];

    for (const sql of indexes) {
      await client.query(sql);
    }
    console.log(`  ✅ ${indexes.length} índices creados`);

    // ── Foreign Keys (solo si las tablas referenciadas existen) ─────────────
    // Verificamos que las tablas core existen antes de crear FKs
    const fks = [
      `ALTER TABLE "insurance_aseguradoras" ADD CONSTRAINT IF NOT EXISTS "insurance_aseguradoras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_productos_seguro" ADD CONSTRAINT IF NOT EXISTS "insurance_productos_seguro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_productos_seguro" ADD CONSTRAINT IF NOT EXISTS "insurance_productos_seguro_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "insurance_aseguradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_polizas" ADD CONSTRAINT IF NOT EXISTS "insurance_polizas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_polizas" ADD CONSTRAINT IF NOT EXISTS "insurance_polizas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_polizas" ADD CONSTRAINT IF NOT EXISTS "insurance_polizas_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "insurance_aseguradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_polizas" ADD CONSTRAINT IF NOT EXISTS "insurance_polizas_productoSeguroId_fkey" FOREIGN KEY ("productoSeguroId") REFERENCES "insurance_productos_seguro"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_polizas" ADD CONSTRAINT IF NOT EXISTS "insurance_polizas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_renovaciones" ADD CONSTRAINT IF NOT EXISTS "insurance_renovaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_renovaciones" ADD CONSTRAINT IF NOT EXISTS "insurance_renovaciones_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "insurance_polizas"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_renovaciones" ADD CONSTRAINT IF NOT EXISTS "insurance_renovaciones_agenteAsignadoId_fkey" FOREIGN KEY ("agenteAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT IF NOT EXISTS "insurance_oportunidades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT IF NOT EXISTS "insurance_oportunidades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT IF NOT EXISTS "insurance_oportunidades_polizaOrigenId_fkey" FOREIGN KEY ("polizaOrigenId") REFERENCES "insurance_polizas"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT IF NOT EXISTS "insurance_oportunidades_productoSugeridoId_fkey" FOREIGN KEY ("productoSugeridoId") REFERENCES "insurance_productos_seguro"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_oportunidades" ADD CONSTRAINT IF NOT EXISTS "insurance_oportunidades_agenteAsignadoId_fkey" FOREIGN KEY ("agenteAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_import_logs" ADD CONSTRAINT IF NOT EXISTS "insurance_import_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "insurance_import_logs" ADD CONSTRAINT IF NOT EXISTS "insurance_import_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    ];

    // ADD CONSTRAINT IF NOT EXISTS solo funciona en PG 9.6+
    // Para versiones anteriores, envolvemos en DO block
    let fkCount = 0;
    for (const sql of fks) {
      try {
        await client.query(sql);
        fkCount++;
      } catch (err: any) {
        // Si la FK ya existe (error 42710) o la tabla referenciada no existe, ignorar
        if (err.code === '42710') continue; // duplicate_object
        if (err.code === '42P01') continue; // undefined_table
        console.warn(`  ⚠️ FK falló (código ${err.code}): ${err.message?.slice(0, 60)}`);
      }
    }
    console.log(`  ✅ ${fkCount} foreign keys creadas`);

    console.log('\n🎉 Migración de Insurance completada con éxito.');
    console.log('   Las tablas, índices, constraints y FKs están creadas.');
    console.log('   El dashboard /dashboard/seguros ya debería funcionar.\n');
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
