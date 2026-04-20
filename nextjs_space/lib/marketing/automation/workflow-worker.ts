import { Worker, Job } from 'bullmq';
import { initRedis } from '../../core/redis';
import { SocialMediaService } from '../social-media-service';
import { prisma } from '../../db';

/**
 * Marketing Workflow Worker
 * Ejecuta las acciones individuales de una regla de automatización.
 * Solo se inicializa si Redis está disponible.
 */
export const setupWorkflowWorker = async () => {
  const redis = await initRedis();
  if (!redis) {
    console.debug('[WorkflowWorker] Redis no disponible, worker omitido.');
    return;
  }

  const worker = new Worker('marketing_workflows', async (job: Job) => {
    const { ruleId, tenantId, actions, payload } = job.data;
    console.log(`[WorkflowWorker] Processing ${actions.length} actions for rule ${ruleId}`);

    for (const action of actions) {
      try {
        await executeAction(action, tenantId, payload);
      } catch (error) {
        console.error(`[WorkflowWorker] Action failed:`, action.type, error);
      }
    }
  }, { connection: redis });

  worker.on('completed', (job) => {
    console.log(`[WorkflowWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WorkflowWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err: any) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') return;
    console.error('[WorkflowWorker] Error:', err);
  });
};

/**
 * Ejecutor de acciones individuales
 */
async function executeAction(action: any, tenantId: string, payload: any) {
  switch (action.type) {
    case 'START_NURTURING':
      console.log(`[Action] Starting nurturing for ${payload.email} in campaign ${action.campaignId}`);
      await prisma.campaignRecipient.create({
        data: {
          tenantId,
          campaignId: action.campaignId,
          email: payload.email,
          nombre: payload.nombre,
          status: 'pending'
        }
      });
      break;

    case 'SEND_SOCIAL_POST':
      console.log(`[Action] Sending automated social post for tenant ${tenantId}`);
      await SocialMediaService.schedulePost({
        tenantId,
        content: action.content.replace('{{name}}', payload.nombre || ''),
        platforms: action.platforms
      });
      break;

    case 'CREATE_CRM_TASK':
      console.log(`[Action] Creating CRM task for lead ${payload.leadId}`);
      await prisma.task.create({
        data: {
          tenantId,
          leadId: payload.leadId,
          titulo: action.title,
          descripcion: action.description,
          tipo: 'FOLLOW_UP',
          prioridad: 'ALTA',
          fechaVencimiento: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
      break;

    case 'NOTIFY_GEMMA':
      console.log(`[Action] Notifying Gemma for optimization advice`);
      break;

    default:
      console.warn(`[WorkflowWorker] Unknown action type: ${action.type}`);
  }
}
