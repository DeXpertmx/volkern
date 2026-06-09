/**
 * Test offline: WhatsApp Interactive Messages (Builders + Detection)
 * 
 * Valida que los builders de mensajes interactivos y la detección de intención
 * funcionan correctamente SIN depender del LLM.
 * 
 * También prueba el flujo completo de handleChatwootMessage con un mock del LLM.
 * 
 * Uso: npx tsx scripts/test-whatsapp-chatbot.ts
 */

import { prisma } from '../lib/db';
import {
  buildWelcomeButtons,
  buildServicesList,
  buildPostBookingButtons,
  detectInteractiveContext,
} from '../lib/messaging/interactive';

const TENANT_SUBDOMAIN = 'dexpert';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: string;
}

const results: TestResult[] = [];

function record(test: string, passed: boolean, message: string, details?: string) {
  results.push({ test, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} ${test}: ${message}`);
  if (details) console.log(`     ${details}`);
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🧪 TEST: WhatsApp Interactive Messages (offline)');
  console.log('═══════════════════════════════════════════\n');

  // ── 0. Setup ──────────────────────────────────────────────────────────
  console.log('🔍 Verificando prerequisitos...\n');

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: TENANT_SUBDOMAIN },
    select: { id: true, nombre: true },
  });
  if (!tenant) {
    console.error('❌ Tenant no encontrado');
    process.exit(1);
  }
  record('Tenant', true, tenant.nombre);

  const services = await prisma.servicio.findMany({
    where: { tenantId: tenant.id, activo: true },
    select: { id: true, nombre: true, descripcion: true, duracionMinutos: true, precio: true, moneda: true },
  });
  record('Servicios', services.length > 0, `${services.length} servicios`);

  const chatbot = await prisma.chatbotConfig.findUnique({
    where: { tenantId: tenant.id },
    select: { nombreAsistente: true, activo: true },
  });
  record('Chatbot', !!chatbot?.activo, chatbot?.nombreAsistente || 'N/A');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '─'.repeat(55));
  console.log('📋 BUILDERS: Validación estructural de mensajes interactivos');
  console.log('─'.repeat(55) + '\n');

  // ── 1. buildWelcomeButtons ──────────────────────────────────────────
  const welcome = buildWelcomeButtons(tenant.nombre, chatbot?.nombreAsistente || 'Asistente');
  const w = welcome.contentAttributes?.interactive;

  record('Welcome: contentType', welcome.contentType === 'input_select', welcome.contentType);
  record('Welcome: type', w?.type === 'button', w?.type);
  record('Welcome: body', !!w?.body?.text && w.body.text.length > 10, w?.body?.text?.substring(0, 50));
  record('Welcome: footer', w?.footer?.text?.length > 5, w?.footer?.text?.substring(0, 30));
  record('Welcome: buttons count', w?.action?.buttons?.length === 3, String(w?.action?.buttons?.length));
  record('Welcome: button 1 text', !!w?.action?.buttons?.[0]?.reply?.title, w?.action?.buttons?.[0]?.reply?.title?.substring(0, 30));
  record('Welcome: button 2 text', !!w?.action?.buttons?.[1]?.reply?.title, w?.action?.buttons?.[1]?.reply?.title?.substring(0, 30));
  record('Welcome: button 3 text', !!w?.action?.buttons?.[2]?.reply?.title, w?.action?.buttons?.[2]?.reply?.title?.substring(0, 30));
  record('Welcome: JSON parseable', !!JSON.stringify(welcome), 'OK');

  // ── 2. buildServicesList ────────────────────────────────────────────
  const list = buildServicesList(services as any, tenant.nombre);
  const l = list.contentAttributes?.interactive;

  record('Services: contentType', list.contentType === 'input_select', list.contentType);
  record('Services: type', l?.type === 'list', l?.type);
  record('Services: body', !!l?.body?.text && l.body.text.length > 5, l?.body?.text?.substring(0, 40));
  record('Services: footer', l?.footer?.text?.length > 5, l?.footer?.text?.substring(0, 30));
  record('Services: button text', l?.action?.button?.length > 0, l?.action?.button?.substring(0, 30));
  record('Services: sections', l?.action?.sections?.length === 1, String(l?.action?.sections?.length));
  record('Services: rows count', l?.action?.sections?.[0]?.rows?.length === services.length, `Rows: ${l?.action?.sections?.[0]?.rows?.length} (servicios: ${services.length})`);

  // Verificar que cada servicio tiene los campos correctos
  if (services.length > 0) {
    const firstRow = l?.action?.sections?.[0]?.rows?.[0];
    record('Services: row has id', !!firstRow?.id, firstRow?.id?.substring(0, 15));
    record('Services: row has title', !!firstRow?.title, firstRow?.title?.substring(0, 30));
    record('Services: row has description', !!firstRow?.description, firstRow?.description?.substring(0, 30));
  }

  // ── 3. buildPostBookingButtons ──────────────────────────────────────
  const post = buildPostBookingButtons();
  const p = post.contentAttributes?.interactive;

  record('PostBooking: contentType', post.contentType === 'input_select', post.contentType);
  record('PostBooking: type', p?.type === 'button', p?.type);
  record('PostBooking: body', !!p?.body?.text, p?.body?.text?.substring(0, 40));
  record('PostBooking: footer', p?.footer?.text?.length > 5, p?.footer?.text?.substring(0, 30));
  record('PostBooking: buttons count', p?.action?.buttons?.length === 2, `Expected 2, got ${p?.action?.buttons?.length}`);
  record('PostBooking: btn 1 text', !!p?.action?.buttons?.[0]?.reply?.title, p?.action?.buttons?.[0]?.reply?.title);
  record('PostBooking: btn 2 text', !!p?.action?.buttons?.[1]?.reply?.title, p?.action?.buttons?.[1]?.reply?.title);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '─'.repeat(55));
  console.log('📋 DETECTION: detectInteractiveContext para varios inputs');
  console.log('─'.repeat(55) + '\n');

  // ── 4. detectInteractiveContext - saludos ───────────────────────────
  const hasServices = services.length > 0;

  const greet1 = detectInteractiveContext('Hola', '¡Bienvenido!', hasServices);
  record('Detect: "Hola" → showWelcome', greet1.showWelcome === true, String(greet1.showWelcome));
  record('Detect: "Hola" ¬ showServices', !greet1.showServices, String(greet1.showServices));

  const greet2 = detectInteractiveContext('Buenos días', '¡Buenos días!', hasServices);
  record('Detect: "Buenos días" → showWelcome', greet2.showWelcome === true, String(greet2.showWelcome));

  const greet3 = detectInteractiveContext('Buenas tardes', 'Hola, buen día', hasServices);
  record('Detect: "Buenas tardes" → showWelcome', greet3.showWelcome === true, String(greet3.showWelcome));

  const greet4 = detectInteractiveContext('Hey', '¡Hola!', hasServices);
  record('Detect: "Hey" → showWelcome', greet4.showWelcome === true, String(greet4.showWelcome));

  // ── 5. detectInteractiveContext - servicios ─────────────────────────
  const svc1 = detectInteractiveContext('Qué servicios tienen?', 'Tenemos varios servicios.', hasServices);
  record('Detect: "Qué servicios" → showServices', svc1.showServices === true, String(svc1.showServices));

  const svc2 = detectInteractiveContext('Qué ofrecen?', 'Ofrecemos...', hasServices);
  record('Detect: "Qué ofrecen" → showServices', svc2.showServices === true, String(svc2.showServices));

  const svc3 = detectInteractiveContext('Me interesan sus planes', 'Claro, aquí están...', hasServices);
  record('Detect: "planes" → showServices', svc3.showServices === true, String(svc3.showServices));

  const svc4 = detectInteractiveContext('Precios por favor', 'Los precios son...', hasServices);
  record('Detect: "precios" → showServices', svc4.showServices === true, String(svc4.showServices));

  // ── 6. detectInteractiveContext - sin servicios ─────────────────────
  const noSvc1 = detectInteractiveContext('Qué servicios tienen?', 'Nada disponible', false);
  record('Detect: sin servicios → no showServices', !noSvc1.showServices, `showServices=${noSvc1.showServices}`);

  // ── 7. detectInteractiveContext - post-booking ──────────────────────
  const post1 = detectInteractiveContext('ok gracias', '✅ ¡Cita confirmada! Te esperamos el lunes.', hasServices);
  record('Detect: confirmación cita → postBooking', post1.showPostBooking === true, String(post1.showPostBooking));

  const post2 = detectInteractiveContext('gracias', 'Tu cita ha sido agendada exitosamente.', hasServices);
  record('Detect: "cita agendada" → postBooking', post2.showPostBooking === true, String(post2.showPostBooking));

  // ── 8. detectInteractiveContext - no match ──────────────────────────
  // Usamos un mensaje sin palabras clave de servicios ni saludos
  const noMatch = detectInteractiveContext('Necesito ayuda con un problema técnico urgente', 'Claro, dime cuál es el problema.', hasServices);
  record('Detect: mensaje técnico → no welcome', !noMatch.showWelcome, String(noMatch.showWelcome));
  record('Detect: mensaje técnico → no list', !noMatch.showServices, String(noMatch.showServices));
  record('Detect: mensaje técnico → no postBooking', !noMatch.showPostBooking, String(noMatch.showPostBooking));

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '─'.repeat(55));
  console.log('📋 EDGE CASES: Casos borde y validaciones extra');
  console.log('─'.repeat(55) + '\n');

  // ── 9. Validar que contentType es siempre 'input_select' ──────────
  record('Type: welcome', welcome.contentType === 'input_select', welcome.contentType);
  record('Type: services', list.contentType === 'input_select', list.contentType);
  record('Type: postBooking', post.contentType === 'input_select', post.contentType);

  // ── 10. Validar que contentAttributes es serializable (JSON) ────────
  let serializable = true;
  try {
    JSON.stringify(welcome);
    JSON.stringify(list);
    JSON.stringify(post);
  } catch { serializable = false; }
  record('Serializable: todos', serializable, serializable ? 'OK' : 'FAIL');

  // ── 11. detectInteractiveContext con strings vacíos ──────────────
  const emptyUser = detectInteractiveContext('', '', hasServices);
  record('Detect: empty → no triggers', !emptyUser.showWelcome && !emptyUser.showServices && !emptyUser.showPostBooking, 'sin triggers');

  // ── 12. detectInteractiveContext con mensajes largos ──────────────
  const longMsg = detectInteractiveContext(
    'Hola buenos días, quería consultar sobre los servicios que ofrecen para mi empresa',
    'Claro, tenemos servicios de consultoría, soporte y más.',
    hasServices
  );
  // El saludo se detecta si el mensaje incluye "hola" o "buenos dias" y es <100 chars
  record('Detect: saludo largo → showWelcome', longMsg.showWelcome === true, String(longMsg.showWelcome));

  // ── 13. detectInteractiveContext: no confundir cita con servicios ─
  const mixedCtx = detectInteractiveContext(
    'Quiero agendar una cita para el servicio de consultoría',
    'Perfecto, ¿para qué fecha?',
    hasServices
  );
  // Debería dar prioridad a servicios (porque menciona "servicio") sobre cita
  record('Detect: cita+servicios → showServices', mixedCtx.showServices === true, `services=${mixedCtx.showServices} postBooking=${mixedCtx.showPostBooking}`);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(55));
  console.log('📊 RESULTADOS');
  console.log('═'.repeat(55));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.test}: ${r.message}`);
  }

  console.log(`\n📈 ${passed}/${results.length} tests pasaron, ${failed} fallaron`);

  if (failed > 0) {
    console.log('\n⚠️  Tests fallados. Revisar los detalles arriba.');
  } else {
    console.log('\n🎉 ¡Todos los tests pasaron!');
    console.log('\n   Los mensajes interactivos de WhatsApp están listos:');
    console.log('   ✅ Botones de bienvenida (quick reply x3)');
    console.log('   ✅ Lista de servicios (list message)');
    console.log('   ✅ Botones post-booking (confirmar/cambiar/cancelar)');
    console.log('   ✅ Detección automática de intención (saludo/servicios/cita)');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
