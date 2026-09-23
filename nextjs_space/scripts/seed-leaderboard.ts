import { prisma } from '../lib/db';

/**
 * Siembra del ranking de cerradores (C5) — ahora como CONCURSO mensual.
 *
 * Crea sesiones repartidas entre el mes ANTERIOR (para que la primera lectura
 * del ranking cierre esa edición y congele a su ganador) y el mes EN CURSO
 * (la edición que se está jugando), con ganadores distintos para que se vea
 * el reinicio: ganar un mes no posiciona para el siguiente.
 */
async function main() {
  console.log('📊 Poblando el concurso de cerradores...');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'volkern-default' } });
  if (!tenant) {
    console.error('❌ Tenant no encontrado.');
    return;
  }

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    take: 2,
  });

  const lead = await prisma.lead.findFirst({ where: { tenantId: tenant.id } });

  if (users.length === 0 || !lead) {
    console.error('❌ Faltan datos base (user o lead).');
    return;
  }

  const [ana, bruno] = users; // si solo hay un usuario, bruno === ana y el concurso lo lleva igual

  const ahora = new Date();
  const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 12, 10, 0, 0);
  const mesPasado2 = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 20, 10, 0, 0);
  const esteMes1 = new Date(ahora.getFullYear(), ahora.getMonth(), 3, 10, 0, 0);
  const esteMes2 = new Date(ahora.getFullYear(), ahora.getMonth(), 9, 10, 0, 0);

  const sesiones = [
    // Mes pasado: ganó ANA (media alta); con el reinicio no le posiciona este mes.
    { userId: ana.id, score: 95, tech: 'Cierre de Alternativa', cuando: mesPasado },
    { userId: ana.id, score: 90, tech: 'Venta Consultiva', cuando: mesPasado2 },
    { userId: bruno.id, score: 72, tech: 'Manejo de Objeciones', cuando: mesPasado2 },
    // Mes en curso: va ganando BRUNO — la edición nueva reparte de cero.
    { userId: bruno.id, score: 92, tech: 'Cierre Directo', cuando: esteMes1 },
    { userId: bruno.id, score: 88, tech: 'Prueba social', cuando: esteMes2 },
    { userId: ana.id, score: 78, tech: 'Cierre presuntivo', cuando: esteMes2 },
  ];

  for (const s of sesiones) {
    await prisma.trainingSession.create({
      data: {
        tenantId: tenant.id,
        userId: s.userId,
        leadId: lead.id,
        score: s.score,
        tecnicaDetectada: s.tech,
        argumentoMasFuerte: 'Explicación clara del ROI',
        puntoDeMejora: 'Ser más conciso al inicio',
        interacciones: 8,
        createdAt: s.cuando,
      },
    });
  }

  console.log(`✅ ${sesiones.length} sesiones creadas (mes pasado + en curso).`);
}

main().catch(e => { console.error(e); process.exit(1); });
