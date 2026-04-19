import { Worker, Job } from 'bullmq';
import { redisConnection } from '../../core/redis';
import { SocialMediaService } from '../social-media-service';
import { prisma } from '../../db';

/**
 * Marketing Workflow Worker
 * Ejecuta las acciones individuales de una regla de automatización
 */
export const setupWorkflowWorker = () => {
  const worker = new Worker('marketing:workflows', async (job: Job) => {
    const { ruleId, tenantId, actions, payload } = job.data;
    console.log(`[WorkflowWorker] Processing ${actions.length} actions for rule ${ruleId}`);

    for (const action of actions) {
      try {
        await executeAction(action, tenantId, payload);
      } catch (error) {
        console.error(`[WorkflowWorker] Action failed:`, action.type, error);
        // Podríamos decidir si fallar el job completo o continuar con el resto
      }
    }
  }, { connection: redisConnection });

  worker.on('completed', (job) => {
    console.log(`[WorkflowWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WorkflowWorker] Job ${job?.id} failed:`, err);
  });
};

/**
 * Ejecutor de acciones individuales
 */
async function executeAction(action: any, tenantId: string, payload: any) {
  switch (action.type) {
    case 'START_NURTURING':
      // Lógica para añadir a una campaña de nurturing
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
      // Publicación social automática (ej: avisar de nuevo producto)
      console.log(`[Action] Sending automated social post for tenant ${tenantId}`);
      await SocialMediaService.schedulePost({
        tenantId,
        content: action.content.replace('{{name}}', payload.nombre || ''),
        platforms: action.platforms
      });
      break;

    case 'CREATE_CRM_TASK':
      // Crear tarea para un vendedor
      console.log(`[Action] Creating CRM task for lead ${payload.leadId}`);
      await prisma.task.create({
        data: {
          tenantId,
          leadId: payload.leadId,
          titulo: action.title,
          descripcion: action.description,
          tipo: 'FOLLOW_UP',
          prioridad: 'ALTA',
          fechaVencimiento: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
        }
      });
      break;

    case 'NOTIFY_GEMMA':
      // Notificar a la IA para que analice y sugiera (Skill request)
      console.log(`[Action] Notifying Gemma for optimization advice`);
      // Aquí se llamaría a un skill específico o se guardaría en el AiDecisionLog
      break;

    default:
      console.warn(`[WorkflowWorker] Unknown action type: ${action.type}`);
  }
}
