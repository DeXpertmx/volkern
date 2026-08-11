/**
 * Verificación E2E INTEGRAL del módulo Catálogo (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes de la ruta DETERMINISTA (sin LLM):
 *   1. Crear ítems de catálogo visibles (servicio + producto + inmueble)
 *   2. Buscar por nombre (query) → buscar_catalogo
 *   3. Consultar precio ("cuánto cuesta X") → buscar_catalogo
 *   4. Listar catálogo ("qué productos hay") → buscar_catalogo sin query
 *   5. Filtrar por rango de precio ("por menos de X")
 *   6. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-catalogo-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const TS = Date.now();
const NOMBRE_SERVICIO = `E2E Consultoría Premium ${TS}`;
const NOMBRE_PRODUCTO = `E2E Cafetera Pro ${TS}`;
const NOMBRE_INMUEBLE = `E2E Apartamento Madrid ${TS}`;

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
  await prisma.catalogoItem.deleteMany({ where: { tenantId: TENANT_ID, nombre: { contains: 'E2E ' } } });

  const realUser = await prisma.user.findFirst({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const USER_ID = realUser?.id || 'e2e-catalogo-integral';
  console.log(`Tenant: ${TENANT_ID} | userId: ${USER_ID}\n`);

  // ── 1. CREAR ítems de catálogo visibles en chatbot ──
  const ids: string[] = [];
  ids.push((await prisma.catalogoItem.create({
    data: { tenantId: TENANT_ID, nombre: NOMBRE_SERVICIO, descripcion: 'Consultoría de marketing digital', tipo: 'servicio', precioBase: 199, moneda: 'EUR', activo: true, visibleInChatbot: true, categorias: ['consultoria'] },
  })).id);
  ids.push((await prisma.catalogoItem.create({
    data: { tenantId: TENANT_ID, nombre: NOMBRE_PRODUCTO, descripcion: 'Cafetera espresso profesional', tipo: 'producto', precioBase: 399, moneda: 'EUR', activo: true, visibleInChatbot: true, categorias: ['electrodomesticos'] },
  })).id);
  ids.push((await prisma.catalogoItem.create({
    data: { tenantId: TENANT_ID, nombre: NOMBRE_INMUEBLE, descripcion: 'Apartamento con 3 habitaciones', tipo: 'inmueble', precioBase: 250000, moneda: 'EUR', activo: true, visibleInChatbot: true, categorias: ['inmuebles'], customFieldValues: { ciudad: 'Madrid', habitaciones: '3' } },
  })).id);
  const created = await prisma.catalogoItem.count({ where: { tenantId: TENANT_ID, id: { in: ids } } });
  log(created === 3, '1. Ítems de catálogo visibles creados', `count=${created}`);

  // ── 2. BUSCAR por nombre (query) ──
  // "busca X" con nombre propio mayúscula es ambiguo (podría ser lead); con
  // "en el catálogo" es inequívocamente búsqueda de catálogo.
  let r = await runStep(`busca en el catálogo ${NOMBRE_PRODUCTO}`, USER_ID);
  log(r.intent === 'buscar_catalogo' && r.message.includes(NOMBRE_PRODUCTO),
    '2. Buscar por nombre', r.message.replace(/\n/g, ' | '));

  // ── 3. CONSULTAR PRECIO ──
  r = await runStep(`cuánto cuesta ${NOMBRE_SERVICIO}`, USER_ID);
  log(r.intent === 'buscar_catalogo' && r.message.includes(NOMBRE_SERVICIO),
    '3. Consultar precio', r.message.replace(/\n/g, ' | '));

  // ── 4. LISTAR catálogo (qué productos hay) ──
  r = await runStep('qué productos hay', USER_ID);
  log(r.intent === 'buscar_catalogo' && r.message.includes(NOMBRE_PRODUCTO),
    '4. Listar catálogo', r.message.replace(/\n/g, ' | '));

  // ── 5. FILTRAR por rango de precio ──
  r = await runStep(`busca en el catálogo productos por menos de 500`, USER_ID);
  log(r.intent === 'buscar_catalogo' && r.message.includes(NOMBRE_PRODUCTO) && !r.message.includes(NOMBRE_INMUEBLE),
    '5. Filtro por precio máximo', r.message.replace(/\n/g, ' | '));

  // ── 6. LIMPIEZA ──
  await prisma.catalogoItem.deleteMany({ where: { tenantId: TENANT_ID, id: { in: ids } } });
  const left = await prisma.catalogoItem.count({ where: { tenantId: TENANT_ID, id: { in: ids } } });
  log(left === 0, '6. Limpieza total (0 residuos)', `residuos=${left}`);

  console.log(`\n${failures === 0 ? '🎉 E2E CATÁLOGO: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
