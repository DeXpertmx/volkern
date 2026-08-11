/**
 * Verificación E2E INTEGRAL del módulo Citas (IA de Telegram) contra la BD real.
 *
 * Compone el pipeline exacto del chatbot (classify → createPlan → ExecutionEngine.run)
 * usando SOLO mensajes de la ruta DETERMINISTA (sin LLM):
 *   1. Crear lead                      4. Consultar citas próximas
 *   2. Agendar cita para mañana 10am   5. Cancelar la cita
 *   3. Verificar cita en BD            6. Limpieza total
 *
 * Run: npx tsx scripts/verify-e2e-citas-integral.ts
 */
import { prisma } from '@/lib/db';

const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'; // dexpert
const EMAIL = `e2e-citas-${Date.now()}@volkern.test`;
const NOMBRE = 'E2E Citas Integral';

let leadId: string | undefined;
let citaId: string | undefined;
let taskId: string | undefined;
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
  // Pre-limpieza: borrar residuos de ejecuciones anteriores (mismo nombre de prueba)
  const prevLeads = await prisma.lead.findMany({
    where: { tenantId: TENANT_ID, nombre: NOMBRE },
    select: { id: true },
  });
  for (const l of prevLeads) {
    await prisma.task.deleteMany({ where: { leadId: l.id } }).catch(() => {});
    await prisma.cita.deleteMany({ where: { leadId: l.id } }).catch(() => {});
    await prisma.lead.delete({ where: { id: l.id } }).catch(() => {});
  }

  const realUser = await prisma.user.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true },
  });
  const USER_ID = realUser?.id || 'e2e-citas-integral';
  console.log(`Tenant: ${TENANT_ID} | Email prueba: ${EMAIL} | userId: ${USER_ID}\n`);

  // ── 1. CREAR LEAD ──
  let r = await runStep(`agrega el lead ${NOMBRE} con email ${EMAIL}`, USER_ID);
  const lead = await prisma.lead.findFirst({ where: { email: EMAIL, tenantId: TENANT_ID } });
  leadId = lead?.id;
  log(!!lead && lead.nombre === NOMBRE, '1. Crear lead', lead ? `${lead.nombre} · ${lead.email}` : r.message);

  // ── 2. AGENDAR CITA para mañana a las 10am ──
  r = await runStep(`agenda una cita con ${EMAIL} para mañana a las 10am`, USER_ID);
  log(r.intent === 'agendar_cita' && r.message.includes('Cita agendada'), '2. Agendar cita (mañana 10am)', r.message.replace(/\n/g, ' | '));

  // ── 3. VERIFICAR cita en BD ──
  const cita = await prisma.cita.findFirst({
    where: { leadId: leadId || '__none__' },
    orderBy: { fechaHora: 'desc' },
  });
  citaId = cita?.id;
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 1);
  const citaFechaOK = !!cita && cita.fechaHora.getFullYear() === mañana.getFullYear()
    && cita.fechaHora.getMonth() === mañana.getMonth()
    && cita.fechaHora.getDate() === mañana.getDate()
    && cita.fechaHora.getHours() === 10
    && cita.fechaHora.getMinutes() === 0;
  log(citaFechaOK && cita?.estado === 'pendiente', '3. Cita en BD (mañana 10:00, pendiente)', cita ? `${cita.fechaHora.toISOString()} · estado=${cita.estado} · titulo=${cita.titulo}` : r.message);

  // Tarea de confirmación creada por createBooking (24h antes)
  const task = await prisma.task.findFirst({ where: { leadId: leadId || '__none__' }, orderBy: { fechaCreacion: 'desc' } });
  taskId = task?.id;

  // ── 4. CONSULTAR citas próximas ──
  r = await runStep('qué citas tengo', USER_ID);
  log(r.message.includes('Tus próximas citas') && r.message.includes('Cita de Seguimiento'), '4. Consultar citas próximas', r.message.replace(/\n/g, ' | '));

  // ── 5. CANCELAR la cita ──
  r = await runStep(`cancela la cita de ${NOMBRE}`, USER_ID);
  const citaAfter = citaId ? await prisma.cita.findUnique({ where: { id: citaId } }) : null;
  log(!!citaAfter && citaAfter.estado === 'cancelada', '5. Cancelar cita', citaAfter ? `estado=${citaAfter.estado}` : r.message.replace(/\n/g, ' | '));

  // ── 6. LIMPIEZA ──
  if (taskId) await prisma.task.delete({ where: { id: taskId } }).catch(() => {});
  if (citaId) await prisma.cita.delete({ where: { id: citaId } }).catch(() => {});
  if (leadId) await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});

  const [leftLeads, leftCitas, leftTasks] = await Promise.all([
    prisma.lead.count({ where: { email: EMAIL, tenantId: TENANT_ID } }),
    prisma.cita.count({ where: { leadId: leadId || '__none__' } }),
    prisma.task.count({ where: { leadId: leadId || '__none__' } }),
  ]);
  log(leftLeads + leftCitas + leftTasks === 0, '6. Limpieza total (0 residuos)', `leads=${leftLeads} citas=${leftCitas} tareas=${leftTasks}`);

  console.log(`\n${failures === 0 ? '🎉 E2E CITAS: TODOS LOS PASOS OK' : `⚠️ ${failures} paso(s) fallaron`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 Error en E2E:', e?.message || e);
  process.exit(1);
});
