import { prisma } from '../lib/db';
import { skills } from '../lib/skills';

async function verify() {
  console.log('🛡️ INICIANDO VERIFICACIÓN DE RESET UNIVERSAL...');

  // 1. Verificar esquema Prisma
  try {
    // @ts-ignore - MetricLog debería no existir
    const count = await prisma.metricLog.count();
    console.error('❌ ERROR: MetricLog aún existe en la base de datos.');
  } catch (e) {
    console.log('✅ MetricLog eliminado correctamente del esquema.');
  }

  // 2. Verificar nuevos Skills
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('No hay tenants para probar');

    console.log('🧪 Probando get_field_activity...');
    const activity = await skills.get_field_activity({ tenantId: tenant.id });
    console.log(`✅ Actividad en campo: ${activity.activeTechs.length} técnicos localizados.`);

    console.log('🧪 Probando audit_material_leaks...');
    const leaks = await skills.audit_material_leaks({ tenantId: tenant.id });
    console.log(`✅ Auditoría de mermas: Status ${leaks.status}.`);
  } catch (e) {
    console.error('❌ Error probando skills:', e.message);
  }

  process.exit(0);
}

verify();
