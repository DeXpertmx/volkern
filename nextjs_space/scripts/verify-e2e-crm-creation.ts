/**
 * Verificación E2E del primer entrenamiento de la IA (módulo Ventas):
 * crear lead / contacto / empresa vía el pipeline real de Telegram.
 *
 * Simula exactamente lo que hace el webhook: processMessage de chatbot-service
 * con channel='telegram' y metadata.isTest=true (omite horario laboral).
 * Verifica que el registro se crea en la BD real del tenant dexpert y lo
 * limpia al final. Las empresas son Contact con tipo='company'.
 */
import { processMessage } from '../lib/chat/chatbot-service';
import { prisma } from '../lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const STAMP = Date.now();
const PREFIX = `e2e-${STAMP}`;
const EMAILS = {
  lead: `${PREFIX}-lead@volkern.test`,
  contacto: `${PREFIX}-contacto@volkern.test`,
  empresa: `${PREFIX}-empresa@volkern.test`,
};

async function cleanup() {
  const d1 = await prisma.lead.deleteMany({ where: { tenantId: TENANT_ID, email: { contains: 'e2e-' } } });
  const d2 = await prisma.contact.deleteMany({ where: { tenantId: TENANT_ID, email: { contains: 'e2e-' } } });
  console.log(`🧹 Limpieza previa: leads=${d1.count} contactos=${d2.count}`);
}

async function run() {
  await cleanup();
  console.log('════════════ E2E: primer entrenamiento (Ventas) ════════════\n');

  // 1) LEAD
  const leadMsg = `agrega el lead Prueba E2E, ${EMAILS.lead}, de la empresa Volkern Test, teléfono +525511223344`;
  const leadRes = await processMessage({
    tenantId: TENANT_ID,
    conversationId: `e2e:telegram:${STAMP}:lead`,
    message: leadMsg,
    channel: 'telegram',
    contactName: 'Tester E2E',
    contactPhone: 'e2e-tester',
    metadata: { isTest: true },
  });
  console.log('【LEAD】 success =', leadRes.success, '| error =', leadRes.error || '-');
  console.log('【LEAD】 respuesta:', (leadRes.response || '').slice(0, 200));

  const lead = await prisma.lead.findFirst({ where: { tenantId: TENANT_ID, email: EMAILS.lead } });
  console.log('【LEAD】 creado en BD:', lead ? `✅ id=${lead.id} nombre=${lead.nombre} empresa=${lead.empresa}` : '❌ NO EXISTE');

  // 2) CONTACTO
  const contactMsg = `agrega el contacto Laura E2E con email ${EMAILS.contacto}, cargo Gerente, empresa Volkern Test`;
  const contactRes = await processMessage({
    tenantId: TENANT_ID,
    conversationId: `e2e:telegram:${STAMP}:contacto`,
    message: contactMsg,
    channel: 'telegram',
    contactName: 'Tester E2E',
    contactPhone: 'e2e-tester',
    metadata: { isTest: true },
  });
  console.log('\n【CONTACTO】 success =', contactRes.success, '| error =', contactRes.error || '-');
  console.log('【CONTACTO】 respuesta:', (contactRes.response || '').slice(0, 200));

  const contact = await prisma.contact.findFirst({ where: { tenantId: TENANT_ID, email: EMAILS.contacto } });
  console.log('【CONTACTO】 creado en BD:', contact ? `✅ id=${contact.id} nombre=${contact.nombre} cargo=${contact.cargo} tipo=${contact.tipo}` : '❌ NO EXISTE');

  // 3) EMPRESA (es un Contact con tipo='company')
  const companyMsg = `crea la empresa Volkern E2E S.A. con email ${EMAILS.empresa}, país México`;
  const companyRes = await processMessage({
    tenantId: TENANT_ID,
    conversationId: `e2e:telegram:${STAMP}:empresa`,
    message: companyMsg,
    channel: 'telegram',
    contactName: 'Tester E2E',
    contactPhone: 'e2e-tester',
    metadata: { isTest: true },
  });
  console.log('\n【EMPRESA】 success =', companyRes.success, '| error =', companyRes.error || '-');
  console.log('【EMPRESA】 respuesta:', (companyRes.response || '').slice(0, 200));

  const company = await prisma.contact.findFirst({ where: { tenantId: TENANT_ID, email: EMAILS.empresa } });
  console.log('【EMPRESA】 creada en BD:', company ? `✅ id=${company.id} nombre=${company.nombre} tipo=${company.tipo}` : '❌ NO EXISTE');

  // 4) FLUJO MULTI-TURNO: lead sin email → pregunta → responde con email
  console.log('\n────────────────── FLUJO MULTI-TURNO (lead sin email) ──────────────────');
  const convId = `e2e:telegram:${STAMP}:multiturn`;
  const step1 = await processMessage({
    tenantId: TENANT_ID,
    conversationId: convId,
    message: 'agrega el lead Multi Turno E2E',
    channel: 'telegram',
    contactName: 'Tester E2E',
    contactPhone: 'e2e-tester',
    metadata: { isTest: true },
  });
  console.log('Paso 1 success =', step1.success);
  console.log('Paso 1 respuesta:', (step1.response || '').slice(0, 200));

  const step2 = await processMessage({
    tenantId: TENANT_ID,
    conversationId: convId,
    message: `${PREFIX}-multi@volkern.test`, // responde el dato faltante
    channel: 'telegram',
    contactName: 'Tester E2E',
    contactPhone: 'e2e-tester',
    metadata: { isTest: true },
  });
  console.log('Paso 2 success =', step2.success);
  console.log('Paso 2 respuesta:', (step2.response || '').slice(0, 200));

  const multiLead = await prisma.lead.findFirst({ where: { tenantId: TENANT_ID, email: `${PREFIX}-multi@volkern.test` } });
  console.log('Lead multi-turno creado:', multiLead ? `✅ id=${multiLead.id} email=${multiLead.email}` : '❌ NO EXISTE');

  // ─── Limpieza final: borrar SOLO registros e2e ───
  console.log('\n────────────────── LIMPIEZA FINAL ──────────────────');
  await cleanup();
  console.log('✅ Registros E2E eliminados (solo queda el audit trail del chatbot)');
  console.log('\n════════════ FIN E2E ════════════');
}

run().catch(e => {
  console.error('ERROR FATAL E2E:', e);
  // Asegurar limpieza incluso si algo falla
  cleanup().finally(() => process.exit(1));
});
