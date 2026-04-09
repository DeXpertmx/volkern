export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getTenantDb, dbContext } from '@/lib/db';
import crypto from 'crypto';
import { triggerAutomation } from '@/lib/automation-engine';

// Función auxiliar para extraer valor de payload usando dot notation
function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined;
  
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

// Función auxiliar para validar firma HMAC
function validateSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    // Soporte para formato "sha256=<hash>" o solo "<hash>"
    const providedSignature = signature.replace('sha256=', '').replace('SHA256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  } catch (error) {
    console.error('Error validando firma:', error);
    return false;
  }
}

// POST - Recibir webhook genérico
export async function POST(
  request: NextRequest,
  { params }: { params: { webhookId: string } }
) {
  const startTime = Date.now();
  const { webhookId } = params;

  try {
    console.log('\n=== WEBHOOK RECIBIDO ===');
    console.log('Webhook ID:', webhookId);
    console.log('Timestamp:', new Date().toISOString());

    // 1. Buscar el webhook configurado
    const webhook = await prisma.incomingWebhook.findUnique({
      where: { id: webhookId },
      include: {
        automation: true
      }
    });

    if (!webhook) {
      console.error('❌ Webhook no encontrado');
      return NextResponse.json(
        { error: 'Webhook no encontrado' },
        { status: 404 }
      );
    }

    // Verificar si está activo
    if (!webhook.activo) {
      console.error('❌ Webhook inactivo');
      return NextResponse.json(
        { error: 'Webhook inactivo' },
        { status: 403 }
      );
    }

    // 2. Obtener datos de la request
    const rawBody = await request.text();
    let payload: any;
    
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      // Si no es JSON, guardar como texto
      payload = { raw: rawBody };
    }

    // Obtener headers
    const headers: any = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('IP Address:', ipAddress);

    // Get tenant DB client for all subsequent operations
    const tenantClient = await getTenantDb(webhook.tenantId);

    // 3. Validar firma si hay secret configurado
    if (webhook.secretKey) {
      const signature = headers['x-webhook-signature'] || 
                       headers['x-hub-signature-256'] || 
                       headers['x-signature'];
      
      if (!signature) {
        console.error('❌ Falta firma de seguridad');
        await dbContext.run(
          { tenantId: webhook.tenantId, client: tenantClient },
          async () => {
            await tenantClient.incomingWebhookDelivery.create({
              data: {
                webhookId: webhook.id,
                tenantId: webhook.tenantId,
                metodo: request.method,
                headers,
                payload,
                ipAddress,
                userAgent,
                estado: 'fallido',
                errorMensaje: 'Firma de seguridad requerida pero no proporcionada'
              }
            })
          }
        );
        
        return NextResponse.json(
          { error: 'Firma de seguridad requerida' },
          { status: 401 }
        );
      }

      if (!validateSignature(rawBody, signature, webhook.secretKey)) {
        console.error('❌ Firma inválida');
        await dbContext.run(
          { tenantId: webhook.tenantId, client: tenantClient },
          async () => {
            await tenantClient.incomingWebhookDelivery.create({
              data: {
                webhookId: webhook.id,
                tenantId: webhook.tenantId,
                metodo: request.method,
                headers,
                payload,
                ipAddress,
                userAgent,
                estado: 'fallido',
                errorMensaje: 'Firma de seguridad inválida'
              }
            })
          }
        );
        
        return NextResponse.json(
          { error: 'Firma inválida' },
          { status: 401 }
        );
      }

      console.log('✅ Firma validada correctamente');
    }

    // 4. Procesar según la acción configurada
    let leadCreado: string | null = null;
    let tareaCreada: string | null = null;
    let automationRun: string | null = null;
    let resultado: any = {};

    try {
      await dbContext.run(
        { tenantId: webhook.tenantId, client: tenantClient },
        async () => {
          switch (webhook.accion) {
            case 'crear_lead':
              resultado = await procesarCrearLead(webhook, payload, tenantClient);
              leadCreado = resultado.leadId;
              break;

            case 'actualizar_lead':
              resultado = await procesarActualizarLead(webhook, payload, tenantClient);
              break;

            case 'crear_tarea':
              resultado = await procesarCrearTarea(webhook, payload, tenantClient);
              tareaCreada = resultado.tareaId;
              break;

            case 'disparar_automatizacion':
              if (webhook.automationId) {
                resultado = await triggerAutomation(
                  'webhook_recibido',
                  { 
                    webhookData: payload, 
                    webhookId: webhook.id,
                    tenantId: webhook.tenantId,
                    automationId: webhook.automationId
                  }
                );
                automationRun = resultado?.executionId || null;
              }
              break;

            case 'webhook_personalizado':
              resultado = { message: 'Webhook recibido y registrado' };
              break;

            default:
              throw new Error(`Acción desconocida: ${webhook.accion}`);
          }
        }
      )

      console.log('✅ Acción procesada:', webhook.accion);

    } catch (processingError: any) {
      console.error('❌ Error procesando acción:', processingError);
      
      await dbContext.run(
        { tenantId: webhook.tenantId, client: tenantClient },
        async () => {
          await tenantClient.incomingWebhookDelivery.create({
            data: {
              webhookId: webhook.id,
              tenantId: webhook.tenantId,
              metodo: request.method,
              headers,
              payload,
              ipAddress,
              userAgent,
              estado: 'fallido',
              errorMensaje: processingError.message || 'Error al procesar webhook',
              leadCreado,
              tareaCreada,
              automationRun
            }
          })
        }
      );

      return NextResponse.json(
        { 
          error: 'Error al procesar webhook',
          details: processingError.message 
        },
        { status: 500 }
      );
    }

    // 5. Registrar la entrega exitosa
    await dbContext.run(
      { tenantId: webhook.tenantId, client: tenantClient },
      async () => {
        await tenantClient.incomingWebhookDelivery.create({
          data: {
            webhookId: webhook.id,
            tenantId: webhook.tenantId,
            metodo: request.method,
            headers,
            payload,
            ipAddress,
            userAgent,
            estado: 'exitoso',
            leadCreado,
            tareaCreada,
            automationRun
          }
        })

        // 6. Actualizar estadísticas del webhook
        await tenantClient.incomingWebhook.update({
          where: { id: webhook.id },
          data: {
            totalRecibidos: { increment: 1 },
            ultimoRecibido: new Date()
          }
        })
      }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ Webhook procesado exitosamente en ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: 'Webhook recibido y procesado',
      webhookId: webhook.id,
      action: webhook.accion,
      result: resultado,
      processingTime: duration
    });

  } catch (error: any) {
    console.error('❌ Error general procesando webhook:', error);
    
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        message: error.message 
      },
      { status: 500 }
    );
  }
}

