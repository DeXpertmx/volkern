/**
 * Verificación E2E INTEGRAL del módulo Ventas (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes que caen en la ruta DETERMINISTA del clasificador (sin LLM,
 * para no colgarse como las cadenas multi-turno anteriores):
 *   1. Crear lead con datos completos     6. Mover deal a etapa negociación
 *   2. Buscar lead por email              7. Listar deals filtrados por lead
 *   3. Buscar lead por nombre             8. Registrar interacción (llamada)
 *   4. Listar leads                       9. Convertir lead a contacto
 *   5. Crear deal (5000€)                10. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-ventas-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const EMAIL = `e2e-ventas-${Date.now()}@volkern.test`;
const NOMBRE = 'E2E Ventas Integral';

let leadId: string | undefined;
let contactId: string | undefined;
let dealId: string | undefined;
let interactionId: string | undefined;
let failures = 0;

function log(ok: boolean, label: string, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

async function runStep(message: string, userId: string) {
  const { intentClassifier } = await import('@/lib/agents/intent-classifier');
  const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
  const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

  const classification = await intentClassifier.classify({
    message,
    userId,
    tenantId: TENANT_ID,
  });

  if (!classification.rawResponse.includes('determinista')) {
    throw new Error(`[${message}] NO cayó en ruta determinista (intent=${classification.intent})`);
  }

  const planResult = await SkillOrchestratorAgent.createPlan(
    {
      intent: classification.intent,
      entities: classification.extractedParams as Record<string, string>,
      missingEntities: classification.missingParams,
    },
    { collectedEntities: {}, missingEntities: classification.missingParams, tenantId: TENANT_ID, userId },
    TENANT_ID
  );

  if (!planResult.success) throw new Error(`[${message}] Orquestador falló: ${planResult.error}`);
  if (planResult.response) return { intent: classification.intent, message: planResult.response, noAccess: true };

  const execution = await ExecutionEngine.run({
    plan: planResult.plan!,
    userId,
    tenantId: TENANT_ID,
  });

  return { intent: classification.intent, message: execution.message, data: execution.data };
}

async function main() {
  // userId real del tenant: la interacción tiene FK creadoPor→User y falla con ids ficticios
  const realUser = await prisma.user.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true },
  });
  const USER_ID = realUser?.id || 'e2e-ventas-integral';
  console.log(`Tenant: ${TENANT_ID} | Email prueba: ${EMAIL} | userId: ${USER_ID}\n`);

  // ── 1. CREAR LEAD con datos completos ──
  let r = await runStep(`agrega el lead ${NOMBRE} con email ${EMAIL}, cargo Director, teléfono +525500000001, de la empresa E2E Empresa Integral`, USER_ID);
  const lead = await prisma.lead.findFirst({ where: { email: EMAIL, tenantId: TENANT_ID } });
  leadId = lead?.id;
  log(!!lead && lead.nombre === NOMBRE && lead.cargo === 'Director' && lead.empresa === 'E2E Empresa Integral' && lead.telefono?.includes('525500000001'),
    '1. Crear lead (nombre/cargo/empresa/teléfono en BD)', lead ? `${lead.nombre} · cargo=${lead.cargo} · tel=${lead.telefono}` : r.message);

  // ── 2. BUSCAR lead por EMAIL ──
  r = await runStep(`busca el lead con email ${EMAIL}`, USER_ID);
  log(r.message.includes('Lead encontrado') && r.message.includes(NOMBRE), '2. Buscar lead por email', r.message.replace(/\n/g, ' | '));

  // ── 3. BUSCAR lead por NOMBRE ──
  r = await runStep(`busca el lead ${NOMBRE}`, USER_ID);
  // El email viene escapado para Markdown de Telegram (e2e\-ventas\-…\.test)
  log(r.message.includes('Lead encontrado') && r.message.replace(/\\/g, '').includes(EMAIL), '3. Buscar lead por nombre', r.message.replace(/\n/g, ' | '));

  // ── 4. LISTAR leads ──
  r = await runStep('lista los leads', USER_ID);
  log(r.message.includes('Leads (') && r.message.includes(NOMBRE), '4. Listar leads', r.message.replace(/\n/g, ' | '));

  // ── 5. CREAR DEAL (5000€, paquete) ──
  r = await runStep(`crea un deal con ${EMAIL} por 5000€ por el paquete integral`, USER_ID);
  const deal = await prisma.deal.findFirst({ where: { leadId, titulo: { contains: 'paquete integral' } }, orderBy: { fechaCreacion: 'desc' } });
  dealId = deal?.id;
  log(!!deal && deal.valor === 5000 && deal.leadId === leadId, '5. Crear deal (valor 5000, vinculado al lead)', deal ? `valor=${deal.valor} · etapa=${deal.etapa}` : r.message);

  // ── 6. MOVER DEAL a etapa negociación ──
  r = await runStep(`mueve el deal de ${EMAIL} a etapa negociación`, USER_ID);
  const deal2 = dealId ? await prisma.deal.findUnique({ where: { id: dealId } }) : null;
  log(!!deal2 && deal2.etapa === 'negociación', '6. Mover deal a etapa negociación', deal2 ? `etapa=${deal2.etapa}` : r.message.replace(/\n/g, ' | '));

  // ── 7. LISTAR deals filtrados por lead ──
  r = await runStep(`qué deals tengo con ${EMAIL}`, USER_ID);
  log(r.message.includes('Pipeline (1)') && r.message.includes('paquete integral'), '7. Listar deals filtrados por lead', r.message.replace(/\n/g, ' | '));

  // ── 8. REGISTRAR INTERACCIÓN (llamada) ──
  r = await runStep(`registra una llamada con ${EMAIL}: Hablamos sobre la oferta integral`, USER_ID);
  const interaction = await prisma.interaction.findFirst({ where: { leadId }, orderBy: { fechaCreacion: 'desc' } });
  interactionId = interaction?.id;
  log(!!interaction && interaction.tipo === 'llamada' && (interaction.contenido || '').includes('oferta integral'),
    '8. Registrar interacción (llamada)', interaction ? `${interaction.tipo}: ${interaction.contenido}` : r.message);

  // ── 9. CONVERTIR lead a contacto ──
  r = await runStep(`convierte a ${EMAIL} en contacto`, USER_ID);
  const contact = await prisma.contact.findFirst({ where: { email: EMAIL, tenantId: TENANT_ID } });
  contactId = contact?.id;
  const leadAfter = await prisma.lead.findFirst({ where: { email: EMAIL, tenantId: TENANT_ID } });
  log(!!contact && contact.tipo === 'person' && leadAfter?.estado === 'convertido' && leadAfter.convertedToContactId === contact.id,
    '9. Convertir lead a contacto', leadAfter ? `lead estado=${leadAfter.estado} · contacto=${contact?.nombre}` : r.message);

  // ── 10. LIMPIEZA ──
  if (interactionId) await prisma.interaction.delete({ where: { id: interactionId } }).catch(() => {});
  if (dealId) await prisma.deal.delete({ where: { id: dealId } }).catch(() => {});
  if (contactId) await prisma.contact.delete({ where: { id: contactId } }).catch(() => {});
  if (leadId) await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});

  const [leftLeads, leftContacts, leftDeals, leftInteractions] = await Promise.all([
    prisma.lead.count({ where: { email: EMAIL, tenantId: TENANT_ID } }),
    prisma.contact.count({ where: { email: EMAIL, tenantId: TENANT_ID } }),
    prisma.deal.count({ where: { titulo: { contains: 'paquete integral' }, tenantId: TENANT_ID } }),
    prisma.interaction.count({ where: { leadId: leadId || '__none__' } }),
  ]);
  log(leftLeads + leftContacts + leftDeals + leftInteractions === 0, '10. Limpieza total (0 residuos)', `leads=${leftLeads} contactos=${leftContacts} deals=${leftDeals} interacciones=${leftInteractions}`);

  console.log(`\n${failures === 0 ? '🎉 E2E INTEGRAL: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
