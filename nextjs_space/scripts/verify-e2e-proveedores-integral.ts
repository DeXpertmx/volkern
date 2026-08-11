/**
 * Verificación E2E INTEGRAL del módulo Proveedores (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes de la ruta DETERMINISTA (sin LLM):
 *   1. Crear proveedor simple               4. Crear proveedor con categoría y dirección
 *   2. Crear proveedor con email            5. Listar proveedores (debe incluir los creados)
 *   3. Crear proveedor sin nombre (pide)    6. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-proveedores-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const TS = Date.now();
const NOMBRE1 = `E2E Suministros ${TS}`;
const NOMBRE2 = `E2E Papelería ${TS}`;
const NOMBRE3 = `E2E Tecnología ${TS}`;
const EMAIL1 = `ventas-${TS}@suministros.test`;

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
  // Pre-limpieza idempotente
  const prev = await prisma.supplier.findMany({ where: { tenantId: TENANT_ID, name: { contains: 'E2E ' } } });
  for (const s of prev) {
    await prisma.supplier.delete({ where: { id: s.id } }).catch(() => {});
  }

  const realUser = await prisma.user.findFirst({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const USER_ID = realUser?.id || 'e2e-proveedores-integral';
  console.log(`Tenant: ${TENANT_ID} | userId: ${USER_ID}\n`);

  // ── 1. CREAR PROVEEDOR simple ──
  let r = await runStep(`registra proveedor: ${NOMBRE1}`, USER_ID);
  let sup = await prisma.supplier.findFirst({ where: { tenantId: TENANT_ID, name: NOMBRE1 } });
  log(!!sup && sup.active === true, '1. Crear proveedor simple', sup ? `name=${sup.name} · cat=${sup.category}` : r.message.replace(/\n/g, ' | '));

  // ── 2. CREAR PROVEEDOR con email ──
  r = await runStep(`registra proveedor: ${NOMBRE2}, email ${EMAIL1}`, USER_ID);
  sup = await prisma.supplier.findFirst({ where: { tenantId: TENANT_ID, name: NOMBRE2 } });
  log(!!sup && sup.email === EMAIL1, '2. Crear proveedor con email', sup ? `email=${sup.email}` : r.message.replace(/\n/g, ' | '));

  // ── 3. CREAR PROVEEDOR sin nombre → pide nombre ──
  const c3 = await (await import('@/lib/agents/intent-classifier')).intentClassifier.classify({
    message: 'registra un proveedor',
    userId: USER_ID,
    tenantId: TENANT_ID,
  });
  log(c3.intent === 'crear_proveedor' && c3.needsMoreInfo && c3.missingParams.includes('nombre'),
    '3. Sin nombre → pide nombre', `missing=[${c3.missingParams.join(',')}]`);

  // ── 4. CREAR PROVEEDOR con categoría y dirección ──
  r = await runStep(`registra proveedor: ${NOMBRE3}, categoría oficina, dirección Av. Reforma 123`, USER_ID);
  sup = await prisma.supplier.findFirst({ where: { tenantId: TENANT_ID, name: NOMBRE3 } });
  log(!!sup && sup.category === 'oficina' && sup.streetName === 'Av. Reforma 123',
    '4. Crear proveedor con categoría y dirección', sup ? `cat=${sup.category} · street=${sup.streetName}` : r.message.replace(/\n/g, ' | '));

  // ── 5. LISTAR PROVEEDORES (debe incluir los creados) ──
  r = await runStep('lista los proveedores', USER_ID);
  const names = [NOMBRE1, NOMBRE2, NOMBRE3];
  const allFound = names.every((n) => r.message.includes(n));
  log(r.message.includes('Proveedores') && allFound, '5. Listar proveedores (incluye los creados)', r.message.replace(/\n/g, ' | '));

  // ── 6. LIMPIEZA ──
  await prisma.supplier.deleteMany({ where: { tenantId: TENANT_ID, name: { in: names } } });
  const left = await prisma.supplier.count({ where: { tenantId: TENANT_ID, name: { in: names } } });
  log(left === 0, '6. Limpieza total (0 residuos)', `residuos=${left}`);

  console.log(`\n${failures === 0 ? '🎉 E2E PROVEEDORES: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
