/**
 * Verificación E2E INTEGRAL del módulo Tareas/Notas (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes de la ruta DETERMINISTA (sin LLM):
 *   1. Crear lead                   5. Completar la tarea
 *   2. Crear tarea vinculada        6. Crear nota
 *   3. Ver mis tareas               7. Ver notas
 *   4. Verificar tarea en BD        8. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-tareas-notas-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const TS = Date.now();
const EMAIL = `e2e-tn-${TS}@volkern.test`;
const NOMBRE = `E2E Tareas ${TS}`;
const TITULO = `llamar para seguimiento ${TS}`;
const CONTENIDO_NOTA = `Cliente interesado en paquete premium ${TS}`;

let leadId: string | undefined;
let taskId: string | undefined;
let noteId: string | undefined;
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
  const prevLeads = await prisma.lead.findMany({ where: { tenantId: TENANT_ID, nombre: { contains: 'E2E Tareas' } }, select: { id: true } });
  for (const l of prevLeads) {
    await prisma.task.deleteMany({ where: { leadId: l.id } }).catch(() => {});
    await prisma.note.deleteMany({ where: { leadId: l.id } }).catch(() => {});
    await prisma.lead.delete({ where: { id: l.id } }).catch(() => {});
  }

  const realUser = await prisma.user.findFirst({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const USER_ID = realUser?.id || 'e2e-tareas-integral';
  console.log(`Tenant: ${TENANT_ID} | userId: ${USER_ID}\n`);

  // ── 1. CREAR LEAD ──
  let r = await runStep(`agrega el lead ${NOMBRE} con email ${EMAIL}`, USER_ID);
  const lead = await prisma.lead.findFirst({ where: { email: EMAIL, tenantId: TENANT_ID } });
  leadId = lead?.id;
  log(!!lead && lead.nombre === NOMBRE, '1. Crear lead', lead ? `${lead.nombre}` : r.message);

  // ── 2. CREAR TAREA vinculada al lead ──
  r = await runStep(`crea una tarea con ${NOMBRE}: ${TITULO}`, USER_ID);
  log(r.message.includes('Tarea creada') && r.message.includes('llamar para seguimiento'), '2. Crear tarea', r.message.replace(/\n/g, ' | '));

  // ── 3. VER MIS TAREAS ──
  r = await runStep('qué tareas tengo', USER_ID);
  log(r.message.includes('Tareas pendientes') && r.message.replace(/\\/g, '').includes(TITULO.replace(/ /g, ' ').split(' ').slice(0, 2).join(' ')), '3. Ver mis tareas', r.message.replace(/\n/g, ' | '));

  // ── 4. VERIFICAR tarea en BD ──
  const task = await prisma.task.findFirst({ where: { leadId: leadId || '__none__', titulo: { contains: 'llamar para seguimiento' } }, orderBy: { fechaCreacion: 'desc' } });
  taskId = task?.id;
  const mañana = new Date(); mañana.setDate(mañana.getDate() + 1);
  const venceOK = !!task && task.fechaVencimiento.getFullYear() === mañana.getFullYear() && task.fechaVencimiento.getMonth() === mañana.getMonth() && task.fechaVencimiento.getDate() === mañana.getDate();
  log(!!task && task.leadId === leadId && venceOK && task.completada === false, '4. Tarea en BD (vinculada, vence mañana)', task ? `leadId=${task.leadId === leadId} · vence=${task.fechaVencimiento.toISOString().slice(0, 10)} · completada=${task.completada}` : r.message);

  // ── 5. COMPLETAR TAREA ──
  r = await runStep(`marca como completada la tarea de ${TITULO}`, USER_ID);
  const taskAfter = taskId ? await prisma.task.findUnique({ where: { id: taskId } }) : null;
  log(!!taskAfter && taskAfter.completada === true, '5. Completar tarea', taskAfter ? `completada=${taskAfter.completada}` : r.message.replace(/\n/g, ' | '));

  // ── 6. CREAR NOTA ──
  r = await runStep(`agrega nota a ${EMAIL}: ${CONTENIDO_NOTA}`, USER_ID);
  const note = await prisma.note.findFirst({ where: { leadId: leadId || '__none__', contenido: { contains: 'paquete premium' } }, orderBy: { fechaCreacion: 'desc' } });
  noteId = note?.id;
  log(!!note && note.leadId === leadId, '6. Crear nota', note ? `contenido=${note.contenido.slice(0, 40)}` : r.message.replace(/\n/g, ' | '));

  // ── 7. VER NOTAS ──
  r = await runStep(`qué notas tiene ${NOMBRE}`, USER_ID);
  log(r.message.includes('Notas (1)') && r.message.includes('paquete premium'), '7. Ver notas', r.message.replace(/\n/g, ' | '));

  // ── 8. LIMPIEZA ──
  if (noteId) await prisma.note.delete({ where: { id: noteId } }).catch(() => {});
  if (taskId) await prisma.task.delete({ where: { id: taskId } }).catch(() => {});
  if (leadId) await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});

  const [leftLeads, leftTasks, leftNotes] = await Promise.all([
    prisma.lead.count({ where: { email: EMAIL, tenantId: TENANT_ID } }),
    prisma.task.count({ where: { leadId: leadId || '__none__' } }),
    prisma.note.count({ where: { leadId: leadId || '__none__' } }),
  ]);
  log(leftLeads + leftTasks + leftNotes === 0, '8. Limpieza total (0 residuos)', `leads=${leftLeads} tareas=${leftTasks} notas=${leftNotes}`);

  console.log(`\n${failures === 0 ? '🎉 E2E TAREAS/NOTAS: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
