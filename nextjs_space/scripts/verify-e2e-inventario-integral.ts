/**
 * Verificación E2E INTEGRAL del módulo Inventario (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes de la ruta DETERMINISTA (sin LLM):
 *   1. Crear ítem de catálogo + stock level inicial
 *   2. Salud de inventario (stock bajo detectado)
 *   3. Entrada de stock (ajustar_stock IN)
 *   4. Salida de stock (ajustar_stock OUT)
 *   5. Consumo de inventario
 *   6. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-inventario-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const TS = Date.now();
const NOMBRE = `E2E Cafetera Stock ${TS}`;

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
  const prevItems = await prisma.catalogoItem.findMany({ where: { tenantId: TENANT_ID, nombre: { contains: 'E2E ' } } });
  const prevIds = prevItems.map(i => i.id);
  await prisma.stockLevel.deleteMany({ where: { tenantId: TENANT_ID, catalogoItemId: { in: prevIds } } }).catch(() => {});
  await prisma.catalogoItem.deleteMany({ where: { tenantId: TENANT_ID, id: { in: prevIds } } });

  const realUser = await prisma.user.findFirst({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const USER_ID = realUser?.id || 'e2e-inventario-integral';
  console.log(`Tenant: ${TENANT_ID} | userId: ${USER_ID}\n`);

  // ── 1. CREAR ítem + stock inicial bajo (2u con min 5u → stock bajo) ──
  const item = await prisma.catalogoItem.create({
    data: { tenantId: TENANT_ID, nombre: NOMBRE, descripcion: 'Cafetera para E2E', tipo: 'producto', precioBase: 299, moneda: 'EUR', activo: true, visibleInChatbot: true },
  });
  // Mismo patrón que el skill: buscar o crear "Almacén Central"
  let wh = await prisma.warehouse.findFirst({ where: { tenantId: TENANT_ID, name: 'Almacén Central' } });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: { tenantId: TENANT_ID, name: 'Almacén Central', location: 'Principal', description: 'Almacén generado por E2E inventario' },
    });
  }
  await prisma.stockLevel.create({
    data: { tenantId: TENANT_ID, warehouseId: wh.id, catalogoItemId: item.id, quantity: 2, minStock: 5 },
  });
  log(true, '1. Ítem + stock inicial creado', `stock=2 min=5 (bajo)`);

  // ── 2. SALUD DE INVENTARIO (detecta el stock bajo) ──
  let r = await runStep('qué productos tienen stock bajo', USER_ID);
  log(r.intent === 'salud_inventario' && r.message.includes(NOMBRE),
    '2. Salud de inventario (stock bajo)', r.message.replace(/\n/g, ' | '));

  // ── 3. ENTRADA de stock (IN) ──
  r = await runStep(`entrada de 20 unidades del producto ${NOMBRE}`, USER_ID);
  const afterIn = await prisma.stockLevel.findFirst({ where: { tenantId: TENANT_ID, catalogoItemId: item.id } });
  log(r.intent === 'ajustar_stock' && afterIn?.quantity === 22,
    '3. Entrada de stock IN (2+20=22)', `stock=${afterIn?.quantity}`);

  // ── 4. SALIDA de stock (OUT) ──
  r = await runStep(`salida de 7 unidades del producto ${NOMBRE}`, USER_ID);
  const afterOut = await prisma.stockLevel.findFirst({ where: { tenantId: TENANT_ID, catalogoItemId: item.id } });
  log(r.intent === 'ajustar_stock' && afterOut?.quantity === 15,
    '4. Salida de stock OUT (22-7=15)', `stock=${afterOut?.quantity}`);

  // ── 5. CONSUMO de inventario ──
  r = await runStep(`consume 5 unidades del producto ${NOMBRE}`, USER_ID);
  const afterCons = await prisma.stockLevel.findFirst({ where: { tenantId: TENANT_ID, catalogoItemId: item.id } });
  log(r.intent === 'consumir_inventario' && afterCons?.quantity === 10,
    '5. Consumo (15-5=10)', `stock=${afterCons?.quantity}`);

  // ── 6. LIMPIEZA ──
  await prisma.stockLevel.deleteMany({ where: { tenantId: TENANT_ID, catalogoItemId: item.id } });
  await prisma.catalogoItem.delete({ where: { id: item.id } });
  const left = await prisma.catalogoItem.count({ where: { id: item.id } });
  log(left === 0, '6. Limpieza total (0 residuos)', `residuos=${left}`);

  console.log(`\n${failures === 0 ? '🎉 E2E INVENTARIO: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
