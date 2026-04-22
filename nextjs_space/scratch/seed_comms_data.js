const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = 'cmo09jrkc0000mf0ebul7xe9q'; // Volkern CRM
const USER_ID = 'cmo09jwdy0005mf67deumakl6'; // Admin Volkern
const LEAD_IDS = ["cmo1dbka7000lmf0ncvey6wpp", "cmo1dbkaa000nmf0ngtl48xay", "cmo1dbkad000pmf0nppspg62c"];

async function main() {
  console.log('🚀 Iniciando seeding de datos de comunicaciones para Volkern CRM...');

  // 1. Crear Conversaciones
  const conversationsData = [
    { contactoNombre: 'Juan Pérez (Volkern)', contactoTelefono: '+34600000001', canal: 'whatsapp', leadId: LEAD_IDS[0] },
    { contactoNombre: 'María García (Volkern)', contactoEmail: 'maria@example.com', canal: 'email', leadId: LEAD_IDS[1] },
    { contactoNombre: 'Empresa Tech (Volkern)', contactoTelefono: '+34600000002', canal: 'sms', leadId: LEAD_IDS[2] },
  ];

  for (const convData of conversationsData) {
    const conversation = await prisma.conversation.create({
      data: {
        ...convData,
        tenantId: TENANT_ID,
        ultimoMensaje: 'Hola, ¿cómo puedo ayudarte?',
        fechaUltimoMensaje: new Date(),
        estado: 'abierta',
        noLeidos: 1,
      }
    });

    // Crear Mensajes para cada conversación
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          contenido: 'Hola, estoy interesado en sus servicios de Volkern.',
          direccion: 'entrada',
          canal: conversation.canal,
          fechaCreacion: new Date(Date.now() - 3600000),
        },
        {
          conversationId: conversation.id,
          contenido: '¡Claro! Estaré encantado de ayudarte. ¿Qué necesitas saber sobre Volkern?',
          direccion: 'salida',
          canal: conversation.canal,
          fechaCreacion: new Date(Date.now() - 1800000),
        },
        {
          conversationId: conversation.id,
          contenido: '¿Me puedes enviar una cotización de su plan Enterprise?',
          direccion: 'entrada',
          canal: conversation.canal,
          fechaCreacion: new Date(),
        },
      ]
    });
  }
  console.log('✅ Conversaciones y mensajes creados.');

  // 2. Crear Llamadas (Interactions tipo phone_call)
  const callsData = [
    { leadId: LEAD_IDS[0], descripcion: 'Llamada de seguimiento (Volkern)', duracion: 120, resultado: 'answered' },
    { leadId: LEAD_IDS[1], descripcion: 'Intento de contacto inicial (Volkern)', duracion: 0, resultado: 'missed' },
    { leadId: LEAD_IDS[2], descripcion: 'Cierre de venta por teléfono (Volkern)', duracion: 300, resultado: 'answered' },
  ];

  for (const call of callsData) {
    await prisma.interaction.create({
      data: {
        leadId: call.leadId,
        creadoPor: USER_ID,
        tipo: 'phone_call',
        contenido: call.descripcion,
        resultado: call.resultado,
        fechaCreacion: new Date(),
        metadatos: {
          from: '+34900123456',
          to: '+34600000001',
          recordUrl: 'https://storage.volkern.ai/calls/rec_123.mp3',
          duracion: call.duracion
        }
      }
    });
  }
  console.log('✅ Historial de llamadas creado.');

  console.log('✨ Seeding de comunicaciones completado.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
