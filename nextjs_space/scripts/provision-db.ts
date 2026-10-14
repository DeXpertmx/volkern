import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

const globalPrisma = new PrismaClient();

/**
 * Script de aprovisionamiento de Base de Datos para Tenant
 * 
 * Uso: npx tsx scripts/provision-db.ts <tenant_slug>
 */

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('❌ Error: Debes proporcionar el slug del tenant.');
    process.exit(1);
  }

  console.log(`🚀 Iniciando aprovisionamiento para tenant: ${slug}...`);

  // 1. Buscar tenant en DB Global
  const tenant = await globalPrisma.tenant.findUnique({
    where: { slug }
  });

  if (!tenant) {
    console.error(`❌ Error: Tenant con slug "${slug}" no encontrado en la base de datos global.`);
    process.exit(1);
  }

  const dbName = `volkern_tenant_${slug.replace(/-/g, '_')}`;
  const dbUser = 'dexpert';
  const dbPass = 'volkern2024';
  const dbHost = 'localhost';
  const dbPort = '5432';

  // URL para el tenant
  const tenantDbUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}?schema=public`;

  console.log(`\n1️⃣  Creando base de datos física: ${dbName}...`);
  
  // Conectar como superusuario para crear la DB
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL?.replace(/\/[^\/]+$/, '/postgres') // Conectar a 'postgres' base
  });

  try {
    await pgClient.connect();
    
    // Verificar si ya existe
    const res = await pgClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (res.rowCount === 0) {
      // PostgreSQL no permite parámetros en CREATE DATABASE, usamos string literal seguro
      await pgClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Base de datos ${dbName} creada exitosamente.`);
    } else {
      console.log(`ℹ️  La base de datos ${dbName} ya existe.`);
    }
  } catch (err) {
    console.error('❌ Error creando base de datos:', err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }

  console.log(`\n2️⃣  Actualizando registro del tenant en Control Plane...`);
  await globalPrisma.tenant.update({
    where: { id: tenant.id },
    data: { dbUrl: tenantDbUrl }
  });
  console.log(`✅ Registro actualizado con dbUrl.`);

  try {
    // Ejecutar prisma db push usando la nueva URL
    execSync(`DATABASE_URL="${tenantDbUrl}" npx prisma db push --accept-data-loss`, {
      stdio: 'inherit'
    });
    console.log(`✅ Esquema sincronizado correctamente.`);
  } catch (err) {
    console.error('❌ Error sincronizando esquema:', err);
    process.exit(1);
  }

  console.log(`\n4️⃣  Inicializando datos maestros en la nueva DB...`);
  const tenantPrisma = new PrismaClient({ datasources: { db: { url: tenantDbUrl } } });
  
  try {
    // Copiar el registro del tenant
    await tenantPrisma.tenant.upsert({
      where: { id: tenant.id },
      update: {},
      create: {
        id: tenant.id,
        nombre: tenant.nombre,
        slug: tenant.slug,
        plan: tenant.plan,
        estado: tenant.estado,
        moneda: tenant.moneda,
        mrr: tenant.mrr,
        dbUrl: tenantDbUrl
      }
    });
    console.log(`✅ Registro de tenant copiado a la DB local.`);
  } catch (err) {
    console.error('❌ Error inicializando datos maestros:', err);
  } finally {
    await tenantPrisma.$disconnect();
  }

  console.log(`\n✨ Aprovisionamiento completado para ${slug}!`);
  console.log(`🔗 URL: ${tenantDbUrl}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await globalPrisma.$disconnect();
  });
