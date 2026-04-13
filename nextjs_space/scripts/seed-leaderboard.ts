import { prisma } from '../lib/db';

async function main() {
  console.log('📊 Poblando ranking de mejores cerradores...');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'volkern-default' } });
  if (!tenant) {
    console.error('❌ Tenant no encontrado.');
    return;
  }

  const adminRole = await prisma.role.findFirst({
    where: { nombre: 'Admin', tenantId: tenant.id }
  });

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, roleId: adminRole?.id }
  });

  const lead = await prisma.lead.findFirst();

  if (!user || !lead) {
    console.error('❌ Faltan datos base (user o lead).');
    return;
  }

  const sessions = [
    { score: 95, tech: 'Cierre de Alternativa' },
    { score: 88, tech: 'Venta Consultiva' },
    { score: 75, tech: 'Manejo de Objeciones' },
    { score: 92, tech: 'Cierre Directo' },
  ];

  for (const s of sessions) {
    await prisma.trainingSession.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        leadId: lead.id,
        score: s.score,
        tecnicaDetectada: s.tech,
        argumentoMasFuerte: 'Explicación clara del ROI',
        puntoDeMejora: 'Ser más conciso al inicio',
        interacciones: 8
      }
    });
  }

  console.log('✅ Sesiones de entrenamiento creadas.');
}

main().catch(e => { console.error(e); process.exit(1); });
