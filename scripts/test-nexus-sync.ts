import { prisma } from '../lib/core/db';

async function testWebhookSync() {
    const TEST_TENANT_ID = 'clvp1234567890abcdefg'; // Usa un ID que exista en tu DB o uno nuevo

    console.log('🧪 Iniciando prueba de sincronización Nexus...');

    try {
        // 1. Asegurar que existe un Lead de prueba
        let lead = await (prisma.lead as any).findFirst({
            where: { tenantId: TEST_TENANT_ID, externalContactRef: 'hub_contact_777' }
        });

        if (!lead) {
            console.log('📝 Creando lead de prueba...');
            lead = await (prisma.lead as any).create({
                data: {
                    nombre: 'Lead de Prueba Nexus',
                    telefono: '+521122334455',
                    email: 'test@nexus.com',
                    tenantId: TEST_TENANT_ID,
                    externalContactRef: 'hub_contact_777'
                }
            });
        }

        // 2. Simular evento "conversation.created"
        console.log('📥 Simulando conversation.created...');
        const convPayload = {
            externalRef: 'hub_conv_888',
            contactRef: 'hub_contact_777',
            channel: 'whatsapp',
            metadata: { source: 'nexus_test' }
        };

        const conv = await (prisma.conversation as any).upsert({
            where: { externalRef: convPayload.externalRef },
            create: {
                tenantId: TEST_TENANT_ID,
                leadId: lead.id,
                externalRef: convPayload.externalRef,
                canal: convPayload.channel,
                contactoNombre: lead.nombre,
                contactoTelefono: lead.telefono,
                hubMetadata: convPayload.metadata,
            },
            update: {
                hubMetadata: convPayload.metadata,
            }
        });
        console.log('✅ Conversación sincronizada:', conv.id);

        // 3. Simular evento "message.received"
        console.log('📥 Simulando message.received...');
        const msgPayload = {
            externalRef: 'hub_msg_999',
            conversationId: 'hub_conv_888',
            content: 'Hola desde el simulador Nexus',
            channel: 'whatsapp',
            metadata: { timestamp: new Date().toISOString() }
        };

        const msg = await (prisma.message as any).upsert({
            where: { externalRef: msgPayload.externalRef },
            create: {
                conversationId: conv.id,
                contenido: msgPayload.content,
                direccion: 'entrante',
                canal: msgPayload.channel,
                estado: 'entregado',
                externalRef: msgPayload.externalRef,
                metadatos: msgPayload.metadata,
            },
            update: {
                metadatos: msgPayload.metadata
            }
        });
        console.log('✅ Mensaje sincronizado:', msg.id);

        // 4. Verificar consistencia
        const finalConv = await (prisma.conversation as any).findUnique({
            where: { id: conv.id },
            include: { mensajes: true }
        });

        if (finalConv && finalConv.mensajes.length > 0) {
            console.log('\n✨ PRUEBA EXITOSA ✨');
            console.log('ID Conversación:', finalConv.id);
            console.log('ID Externo:', finalConv.externalRef);
            console.log('Total Mensajes:', finalConv.mensajes.length);
            console.log('Último Contenido:', finalConv.mensajes[0].contenido);
        } else {
            throw new Error('La consistencia de datos falló');
        }

    } catch (error) {
        console.error('❌ Error en la prueba:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testWebhookSync();
