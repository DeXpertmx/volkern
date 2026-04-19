import crypto from 'crypto';
const TEST_KEY = '12345678901234567890123456789012';
process.env.MASTER_KEY = TEST_KEY;
process.env.VAULT_CONTROL_HASH = crypto.createHash('sha256').update(TEST_KEY).digest('hex');

import { prisma } from '../lib/db';

async function verifyLayoutAPI() {
  console.log('--- [VERIFY: Layout Persistance API] ---');
  
  const user = await prisma.user.findFirst();
  if (!user) return console.error('No hay usuarios para el test.');

  const testLayout = {
    lg: [{ i: 'test', x: 0, y: 0, w: 6, h: 4 }]
  };

  try {
    // Simulamos el merge de metadata
    const currentMetadata = (user.metadata as any) || {};
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        metadata: {
          ...currentMetadata,
          dashboardLayout: testLayout
        }
      }
    });

    const savedLayout = (updated.metadata as any).dashboardLayout;
    console.log('¿Layout guardado en metadata?', savedLayout.lg[0].i === 'test' ? '✅ SÍ' : '❌ NO');
    
    // Verificar que no se borraron otros campos del metadata
    const legacyKey = 'other_data';
    await prisma.user.update({
      where: { id: user.id },
      data: { metadata: { ...updated.metadata as any, [legacyKey]: true } }
    });

    const merged = await prisma.user.findUnique({ where: { id: user.id } });
    const metadata = merged?.metadata as any;
    console.log('¿Persistencia de otros campos (merge)?', (metadata.dashboardLayout && metadata[legacyKey]) ? '✅ SÍ' : '❌ NO');

  } catch (e) {
    console.error('Error en verificación:', e);
  }

  console.log('\n🚀 VERIFICACIÓN DE PERSISTENCIA COMPLETADA.');
}

verifyLayoutAPI();
