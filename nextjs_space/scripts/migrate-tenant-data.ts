import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { getTenantDb, globalPrisma } from '../lib/db';

dotenv.config();

/**
 * Script de migración de datos para un tenant específico
 * Mueve datos de la DB Global a la DB dedicada del tenant.
 * 
 * Uso: npx tsx scripts/migrate-tenant-data.ts <tenant_slug>
 */

// Lista de modelos ordenados por dependencia para evitar errores de FK
// Los modelos superiores se migran primero.
const MODELS_TO_MIGRATE = [
  'role',
  'user',
  'lead',
  'contact',
  'servicio',
  'configuracion',
  'page',
  'pageComponent',
  'audience',
  'automation',
  'catalogoItem',
  'catalogoFieldDefinition',
  'curso',
  'modulo',
  'leccion',
  'quiz',
  'pregunta',
  'cita',
  'deal',
  'task',
  'interaction',
  'note',
  'auditLog',
  'n8nWorkflow',
  'subscription',
  'chatbotConfig',
  'channel',
] as const;

async function migrateModel(src: any, dst: any, modelName: string, tenantId: string) {
  console.log(`⏳ Migrando modelo ${modelName}...`);
  
  try {
    // 1. Obtener registros del origen
    const records = await (src as any)[modelName].findMany({
      where: { tenantId }
    });

    if (records.length === 0) {
      console.log(`   Ø No se encontraron registros para ${modelName}.`);
      return;
    }

    // 2. Insertar en el destino
    // Nota: Usamos create en un loop o createMany si no hay relaciones complejas que Prisma valide.
    // Usamos connectOrCreate o simplemente create. Para rapidez, intentaremos createMany
    // si el modelo lo permite (Prisma v3+ lo permite).
    
    // Filtramos campos que podrían causar problemas si se re-inyectan directamente
    // (aunque en general queremos clonar el estado exacto)
    
    let count = 0;
    for (const record of records) {
      try {
        await (dst as any)[modelName].upsert({
          where: { id: record.id },
          update: record,
          create: record
        });
        count++;
      } catch (err: any) {
        if (err.code === 'P2002') {
          // Ya existe, ignorar o actualizar (upsert ya lo maneja)
        } else {
          console.warn(`   ⚠️ Error en registro ${record.id} de ${modelName}:`, err.message);
        }
      }
    }

    console.log(`   ✅ Migrados ${count}/${records.length} registros de ${modelName}.`);
  } catch (error: any) {
    console.error(`   ❌ Error migrando modelo ${modelName}:`, error.message);
  }
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('❌ Error: Debes proporcionar el slug del tenant.');
    process.exit(1);
  }

  const tenant = await globalPrisma.tenant.findUnique({
    where: { slug }
  });

  if (!tenant || !tenant.dbUrl) {
    console.error(`❌ Error: Tenant "${slug}" no encontrado o no tiene DB dedicada configurada.`);
    process.exit(1);
  }

  console.log(`🚀 Iniciando migración de datos para ${tenant.nombre} (${slug})...`);
  console.log(`📂 Destino: ${tenant.dbUrl}\n`);

  const tenantDb = await getTenantDb(tenant.id);

  // Ejecutamos la migración en orden de dependencia
  for (const model of MODELS_TO_MIGRATE) {
    await migrateModel(globalPrisma, tenantDb, model, tenant.id);
  }

  console.log(`\n✨ Migración finalizada para ${slug}.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await globalPrisma.$disconnect();
  });
