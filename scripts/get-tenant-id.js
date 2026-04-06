/**
 * Script para obtener el tenantId de un usuario
 * Uso: node scripts/get-tenant-id.js <email>
 */

require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getTenantId() {
  const email = process.argv[2];

  if (!email) {
    console.error('❌ Error: Debes proporcionar un email');
    console.log('\nUso: node scripts/get-tenant-id.js <email>');
    console.log('Ejemplo: node scripts/get-tenant-id.js usuario@ejemplo.com\n');
    process.exit(1);
  }

  try {
    console.log('🔍 Buscando usuario con email:', email);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    if (!user) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }

    console.log('\n✅ Usuario encontrado:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Nombre:', user.name);
    console.log('Email:', user.email);
    console.log('\n🏢 Información del Tenant:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Tenant ID:', user.tenantId);
    console.log('Nombre:', user.tenant?.nombre || 'N/A');

    console.log('\n📋 Código de Embebido:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`<iframe`);
    console.log(`  src="https://volkern.app/embed/booking?tenantId=${user.tenantId}"`);
    console.log(`  width="100%"`);
    console.log(`  height="800"`);
    console.log(`  frameborder="0"`);
    console.log(`></iframe>`);
    console.log('\n✅ Copia el código de arriba y pégalo en tu sitio web\n');

    // Verificar servicios disponibles
    const servicios = await prisma.servicio.findMany({
      where: {
        tenantId: user.tenantId,
        activo: true
      },
      select: {
        id: true,
        nombre: true,
        duracionMinutos: true,
        precio: true
      }
    });

    console.log('📦 Servicios Activos:', servicios.length);
    if (servicios.length > 0) {
      servicios.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.nombre} (${s.duracionMinutos} min - $${s.precio})`);
      });
    } else {
      console.log('⚠️  No hay servicios activos. Crea servicios en el dashboard primero.');
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getTenantId();
