import { prisma } from '../lib/db';
import { generatePostMortem } from '../lib/skills/training-skills';

/**
 * Script para probar las notificaciones de Record Personal.
 */
async function main() {
  console.log('🏆 Probando sistema de records personales...');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'volkern-default' } });
  const user = await prisma.user.findFirst({ where: { email: 'admin@volkern.com' } });
  const lead = await prisma.lead.findFirst();

  if (!tenant || !user || !lead) {
    console.error('❌ Faltan datos base.');
    return;
  }

  // 1. Crear una sesión inicial con score bajo (ej: 50)
  console.log('📉 Creando sesión base de 50%...');
  await prisma.trainingSession.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      leadId: lead.id,
      score: 50,
      interacciones: 3
    }
  });

  // 2. Ejecutar PostMortem que debería dar un score alto (ej: >50) para romper record
  console.log('🚀 Ejecutando Post-Mortem para romper record...');
  const history = [
    { role: 'agent', content: 'Hola María, entiendo que te preocupa la migración de datos.' },
    { role: 'customer', content: 'Sí, es muy complejo.' },
    { role: 'agent', content: 'En Volkern tenemos una solución automatizada que garantiza integridad total.' },
    { role: 'customer', content: '¿Y el precio?' },
    { role: 'agent', content: 'El valor que obtienes en ahorro de tiempo justifica la inversión inicial, y además podemos ofrecerte una consultoría de bienvenida.' },
    { role: 'agent', content: '¿Te parece si procedemos con la configuración inicial?' },
  ] as any;

  const result = await generatePostMortem(lead.id, tenant.id, user.id, history);
  console.log(`✅ Resultado Post-Mortem: ${result.puntuacion_cierre}%`);

  // 3. Verificar si se creó la notificación
  const notification = await prisma.inAppNotification.findFirst({
    where: { userId: user.id, title: { contains: 'Nuevo Record' } },
    orderBy: { createdAt: 'desc' }
  });

  if (notification) {
    console.log('🎉 ¡ÉXITO! Notificación de record detectada:', notification.body);
  } else {
    console.log('❌ No se generó la notificación de record.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
