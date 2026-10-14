
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: ['.env.local', '.env'] });

const prisma = new PrismaClient();

/**
 * Script de migración para configurar multi-tenancy
 * 
 * Este script:
 * 1. Crea un tenant predeterminado
 * 2. Crea los roles predefinidos con sus permisos
 * 3. Actualiza los registros existentes para usar el tenant y rol predeterminados
 */

// Definición de permisos por rol
const ROLE_PERMISSIONS = {
  Superadmin: {
    leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true },
    citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
    estudiantes: { ver: true, crear: true, editar: true, eliminar: true, inscribir: true },
    cursos: { ver: true, crear: true, editar: true, eliminar: true, publicar: true },
    automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true },
    campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true },
    mensajes: { ver: true, enviar: true, responder: true },
    analytics: { ver: true, exportar: true },
    configuracion: { ver: true, editar: true },
    equipo: { ver: true, invitar: true, editar: true, eliminar: true },
    whitelabel: { ver: true, editar: true },
    pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true },
  },
  Admin: {
    // `leads.ver_todos` es el alcance del pipeline: sin ella solo se ven los
    // leads asignados a uno mismo («Sales Agent» y «Support» no la llevan).
    leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true, ver_todos: true },
    citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
    estudiantes: { ver: true, crear: true, editar: true, eliminar: true, inscribir: true },
    cursos: { ver: true, crear: true, editar: true, eliminar: true, publicar: true },
    automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true },
    campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true },
    mensajes: { ver: true, enviar: true, responder: true },
    analytics: { ver: true, exportar: true },
    configuracion: { ver: true, editar: true },
    equipo: { ver: true, invitar: true, editar: true, eliminar: false },
    whitelabel: { ver: true, editar: false },
    pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true },
  },
  'Sales Agent': {
    leads: { ver: true, crear: true, editar: true, eliminar: false, asignar: false, exportar: false },
    citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: true },
    estudiantes: { ver: false, crear: false, editar: false, eliminar: false, inscribir: false },
    cursos: { ver: false, crear: false, editar: false, eliminar: false, publicar: false },
    automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false },
    campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false },
    mensajes: { ver: true, enviar: true, responder: true },
    analytics: { ver: true, exportar: false },
    configuracion: { ver: false, editar: false },
    equipo: { ver: false, invitar: false, editar: false, eliminar: false },
    whitelabel: { ver: false, editar: false },
    pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false },
  },
  Support: {
    leads: { ver: true, crear: false, editar: true, eliminar: false, asignar: false, exportar: false },
    citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: true },
    estudiantes: { ver: true, crear: false, editar: true, eliminar: false, inscribir: false },
    cursos: { ver: true, crear: false, editar: false, eliminar: false, publicar: false },
    automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false },
    campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false },
    mensajes: { ver: true, enviar: true, responder: true },
    analytics: { ver: true, exportar: false },
    configuracion: { ver: false, editar: false },
    equipo: { ver: false, invitar: false, editar: false, eliminar: false },
    whitelabel: { ver: false, editar: false },
    pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false },
  },
  Instructor: {
    leads: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false },
    citas: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
    estudiantes: { ver: true, crear: false, editar: true, eliminar: false, inscribir: false },
    cursos: { ver: true, crear: true, editar: true, eliminar: false, publicar: false },
    automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false },
    campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false },
    mensajes: { ver: true, enviar: true, responder: true },
    analytics: { ver: true, exportar: false },
    configuracion: { ver: false, editar: false },
    equipo: { ver: false, invitar: false, editar: false, eliminar: false },
    whitelabel: { ver: false, editar: false },
    pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false },
  },
};

