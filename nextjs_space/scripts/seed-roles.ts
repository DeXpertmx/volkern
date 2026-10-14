
/**
 * Script de seed para roles predefinidos de Volkern CRM
 * 
 * Este script crea los 5 roles predefinidos con sus permisos
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

const prisma = new PrismaClient();

// Definición de permisos por rol
const ROLE_PERMISSIONS = {
  Superadmin: {
    leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true },
    citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
    pipeline: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
    contactos: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
    empresas: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
    estudiantes: { ver: true, crear: true, editar: true, eliminar: true, inscribir: true, exportar: true },
    cursos: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true, gestionar: true },
    campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true, gestionar: true },
    mensajes: { ver: true, enviar: true, responder: true, gestionar: true },
    analytics: { ver: true, exportar: true, gestionar: true },
    configuracion: { ver: true, editar: true, gestionar: true },
    equipo: { ver: true, crear: true, editar: true, eliminar: true, invitar: true, gestionar: true },
    integraciones: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
    pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    whitelabel: { ver: true, editar: true, gestionar: true },
  },
  // El alcance del pipeline es una llave aparte (`leads.ver_todos`): Admin ve
  // todo el pipeline de la cuenta, y quien no la lleve verá solo sus leads
  // asignados —el caso de «Sales Agent» y «Support», que no la llevan—.
  Admin: {
    leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true, ver_todos: true },
    citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
    pipeline: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
    contactos: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
    empresas: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
    estudiantes: { ver: true, crear: true, editar: true, eliminar: true, inscribir: true, exportar: true },
    cursos: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true, gestionar: true },
    campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true, gestionar: true },
    mensajes: { ver: true, enviar: true, responder: true, gestionar: true },
    analytics: { ver: true, exportar: true, gestionar: true },
    configuracion: { ver: true, editar: true, gestionar: false },
    equipo: { ver: true, crear: true, editar: true, eliminar: true, invitar: true, gestionar: true },
    integraciones: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
    pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    whitelabel: { ver: true, editar: true, gestionar: false },
  },
  'Sales Agent': {
    leads: { ver: true, crear: true, editar: true, eliminar: false, asignar: false, exportar: false },
    citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
    pipeline: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
    contactos: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
    empresas: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
    estudiantes: { ver: false, crear: false, editar: false, eliminar: false, inscribir: false, exportar: false },
    cursos: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false, gestionar: false },
    campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false, gestionar: false },
    mensajes: { ver: true, enviar: true, responder: true, gestionar: false },
    analytics: { ver: true, exportar: false, gestionar: false },
    configuracion: { ver: false, editar: false, gestionar: false },
    equipo: { ver: false, crear: false, editar: false, eliminar: false, invitar: false, gestionar: false },
    integraciones: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
    pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    whitelabel: { ver: false, editar: false, gestionar: false },
  },
  Support: {
    leads: { ver: true, crear: false, editar: false, eliminar: false, asignar: false, exportar: false },
    citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
    pipeline: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false, exportar: false },
    contactos: { ver: true, crear: false, editar: false, eliminar: false, exportar: false },
    empresas: { ver: true, crear: false, editar: false, eliminar: false, exportar: false },
    estudiantes: { ver: true, crear: false, editar: true, eliminar: false, inscribir: false, exportar: false },
    cursos: { ver: true, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false, gestionar: false },
    campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false, gestionar: false },
    mensajes: { ver: true, enviar: true, responder: true, gestionar: false },
    analytics: { ver: true, exportar: false, gestionar: false },
    configuracion: { ver: false, editar: false, gestionar: false },
    equipo: { ver: true, crear: false, editar: false, eliminar: false, invitar: false, gestionar: false },
    integraciones: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
    pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    whitelabel: { ver: false, editar: false, gestionar: false },
  },
  Instructor: {
    leads: { ver: false, crear: false, editar: false, eliminar: false, asignar: false, exportar: false },
    citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
    pipeline: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false, exportar: false },
    contactos: { ver: false, crear: false, editar: false, eliminar: false, exportar: false },
    empresas: { ver: false, crear: false, editar: false, eliminar: false, exportar: false },
    estudiantes: { ver: true, crear: true, editar: true, eliminar: false, inscribir: true, exportar: true },
    cursos: { ver: true, crear: true, editar: true, eliminar: false, publicar: true, gestionar: true },
    automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false, gestionar: false },
    campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false, gestionar: false },
    mensajes: { ver: true, enviar: true, responder: true, gestionar: false },
    analytics: { ver: true, exportar: false, gestionar: false },
    configuracion: { ver: false, editar: false, gestionar: false },
    equipo: { ver: false, crear: false, editar: false, eliminar: false, invitar: false, gestionar: false },
    integraciones: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
    pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    whitelabel: { ver: false, editar: false, gestionar: false },
  },
};

const ROLE_DESCRIPTIONS = {
  Superadmin: 'Acceso total a todas las funcionalidades y configuración del sistema',
  Admin: 'Gestión completa del CRM, usuarios y configuración del tenant',
  'Sales Agent': 'Gestión de leads asignados, citas y pipeline de ventas',
  Support: 'Atención al cliente, consultas de estudiantes y soporte técnico',
  Instructor: 'Gestión de cursos, estudiantes y contenido educativo',
};

async function seedRoles() {
  console.log('🌱 Iniciando seed de roles predefinidos...\n');

  try {
    // Obtener todos los tenants
    const tenants = await prisma.tenant.findMany();

    if (tenants.length === 0) {
      console.log('⚠️  No hay tenants en la base de datos. Creando uno de prueba...');
      const testTenant = await prisma.tenant.create({
        data: {
          nombre: 'Volkern Demo',
          slug: 'volkern-demo',
          plan: 'profesional',
          estado: 'activo',
        },
      });
      tenants.push(testTenant);
      console.log('✅ Tenant de prueba creado\n');
    }

    let totalCreated = 0;
    let totalUpdated = 0;

    // Crear roles para cada tenant
    for (const tenant of tenants) {
      console.log(`📦 Procesando tenant: ${tenant.nombre}`);

      for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
        // Verificar si el rol ya existe
        const existingRole = await prisma.role.findFirst({
          where: {
            tenantId: tenant.id,
            nombre: roleName,
          },
        });

        if (existingRole) {
          // Actualizar permisos si cambió
          await prisma.role.update({
            where: { id: existingRole.id },
            data: {
              permisos: permissions,
              descripcion: ROLE_DESCRIPTIONS[roleName as keyof typeof ROLE_DESCRIPTIONS],
              fechaActualizacion: new Date(),
            },
          });
          totalUpdated++;
          console.log(`   ✓ ${roleName} actualizado`);
        } else {
          // Crear nuevo rol
          await prisma.role.create({
            data: {
              tenantId: tenant.id,
              nombre: roleName,
              descripcion: ROLE_DESCRIPTIONS[roleName as keyof typeof ROLE_DESCRIPTIONS],
              permisos: permissions,
              esPersonalizado: false,
              orden: Object.keys(ROLE_PERMISSIONS).indexOf(roleName),
            },
          });
          totalCreated++;
          console.log(`   ✓ ${roleName} creado`);
        }
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Seed completado exitosamente');
    console.log(`   • Roles creados: ${totalCreated}`);
    console.log(`   • Roles actualizados: ${totalUpdated}`);
    console.log(`   • Tenants procesados: ${tenants.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Error en el seed de roles:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el seed
seedRoles()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
