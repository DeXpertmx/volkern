import { prisma } from '../lib/db';
import { skills } from '../lib/skills';

/**
 * Script de prueba para las nuevas capacidades de proactividad.
 * Genera "Success Paths" para los leads existentes en el tenant predeterminado.
 */
async function main() {
  console.log('🧪 Iniciando prueba de proactividad...');

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('❌ No se encontró ningún tenant. Ejecuta primeiro el seed.');
    return;
  }

  console.log(`🏠 Tenant detectado: ${tenant.nombre} (${tenant.id})`);

  const leads = await prisma.lead.findMany({
    take: 10
  });

  console.log(`👥 Procesando ${leads.length} leads...`);

  for (const lead of leads) {
    console.log(`🔍 Generando estrategia para: ${lead.nombre}`);
    try {
      const result = await skills.generate_success_path({ leadId: lead.id, tenantId: tenant.id });
      console.log(`✅ Éxito: ${result.metadata.reasoning.substring(0, 50)}...`);
    } catch (err) {
      console.error(`❌ Error en lead ${lead.id}:`, err);
    }
  }

  console.log('\n✨ Prueba completada. Ahora puedes ver las sugerencias en el Dashboard de Leads.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
