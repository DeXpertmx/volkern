export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { createGoogleTask } from '@/lib/google-tasks';

/**
 * GET /api/leads/[id]/tasks - Obtener todas las tareas de un lead
 * 
 * Autenticación: Sesión o API Key con permiso 'leads:read'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['leads:read', 'tasks:read']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar que el lead pertenece al tenant
    const lead = await prisma.lead.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant.id
      }
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      );
    }

    const tasks = await prisma.task.findMany({
      where: {
        leadId: params.id,
        tenantId: auth.tenant.id
      },
      include: {
        asignadoUsuario: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { completada: 'asc' },
        { fechaVencimiento: 'asc' }
      ]
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Error al cargar las tareas' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leads/[id]/tasks - Crear una nueva tarea para un lead
 * 
 * Autenticación: Sesión o API Key con permiso 'leads:write' o 'tasks:write'
 * 
 * Body (JSON):
 * {
 *   "tipo": "llamada",           // Requerido: llamada, email, reunion, recordatorio
 *   "titulo": "Llamar al cliente", // Requerido
 *   "descripcion": "Contexto...",  // Opcional
 *   "fechaVencimiento": "2026-02-10T10:00:00Z", // Requerido (ISO 8601)
 *   "asignadoA": "userId"          // Opcional: ID del usuario asignado
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['leads:write', 'tasks:write', 'tasks:create']);
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      );
    }

    const data = await request.json();

    console.log('[POST /api/leads/[id]/tasks] Payload recibido:', JSON.stringify(data, null, 2));

    // Validar campos requeridos
    if (!data.tipo || !data.titulo || !data.fechaVencimiento) {
      const missingFields = [];
      if (!data.tipo) missingFields.push('tipo');
      if (!data.titulo) missingFields.push('titulo');
      if (!data.fechaVencimiento) missingFields.push('fechaVencimiento');

      return NextResponse.json(
        { 
          error: 'Campos requeridos faltantes',
          missingFields,
          hint: 'Campos requeridos: tipo (llamada|email|reunion|recordatorio), titulo, fechaVencimiento (ISO 8601)'
        },
        { status: 400 }
      );
    }

    // Validar tipo de tarea
    const tiposValidos = ['llamada', 'email', 'reunion', 'recordatorio'];
    const tipoNormalizado = data.tipo.toLowerCase();
    if (!tiposValidos.includes(tipoNormalizado)) {
      return NextResponse.json(
        { 
          error: 'Tipo de tarea inválido',
          received: data.tipo,
          validTypes: tiposValidos,
          hint: 'Use uno de: llamada, email, reunion, recordatorio'
        },
        { status: 400 }
      );
    }

    // Verificar que el lead pertenece al tenant
    const lead = await prisma.lead.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant.id
      }
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      );
    }

    // Parsear fecha
    const fechaVencimiento = new Date(data.fechaVencimiento);
    if (isNaN(fechaVencimiento.getTime())) {
      return NextResponse.json(
        { 
          error: 'Formato de fecha inválido',
          received: data.fechaVencimiento,
          hint: 'Use formato ISO 8601, ejemplo: 2026-02-10T10:00:00Z'
        },
        { status: 400 }
      );
    }

    // Crear la tarea
    const task = await prisma.task.create({
      data: {
        tenantId: auth.tenant.id,
        leadId: params.id,
        tipo: tipoNormalizado,
        titulo: data.titulo,
        descripcion: data.descripcion || null,
        fechaVencimiento,
        asignadoA: data.asignadoA || null
      },
      include: {
        lead: {
          select: {
            id: true,
            nombre: true,
            email: true,
            empresa: true
          }
        },
        asignadoUsuario: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Sincronizar con Google Tasks automáticamente
    let googleTasksSync = null;
    try {
      const googleResult = await createGoogleTask(auth.user!.id, {
        id: task.id,
        titulo: task.titulo,
        descripcion: task.descripcion,
        fechaVencimiento: task.fechaVencimiento,
        completada: task.completada,
        tipo: task.tipo,
        lead: task.lead
      });
      
      if (googleResult.success && googleResult.googleTaskId) {
        // Actualizar la tarea con los IDs de Google Tasks
        await prisma.task.update({
          where: { id: task.id },
          data: {
            googleTaskId: googleResult.googleTaskId,
            googleTaskListId: googleResult.googleTaskListId
          }
        });
        
        googleTasksSync = {
          synced: true,
          googleTaskId: googleResult.googleTaskId
        };
        console.log(`[POST /api/leads/[id]/tasks] ✅ Sincronizado con Google Tasks`);
      } else {
        googleTasksSync = {
          synced: false,
          error: googleResult.error
        };
        console.log(`[POST /api/leads/[id]/tasks] ⚠️ No se sincronizó con Google Tasks: ${googleResult.error}`);
      }
    } catch (syncError: any) {
      googleTasksSync = {
        synced: false,
        error: syncError.message
      };
      console.log(`[POST /api/leads/[id]/tasks] ⚠️ Error al sincronizar con Google Tasks: ${syncError.message}`);
    }

    // Audit log (solo si hay usuario autenticado)
    if (auth.user?.id) {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant.id,
          userId: auth.user.id,
          accion: 'CREATE',
          entidad: 'Task',
          entidadId: task.id,
          descripcion: `Tarea "${task.titulo}" creada para lead ${lead.nombre}`,
          cambiosDespues: JSON.stringify({
            tipo: task.tipo,
            titulo: task.titulo,
            fechaVencimiento: task.fechaVencimiento,
            leadId: task.leadId,
            googleTasksSync
          })
        }
      });
    }

    console.log(`[POST /api/leads/[id]/tasks] ✅ Tarea creada: ${task.id}`);

    return NextResponse.json({
      success: true,
      task,
      googleTasksSync
    }, { status: 201 });

  } catch (error: any) {
    console.error('[POST /api/leads/[id]/tasks] Error:', error);
    return NextResponse.json(
      { 
        error: 'Error al crear la tarea',
        details: error?.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}
