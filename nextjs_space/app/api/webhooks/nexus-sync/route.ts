export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/core/db';
import { validateWebhookSignature } from '@/lib/nexus/webhook-validator';
import { translateHubEvent, TranslatedEvent } from '@/lib/nexus/transformers';

export async function POST(request: NextRequest) {
    try {
        // Obtenemos el payload como texto para validar la firma y luego parseamos
        const rawBody = await request.text();
        const payload = JSON.parse(rawBody);
        const signature = request.headers.get('x-hub-signature') || '';

        // 1️⃣ Validar firma HMAC con el secret del tenant
        const config = await validateWebhookSignature(signature, payload);
        if (!config) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2️⃣ Traducir evento del Hub a evento interno de Volkern
        const internalEvent = translateHubEvent(payload, config.tenantId);

        // 3️⃣ Sincronizar base de datos local
        await syncLocalDatabase(internalEvent);

        return NextResponse.json({
            received: true,
            processedAt: new Date().toISOString(),
            eventId: internalEvent.id
        });

    } catch (error: any) {
        console.error('[Nexus Webhook] Processing error:', error);
        return NextResponse.json(
            { error: 'Processing failed', details: error.message },
            { status: 500 }
        );
    }
}

async function syncLocalDatabase(event: TranslatedEvent) {
    const { data, tenantId } = event;

    switch (event.type) {
        case 'message.received':
        case 'message.sent':
            if (data.externalRef && data.conversationId) {
                // Buscar conversación por ID externo
                const conversation = await (prisma.conversation as any).findUnique({
                    where: { externalRef: data.conversationId }
                });

                if (conversation) {
                    // Crear o actualizar mensaje de forma idempotente
                    await (prisma.message as any).upsert({
                        where: { externalRef: data.externalRef },
                        create: {
                            conversationId: conversation.id,
                            contenido: data.content || '',
                            direccion: event.type === 'message.received' ? 'entrante' : 'saliente',
                            canal: data.channel || (conversation as any).canal,
                            estado: 'entregado',
                            externalRef: data.externalRef,
                            metadatos: data.metadata || {},
                        },
                        update: {
                            contenido: data.content || '',
                            metadatos: data.metadata || {},
                        }
                    });

                    // Actualizar última actividad de la conversación
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: {
                            ultimoMensaje: data.content,
                            fechaUltimoMensaje: new Date(),
                        }
                    });
                }
            }
            break;

        case 'conversation.created':
            if (data.externalRef && data.contactRef) {
                // Buscar Lead por ID de contacto externo
                const lead = await (prisma.lead as any).findFirst({
                    where: {
                        tenantId,
                        externalContactRef: data.contactRef
                    }
                });

                if (lead) {
                    await (prisma.conversation as any).upsert({
                        where: { externalRef: data.externalRef },
                        create: {
                            tenantId,
                            leadId: lead.id,
                            externalRef: data.externalRef,
                            canal: data.channel || 'whatsapp',
                            contactoNombre: lead.nombre,
                            contactoTelefono: lead.telefono,
                            contactoEmail: lead.email,
                            hubMetadata: data.metadata || {},
                        },
                        update: {
                            hubMetadata: data.metadata || {},
                        }
                    });
                }
            }
            break;
    }
}
