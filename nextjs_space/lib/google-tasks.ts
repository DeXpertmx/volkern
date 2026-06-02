import { google, tasks_v1 } from 'googleapis';
import { prisma } from '@/lib/db';
import { getAuthenticatedClient } from '@/lib/google-calendar';

/**
 * Google Tasks Integration Library
 * Handles task synchronization from Volkern to Google Tasks
 */

const VOLKERN_TASKLIST_NAME = 'Volkern CRM';

interface VolkernTask {
  id: string;
  titulo: string;
  descripcion?: string | null;
  fechaVencimiento: Date;
  completada: boolean;
  tipo: string;
  lead?: {
    id: string;
    nombre: string;
    empresa?: string | null;
  } | null;
}

interface GoogleTaskResult {
  success: boolean;
  googleTaskId?: string;
  googleTaskListId?: string;
  error?: string;
}

/**
 * Obtiene el cliente de Google Tasks autenticado
 */
async function getTasksClient(userId: string): Promise<tasks_v1.Tasks> {
  const oauth2Client = await getAuthenticatedClient(userId);
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

/**
 * Obtiene o crea la lista de tareas de Volkern en Google Tasks
 */
async function getOrCreateVolkernTaskList(userId: string): Promise<string> {
  const tasksClient = await getTasksClient(userId);
  
  // Buscar lista existente
  const listResponse = await tasksClient.tasklists.list();
  const existingList = listResponse.data.items?.find(
    (list) => list.title === VOLKERN_TASKLIST_NAME
  );
  
  if (existingList?.id) {
    return existingList.id;
  }
  
  // Crear nueva lista
  const newList = await tasksClient.tasklists.insert({
    requestBody: {
      title: VOLKERN_TASKLIST_NAME,
    },
  });
  
  if (!newList.data.id) {
    throw new Error('No se pudo crear la lista de tareas en Google');
  }
  
  console.log(`✅ Lista de tareas "${VOLKERN_TASKLIST_NAME}" creada en Google Tasks`);
  return newList.data.id;
}

/**
 * Formatea la descripción de la tarea para Google Tasks
 */
function formatTaskNotes(task: VolkernTask, appUrl: string): string {
  const lines: string[] = [];
  
  if (task.lead) {
    lines.push(`📋 Lead: ${task.lead.nombre}`);
    if (task.lead.empresa) {
      lines.push(`🏢 Empresa: ${task.lead.empresa}`);
    }
    lines.push(`🔗 Ver lead: ${appUrl}/dashboard/leads/${task.lead.id}`);
  }
  
  lines.push(`📌 Tipo: ${task.tipo}`);
  
  if (task.descripcion) {
    lines.push('');
    lines.push(`📝 Descripción:`);
    lines.push(task.descripcion);
  }
  
  lines.push('');
  lines.push(`─────────────`);
  lines.push(`Sincronizado desde Volkern CRM`);
  lines.push(`ID: ${task.id}`);
  
  return lines.join('\n');
}

/**
 * Crea una tarea en Google Tasks
 */
export async function createGoogleTask(
  userId: string,
  task: VolkernTask
): Promise<GoogleTaskResult> {
  try {
    // Verificar que la integración de Google Calendar existe
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    
    if (!integration || !integration.activo) {
      return {
        success: false,
        error: 'Google Calendar no está conectado o no está activo',
      };
    }
    
    const tasksClient = await getTasksClient(userId);
    const taskListId = await getOrCreateVolkernTaskList(userId);
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app';
    
    // Crear la tarea en Google
    const googleTask = await tasksClient.tasks.insert({
      tasklist: taskListId,
      requestBody: {
        title: task.titulo,
        notes: formatTaskNotes(task, appUrl),
        due: task.fechaVencimiento.toISOString(),
        status: task.completada ? 'completed' : 'needsAction',
      },
    });
    
    if (!googleTask.data.id) {
      throw new Error('No se recibió ID de la tarea creada');
    }
    
    console.log(`✅ Tarea sincronizada a Google Tasks: ${task.titulo}`);
    
    return {
      success: true,
      googleTaskId: googleTask.data.id,
      googleTaskListId: taskListId,
    };
  } catch (error: any) {
    console.error('❌ Error al crear tarea en Google Tasks:', error.message);
    
    // Si es un error de permisos, indicar que necesita reconectar
    if (error.message?.includes('insufficient') || error.code === 403) {
      return {
        success: false,
        error: 'Se requiere reconectar Google Calendar para sincronizar tareas. Por favor, desconecta y vuelve a conectar la integración.',
      };
    }
    
    return {
      success: false,
      error: error.message || 'Error desconocido',
    };
  }
}

/**
 * Actualiza una tarea existente en Google Tasks
 */
export async function updateGoogleTask(
  userId: string,
  task: VolkernTask,
  googleTaskId: string,
  googleTaskListId: string
): Promise<GoogleTaskResult> {
  try {
    const tasksClient = await getTasksClient(userId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app';
    
    await tasksClient.tasks.update({
      tasklist: googleTaskListId,
      task: googleTaskId,
      requestBody: {
        id: googleTaskId,
        title: task.titulo,
        notes: formatTaskNotes(task, appUrl),
        due: task.fechaVencimiento.toISOString(),
        status: task.completada ? 'completed' : 'needsAction',
      },
    });
    
    console.log(`✅ Tarea actualizada en Google Tasks: ${task.titulo}`);
    
    return {
      success: true,
      googleTaskId,
      googleTaskListId,
    };
  } catch (error: any) {
    console.error('❌ Error al actualizar tarea en Google Tasks:', error.message);
    return {
      success: false,
      error: error.message || 'Error desconocido',
    };
  }
}

/**
 * Elimina una tarea de Google Tasks
 */
export async function deleteGoogleTask(
  userId: string,
  googleTaskId: string,
  googleTaskListId: string
): Promise<GoogleTaskResult> {
  try {
    const tasksClient = await getTasksClient(userId);
    
    await tasksClient.tasks.delete({
      tasklist: googleTaskListId,
      task: googleTaskId,
    });
    
    console.log(`✅ Tarea eliminada de Google Tasks: ${googleTaskId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error al eliminar tarea de Google Tasks:', error.message);
    return {
      success: false,
      error: error.message || 'Error desconocido',
    };
  }
}

/**
 * Marca una tarea como completada en Google Tasks
 */
export async function completeGoogleTask(
  userId: string,
  googleTaskId: string,
  googleTaskListId: string
): Promise<GoogleTaskResult> {
  try {
    const tasksClient = await getTasksClient(userId);
    
    // Primero obtener la tarea actual
    const currentTask = await tasksClient.tasks.get({
      tasklist: googleTaskListId,
      task: googleTaskId,
    });
    
    // Actualizar solo el estado
    await tasksClient.tasks.update({
      tasklist: googleTaskListId,
      task: googleTaskId,
      requestBody: {
        ...currentTask.data,
        status: 'completed',
      },
    });
    
    console.log(`✅ Tarea marcada como completada en Google Tasks`);
    
    return { success: true, googleTaskId, googleTaskListId };
  } catch (error: any) {
    console.error('❌ Error al completar tarea en Google Tasks:', error.message);
    return {
      success: false,
      error: error.message || 'Error desconocido',
    };
  }
}

/**
 * Verifica si la integración de Google Tasks está disponible
 */
export async function checkGoogleTasksIntegration(userId: string): Promise<{
  connected: boolean;
  hasTasksScope: boolean;
  error?: string;
}> {
  try {
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    
    if (!integration || !integration.activo) {
      return {
        connected: false,
        hasTasksScope: false,
        error: 'Google Calendar no está conectado',
      };
    }
    
    // Intentar acceder a Google Tasks para verificar el scope
    try {
      const tasksClient = await getTasksClient(userId);
      await tasksClient.tasklists.list({ maxResults: 1 });
      
      return {
        connected: true,
        hasTasksScope: true,
      };
    } catch (error: any) {
      if (error.code === 403 || error.message?.includes('insufficient')) {
        return {
          connected: true,
          hasTasksScope: false,
          error: 'Se requiere reconectar Google para habilitar sincronización de tareas',
        };
      }
      throw error;
    }
  } catch (error: any) {
    return {
      connected: false,
      hasTasksScope: false,
      error: error.message,
    };
  }
}
