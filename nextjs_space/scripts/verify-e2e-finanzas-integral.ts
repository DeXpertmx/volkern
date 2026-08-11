/**
 * Verificación E2E INTEGRAL del módulo Finanzas (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes de la ruta DETERMINISTA (sin LLM):
 *   1. Registrar gasto simple               4. Analizar burn rate
 *   2. Registrar gasto con proveedor        5. Analizar gastos del mes
 *   3. Registrar gasto con categoría        6. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-finanzas-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const TS = Date.now();
const CONCEPTO1 = `comida e2e ${TS}`;
const CONCEPTO2 = `electricidad e2e ${TS}`;
const CONCEPTO3 = `software e2e ${TS}`;
const PROVEEDOR = `E2E Finanzas ${TS}`;

let supplierId: string | undefined;
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
  // Pre-limpieza idempotente: ejecuciones anteriores siempre crearon el proveedor
  const prevSuppliers = await prisma.supplier.findMany({ where: { tenantId: TENANT_ID, name: { contains: 'E2E Finanzas' } } });
  for (const s of prevSuppliers) {
    await prisma.expense.deleteMany({ where: { supplierId: s.id } }).catch(() => {});
    await prisma.supplier.delete({ where: { id: s.id } }).catch(() => {});
  }

  const realUser = await prisma.user.findFirst({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const USER_ID = realUser?.id || 'e2e-finanzas-integral';
  console.log(`Tenant: ${TENANT_ID} | userId: ${USER_ID}\n`);

  // ── 1. REGISTRAR GASTO simple ──
  let r = await runStep(`registra gasto de 45.90 en ${CONCEPTO1}`, USER_ID);
  const exp1 = await prisma.expense.findFirst({ where: { tenantId: TENANT_ID, description: CONCEPTO1 }, orderBy: { createdAt: 'desc' } });
  log(!!exp1 && exp1.amount === 45.9 && exp1.description === CONCEPTO1, '1. Registrar gasto (45.90€ comida)', exp1 ? `amount=${exp1.amount} · desc=${exp1.description}` : r.message.replace(/\n/g, ' | '));

  // ── 2. REGISTRAR GASTO con proveedor ──
  r = await runStep(`nuevo gasto: 120€ de ${CONCEPTO2}, proveedor ${PROVEEDOR}`, USER_ID);
  const supplier = await prisma.supplier.findFirst({ where: { tenantId: TENANT_ID, name: { contains: PROVEEDOR } } });
  supplierId = supplier?.id;
  const exp2 = await prisma.expense.findFirst({ where: { tenantId: TENANT_ID, description: CONCEPTO2 }, orderBy: { createdAt: 'desc' } });
  log(!!exp2 && exp2.amount === 120 && !!supplier && exp2.supplierId === supplier.id,
    '2. Registrar gasto con proveedor (120€)', exp2 ? `amount=${exp2.amount} · proveedor=${supplier?.name}` : r.message.replace(/\n/g, ' | '));

  // ── 3. REGISTRAR GASTO con categoría ──
  r = await runStep(`gasto de 300€ en ${CONCEPTO3}, categoría herramientas`, USER_ID);
  const exp3 = await prisma.expense.findFirst({ where: { tenantId: TENANT_ID, description: CONCEPTO3 }, orderBy: { createdAt: 'desc' } });
  const metadata3 = (exp3?.metadata as any) || {};
  log(!!exp3 && exp3.amount === 300 && (exp3.category === 'herramientas' || metadata3.category === 'herramientas'),
    '3. Registrar gasto con categoría (300€)', exp3 ? `amount=${exp3.amount} · category=${exp3.category ?? metadata3.category}` : r.message.replace(/\n/g, ' | '));

  // ── 4. ANALIZAR BURN RATE ──
  r = await runStep('analiza mi burn rate', USER_ID);
  log(r.message.includes('Análisis financiero') && r.message.includes('Estado:'), '4. Analizar burn rate', r.message.replace(/\n/g, ' | '));

  // ── 5. ANALIZAR GASTOS DEL MES ──
  r = await runStep('cómo vamos de gastos este mes', USER_ID);
  log(r.message.includes('Análisis financiero') && r.message.includes('1 mes'), '5. Analizar gastos del mes', r.message.replace(/\n/g, ' | '));

  // ── 6. LIMPIEZA ──
  await prisma.expense.deleteMany({ where: { tenantId: TENANT_ID, description: { in: [CONCEPTO1, CONCEPTO2, CONCEPTO3] } } });
  if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => {});

  const [leftExpenses, leftSuppliers] = await Promise.all([
    prisma.expense.count({ where: { tenantId: TENANT_ID, description: { in: [CONCEPTO1, CONCEPTO2, CONCEPTO3] } } }),
    prisma.supplier.count({ where: { tenantId: TENANT_ID, name: { contains: PROVEEDOR } } }),
  ]);
  log(leftExpenses + leftSuppliers === 0, '6. Limpieza total (0 residuos)', `gastos=${leftExpenses} proveedores=${leftSuppliers}`);

  console.log(`\n${failures === 0 ? '🎉 E2E FINANZAS: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