// GET - Obtener información del webhook (para testing)
export async function GET(
  request: NextRequest,
  { params }: { params: { webhookId: string } }
) {
  try {
    const { webhookId } = params;

    const webhook = await prisma.incomingWebhook.findUnique({
      where: { id: webhookId },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        activo: true,
        accion: true,
        totalRecibidos: true,
        ultimoRecibido: true,
        fechaCreacion: true
      }
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      webhook,
      message: 'Para enviar datos a este webhook, usa el método POST',
      example: {
        url: `https://volkern.app/api/webhook/${webhookId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'sha256=<hmac_signature>' // opcional si hay secretKey
        },
        body: {
          ejemplo: 'Tus datos aquí'
        }
      }
    });

  } catch (error: any) {
    console.error('Error obteniendo webhook:', error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500 }
    );
  }
}

// ========== FUNCIONES AUXILIARES DE PROCESAMIENTO ==========

async function procesarCrearLead(webhook: any, payload: any, tenantPrisma: any) {
  const nombre = getNestedValue(payload, webhook.mapeoNombre || 'nombre') || 
                getNestedValue(payload, webhook.mapeoNombre || 'name') ||
                'Lead desde Webhook';
  
  const email = getNestedValue(payload, webhook.mapeoEmail || 'email');
  const telefono = getNestedValue(payload, webhook.mapeoTelefono || 'telefono') ||
                   getNestedValue(payload, webhook.mapeoTelefono || 'phone');
  const empresa = getNestedValue(payload, webhook.mapeoEmpresa || 'empresa') ||
                  getNestedValue(payload, webhook.mapeoEmpresa || 'company');
  const notas = getNestedValue(payload, webhook.mapeoNotas || 'notas') ||
                getNestedValue(payload, webhook.mapeoNotas || 'notes') ||
                `Lead capturado desde webhook ${webhook.nombre}`;

  // Validar que al menos tenga email o teléfono
  if (!email && !telefono) {
    throw new Error('Se requiere email o teléfono para crear el lead');
  }

  // Buscar lead existente por email o teléfono
  let lead;
  if (email) {
    lead = await tenantPrisma.lead.findFirst({
      where: {
        tenantId: webhook.tenantId,
        email
      }
    });
  }

  if (!lead && telefono) {
    lead = await tenantPrisma.lead.findFirst({
      where: {
        tenantId: webhook.tenantId,
        telefono
      }
    });
  }

  if (lead) {
    // Lead existe, actualizar
    lead = await tenantPrisma.lead.update({
      where: { id: lead.id },
      data: {
        nombre: nombre || lead.nombre,
        empresa: empresa || lead.empresa,
        notas: `${lead.notas || ''}\n\n[Webhook ${new Date().toISOString()}] ${notas}`,
        fechaUltimaActividad: new Date(),
        tags: lead.tags || 'webhook'
      }
    });

    await tenantPrisma.auditLog.create({
      data: {
        tenantId: webhook.tenantId,
        userId: webhook.userId,
        accion: 'actualizar',
        entidad: 'lead',
        entidadId: lead.id,
        descripcion: `Lead actualizado desde webhook: ${webhook.nombre}`
      }
    });

    return {
      leadId: lead.id,
      action: 'updated',
      lead
    };
  } else {
    // Crear nuevo lead
    lead = await tenantPrisma.lead.create({
      data: {
        tenantId: webhook.tenantId,
        nombre,
        email: email || null,
        telefono: telefono || null,
        empresa: empresa || null,
        notas,
        fuente: `webhook_${webhook.nombre.toLowerCase().replace(/\s+/g, '_')}`,
        estado: 'nuevo',
        scoreValue: 30, // Score inicial para leads de webhook
        tags: `webhook,${webhook.nombre}`,
        fechaUltimaActividad: new Date()
      }
    });

    await tenantPrisma.auditLog.create({
      data: {
        tenantId: webhook.tenantId,
        userId: webhook.userId,
        accion: 'crear',
        entidad: 'lead',
        entidadId: lead.id,
        descripcion: `Lead creado desde webhook: ${webhook.nombre}`
      }
    });

    return {
      leadId: lead.id,
      action: 'created',
      lead
    };
  }
}

async function procesarActualizarLead(webhook: any, payload: any, tenantPrisma: any) {
  const email = getNestedValue(payload, webhook.mapeoEmail || 'email');
  const telefono = getNestedValue(payload, webhook.mapeoTelefono || 'telefono');

  if (!email && !telefono) {
    throw new Error('Se requiere email o teléfono para actualizar el lead');
  }

  // Buscar lead
  let lead;
  if (email) {
    lead = await tenantPrisma.lead.findFirst({
      where: { tenantId: webhook.tenantId, email }
    });
  }

  if (!lead && telefono) {
    lead = await tenantPrisma.lead.findFirst({
      where: { tenantId: webhook.tenantId, telefono }
    });
  }

  if (!lead) {
    throw new Error('Lead no encontrado');
  }

  // Extraer campos a actualizar
  const updateData: any = {
    fechaUltimaActividad: new Date()
  };

  if (webhook.mapeoNombre) {
    const nombre = getNestedValue(payload, webhook.mapeoNombre);
    if (nombre) updateData.nombre = nombre;
  }

  if (webhook.mapeoEmpresa) {
    const empresa = getNestedValue(payload, webhook.mapeoEmpresa);
    if (empresa) updateData.empresa = empresa;
  }

  if (webhook.mapeoNotas) {
    const notas = getNestedValue(payload, webhook.mapeoNotas);
    if (notas) {
      updateData.notas = `${lead.notas || ''}\n\n[Webhook ${new Date().toISOString()}] ${notas}`;
    }
  }

  // Aplicar mapeo personalizado
  if (webhook.mapeoCustom) {
    // El mapeo custom se puede usar para actualizar campos adicionales
    const customData = webhook.mapeoCustom as Record<string, string>;
    for (const [dbField, payloadPath] of Object.entries(customData)) {
      const value = getNestedValue(payload, payloadPath);
      if (value !== undefined) {
        updateData[dbField] = value;
      }
    }
  }

  // Actualizar lead
  const updatedLead = await tenantPrisma.lead.update({
    where: { id: lead.id },
    data: updateData
  });

  await tenantPrisma.auditLog.create({
    data: {
      tenantId: webhook.tenantId,
      userId: webhook.userId,
      accion: 'actualizar',
      entidad: 'lead',
      entidadId: lead.id,
      descripcion: `Lead actualizado desde webhook: ${webhook.nombre}`
    }
  });

  return {
    leadId: updatedLead.id,
    action: 'updated',
    lead: updatedLead
  };
}

async function procesarCrearTarea(webhook: any, payload: any, tenantPrisma: any) {
  const titulo = getNestedValue(payload, 'titulo') || 
                 getNestedValue(payload, 'title') ||
                 `Tarea desde webhook ${webhook.nombre}`;
  
  const descripcion = getNestedValue(payload, 'descripcion') ||
                      getNestedValue(payload, 'description') ||
                      JSON.stringify(payload, null, 2);

  const fechaVencimientoStr = getNestedValue(payload, 'fechaVencimiento') ||
                               getNestedValue(payload, 'dueDate');

  // Buscar lead asociado si hay email o teléfono
  let leadId: string | null = null;
  const email = getNestedValue(payload, 'email');
  const telefono = getNestedValue(payload, 'telefono');

  if (email || telefono) {
    const lead = await tenantPrisma.lead.findFirst({
      where: {
        tenantId: webhook.tenantId,
        OR: [
          email ? { email } : {},
          telefono ? { telefono } : {}
        ]
      }
    });

    if (lead) {
      leadId = lead.id;
    }
  }

  // Si no se encuentra lead, buscar el primer lead del tenant
  if (!leadId) {
    const firstLead = await tenantPrisma.lead.findFirst({
      where: { tenantId: webhook.tenantId }
    });
    
    if (!firstLead) {
      throw new Error('No hay leads disponibles para crear la tarea. Crea al menos un lead primero.');
    }
    
    leadId = firstLead.id;
  }

  // Fecha de vencimiento: usar la proporcionada o 7 días desde hoy
  const fechaVencimiento = fechaVencimientoStr 
    ? new Date(fechaVencimientoStr) 
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Crear tarea
  const tarea = await tenantPrisma.task.create({
    data: {
      tenantId: webhook.tenantId,
      titulo,
      descripcion,
      tipo: 'recordatorio',
      leadId,
      fechaVencimiento,
      completada: false
    }
  });

  await tenantPrisma.auditLog.create({
    data: {
      tenantId: webhook.tenantId,
      userId: webhook.userId,
      accion: 'crear',
      entidad: 'task',
      entidadId: tarea.id,
      descripcion: `Tarea creada desde webhook: ${webhook.nombre}`
    }
  });

  return {
    tareaId: tarea.id,
    action: 'created',
    tarea
  };
}
