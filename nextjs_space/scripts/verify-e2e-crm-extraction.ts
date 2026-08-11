/**
 * Verificación E2E del primer entrenamiento (módulo Ventas):
 * confirmar que los campos opcionales (cargo, teléfono, linkedin, ubicación)
 * se capturan del mensaje y quedan en la BD real del tenant dexpert.
 * Limpia todo al final.
 */
import { processMessage } from '../lib/chat/chatbot-service';
import { prisma } from '../lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const STAMP = Date.now();
const PREFIX = `e2e-${STAMP}`;
const EMAIL = `${PREFIX}-extrac@volkern.test`;

async function cleanup() {
  const d1 = await prisma.lead.deleteMany({ where: { tenantId: TENANT_ID, email: { contains: 'e2e-' } } });
  const d2 = await prisma.contact.deleteMany({ where: { tenantId: TENANT_ID, email: { contains: 'e2e-' } } });
  console.log(`🧹 Limpieza: leads=${d1.count} contactos=${d2.count}`);
}

async function run() {
  await cleanup();
  console.log('════ E2E extracción de campos (Ventas) ════');

  // Contacto con cargo, teléfono, linkedin y ubicación
  const res = await processMessage({
    tenantId: TENANT_ID,
    conversationId: `e2e:telegram:${STAMP}:extrac`,
    message: `agrega el contacto Elena Ruiz con email ${EMAIL}, cargo Directora de Ventas, teléfono +525512345678, linkedin elenaruiz, ubicación Ciudad de México, de la empresa Volkern Test`,
    channel: 'telegram',
    contactName: 'Tester',
    contactPhone: 'e2e-tester',
    metadata: { isTest: true },
  });
  console.log('success =', res.success, '| error =', res.error || '-');
  console.log('respuesta:', (res.response || '').slice(0, 180));

  const c = await prisma.contact.findFirst({ where: { tenantId: TENANT_ID, email: EMAIL } });
  if (c) {
    console.log('CREADO EN BD:');
    console.log('  nombre    =', JSON.stringify(c.nombre));
    console.log('  cargo     =', JSON.stringify(c.cargo));
    console.log('  telefono  =', JSON.stringify(c.telefono));
    console.log('  linkedin  =', JSON.stringify(c.linkedin));
    console.log('  ubicacion =', JSON.stringify(c.ubicacion));
    console.log('  empresa   =', JSON.stringify(c.empresa ?? c.companyId));
    const ok = c.cargo && c.telefono && c.linkedin && c.ubicacion && (c.ubicacion === 'Ciudad de México');
    console.log(ok ? '✅ TODOS LOS CAMPOS CAPTURADOS + UBICACIÓN CORRECTA' : '⚠️ FALTAN CAMPOS O UBICACIÓN INCORRECTA');
  } else {
    console.log('❌ CONTACTO NO CREADO');
  }

  await cleanup();
  console.log('════ FIN E2E ════');
}

run().catch(e => {
  console.error('ERROR FATAL:', e);
  cleanup().finally(() => process.exit(1));
});
