import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const t = await p.tenant.findUnique({ where: { slug: 'demo-real-estate' } });
  if (!t) {
    console.log('TENANT NOT FOUND');
    return;
  }

  const [users, roles, props, fields, pipelines, stages, leads, contacts, deals, citas, tasks, notes, inters] =
    await Promise.all([
      p.user.count({ where: { tenantId: t.id } }),
      p.role.count({ where: { tenantId: t.id } }),
      p.catalogoItem.count({ where: { tenantId: t.id, tipo: 'inmueble' } }),
      p.catalogoFieldDefinition.count({ where: { tenantId: t.id } }),
      p.pipeline.count({ where: { tenantId: t.id } }),
      p.pipelineStage.count({ where: { tenantId: t.id } }),
      p.lead.count({ where: { tenantId: t.id } }),
      p.contact.count({ where: { tenantId: t.id } }),
      p.deal.count({ where: { tenantId: t.id } }),
      p.cita.count({ where: { tenantId: t.id } }),
      p.task.count({ where: { tenantId: t.id } }),
      p.note.count({ where: { leadId: { startsWith: 'lead-dre' } } }),
      p.interaction.count({ where: { leadId: { startsWith: 'lead-dre' } } }),
    ]);

  const vacacional = await p.catalogoItem.count({
    where: {
      tenantId: t.id,
      tipo: 'inmueble',
      customFieldValues: { path: ['tipo_operacion'], equals: 'alquiler_temporada' },
    },
  });

  console.log(JSON.stringify({
    tenant: t.nombre,
    slug: t.slug,
    users, roles,
    propiedades: props,
    propiedadesVacacionales: vacacional,
    campos: fields,
    pipelines, etapas: stages,
    leads, contactos: contacts,
    deals, citas, tareas: tasks,
    notas: notes, interacciones: inters,
  }, null, 2));

  const us = await p.user.findMany({
    where: { tenantId: t.id },
    select: { email: true, estado: true, role: { select: { nombre: true } } },
  });
  console.log('usuarios:', JSON.stringify(us));

  const propsList = await p.catalogoItem.findMany({
    where: { tenantId: t.id, tipo: 'inmueble' },
    select: { nombre: true, destacado: true },
    take: 12,
  });
  console.log('propiedades:');
  for (const pr of propsList) console.log('  -', pr.nombre, pr.destacado ? '(destacada)' : '');

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