async function main() {
  console.log('🚀 Iniciando migración multi-tenancy...');

  // 1. Crear tenant predeterminado
  console.log('\n1️⃣  Creando tenant predeterminado...');
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'volkern-default' },
    update: {},
    create: {
      nombre: 'Volkern CRM',
      slug: 'volkern-default',
      plan: 'profesional',
      estado: 'activo',
      configuracion: {
        idioma: 'es',
        moneda: 'MXN',
        zona_horaria: 'America/Mexico_City',
      },
      limites: {
        usuarios: 100,
        leads: 10000,
        cursos: 50,
        estudiantes: 5000,
      },
    },
  });
  console.log(`✅ Tenant creado: ${defaultTenant.id}`);

  // 2. Crear roles predefinidos
  console.log('\n2️⃣  Creando roles predefinidos...');
  const roles: Record<string, any> = {};
  
  for (const [roleName, permisos] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: {
        tenantId_nombre: {
          tenantId: defaultTenant.id,
          nombre: roleName,
        },
      },
      update: {
        permisos: permisos as any,
      },
      create: {
        tenantId: defaultTenant.id,
        nombre: roleName,
        descripcion: `Rol predefinido: ${roleName}`,
        permisos: permisos as any,
        esPersonalizado: false,
        orden: Object.keys(ROLE_PERMISSIONS).indexOf(roleName),
      },
    });
    roles[roleName] = role;
    console.log(`✅ Rol creado: ${roleName} (${role.id})`);
  }

  // 3. Actualizar usuarios existentes
  console.log('\n3️⃣  Actualizando usuarios existentes...');
  const users = await prisma.user.findMany({
    where: { tenantId: null },
  });

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tenantId: defaultTenant.id,
        roleId: roles.Admin.id, // Asignar rol Admin a usuarios existentes
      },
    });
  }
  console.log(`✅ ${users.length} usuarios actualizados`);

  // 4. Actualizar leads existentes
  console.log('\n4️⃣  Actualizando leads existentes...');
  const leadsCount = await prisma.lead.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${leadsCount.count} leads actualizados`);

  // 5. Actualizar citas existentes
  console.log('\n5️⃣  Actualizando citas existentes...');
  const citasCount = await prisma.cita.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${citasCount.count} citas actualizadas`);

  // 6. Actualizar servicios existentes
  console.log('\n6️⃣  Actualizando servicios existentes...');
  const serviciosCount = await prisma.servicio.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${serviciosCount.count} servicios actualizados`);

  // 7. Actualizar cursos existentes
  console.log('\n7️⃣  Actualizando cursos existentes...');
  const cursosCount = await prisma.curso.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${cursosCount.count} cursos actualizados`);

  // 8. Actualizar estudiantes existentes
  console.log('\n8️⃣  Actualizando estudiantes existentes...');
  const estudiantesCount = await prisma.estudiante.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${estudiantesCount.count} estudiantes actualizados`);

  // 9. Actualizar conversaciones existentes
  console.log('\n9️⃣  Actualizando conversaciones existentes...');
  const conversacionesCount = await prisma.conversation.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${conversacionesCount.count} conversaciones actualizadas`);

  // 10. Actualizar automations existentes
  console.log('\n🔟 Actualizando automations existentes...');
  const automationsCount = await prisma.automation.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${automationsCount.count} automations actualizadas`);

  // 11. Actualizar campaigns existentes
  console.log('\n1️⃣1️⃣  Actualizando campaigns existentes...');
  const campaignsCount = await prisma.campaign.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${campaignsCount.count} campaigns actualizadas`);

  // 12. Actualizar tasks existentes
  console.log('\n1️⃣2️⃣  Actualizando tasks existentes...');
  const tasksCount = await prisma.task.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${tasksCount.count} tasks actualizadas`);

  // 13. Actualizar pages existentes
  console.log('\n1️⃣3️⃣  Actualizando pages existentes...');
  const pagesCount = await prisma.page.updateMany({
    where: { tenantId: null },
    data: { tenantId: defaultTenant.id },
  });
  console.log(`✅ ${pagesCount.count} pages actualizadas`);

  console.log('\n✨ Migración completada exitosamente!');
  console.log(`\nTenant ID: ${defaultTenant.id}`);
  console.log('Roles creados:', Object.keys(roles).join(', '));
}

main()
  .catch((e) => {
    console.error('❌ Error durante la migración:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
