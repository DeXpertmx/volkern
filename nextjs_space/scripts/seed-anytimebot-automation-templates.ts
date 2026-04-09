
/**
 * Seed script for Anytimebot automation templates
 * Creates pre-configured automation flows for appointment management
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const anytimebotAutomationTemplates = [
  {
    nombre: '🎯 Confirmación de Cita Agendada',
    descripcion: 'Envía automáticamente un email de confirmación cuando se agenda una cita desde Anytimebot',
    categoria: 'citas',
    triggerType: 'cita_creada',
    activo: true,
    popularidad: 0,
    flujo: {
      nodes: [
        {
          id: '1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: {
            triggerType: 'cita_creada',
            label: 'Cita Creada desde Anytimebot',
          },
        },
        {
          id: '2',
          type: 'action',
          position: { x: 100, y: 250 },
          data: {
            actionType: 'enviar_email',
            label: 'Enviar Email de Confirmación',
            config: {
              asunto: 'Confirmación de tu Cita - {nombre_empresa}',
              cuerpo: `Hola {nombre},

¡Gracias por agendar tu cita con nosotros! 🎉

**Detalles de tu Cita:**
📅 Fecha: {cita_fecha}
⏰ Hora: {cita_hora}
⏱️ Duración: {cita_duracion} minutos
📝 Servicio: {cita_servicio}

**Información Importante:**
- Por favor, llega 5 minutos antes de tu cita
- Si necesitas reagendar o cancelar, contáctanos lo antes posible
- Confirma tu asistencia respondiendo a este email

Estamos emocionados de verte pronto.

Saludos cordiales,
{nombre_empresa}`,
              de: '{email_empresa}',
              para: '{lead_email}',
            },
          },
        },
        {
          id: '3',
          type: 'action',
          position: { x: 100, y: 400 },
          data: {
            actionType: 'actualizar_lead',
            label: 'Actualizar Estado del Lead',
            config: {
              campo: 'estado',
              valor: 'cita_agendada',
            },
          },
        },
        {
          id: '4',
          type: 'action',
          position: { x: 100, y: 550 },
          data: {
            actionType: 'agregar_nota',
            label: 'Registrar Nota',
            config: {
              nota: 'Email de confirmación enviado automáticamente el {fecha_actual}',
            },
          },
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4' },
      ],
    },
    tags: ['anytimebot', 'citas', 'confirmacion', 'email'],
    icono: '📧',
    color: '#10b981',
  },
  {
    nombre: '⏰ Recordatorio 24h Antes de la Cita',
    descripcion: 'Envía un recordatorio automático 24 horas antes de la cita agendada',
    categoria: 'citas',
    triggerType: 'cita_proximo_24h',
    activo: true,
    popularidad: 0,
    flujo: {
      nodes: [
        {
          id: '1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: {
            triggerType: 'cita_proximo_24h',
            label: 'Cita en Próximas 24 Horas',
          },
        },
        {
          id: '2',
          type: 'action',
          position: { x: 100, y: 250 },
          data: {
            actionType: 'enviar_email',
            label: 'Enviar Recordatorio por Email',
            config: {
              asunto: '⏰ Recordatorio: Tu cita es mañana',
              cuerpo: `Hola {nombre},

Este es un recordatorio amigable de que tu cita está programada para mañana.

**Detalles de tu Cita:**
📅 Fecha: {cita_fecha}
⏰ Hora: {cita_hora}
📍 Lugar: {cita_ubicacion}
📝 Servicio: {cita_servicio}

**Preparación:**
- Llega 5 minutos antes
- Trae cualquier documento necesario
- Si tienes preguntas, contáctanos

¿Necesitas cambiar la fecha? Avísanos con anticipación.

¡Te esperamos!

{nombre_empresa}`,
              de: '{email_empresa}',
              para: '{lead_email}',
            },
          },
        },
        {
          id: '3',
          type: 'condition',
          position: { x: 100, y: 400 },
          data: {
            label: '¿Tiene WhatsApp?',
            field: 'lead_telefono',
            operator: 'no_vacio',
          },
        },
        {
          id: '4',
          type: 'action',
          position: { x: -50, y: 550 },
          data: {
            actionType: 'enviar_whatsapp',
            label: 'Enviar Recordatorio por WhatsApp',
            config: {
              mensaje: '⏰ Hola {nombre}, recordatorio: tu cita es mañana a las {cita_hora}. ¡Te esperamos! 😊',
              para: '{lead_telefono}',
            },
          },
        },
        {
          id: '5',
          type: 'action',
          position: { x: 250, y: 550 },
          data: {
            actionType: 'crear_tarea',
            label: 'Crear Tarea de Confirmación',
            config: {
              titulo: 'Confirmar asistencia: {nombre}',
              descripcion: 'Verificar que el cliente confirmó su asistencia a la cita',
              fechaVencimiento: '{cita_fecha}',
              prioridad: 'alta',
            },
          },
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4', label: 'Sí' },
        { id: 'e3-5', source: '3', target: '5', label: 'No' },
      ],
    },
    tags: ['anytimebot', 'citas', 'recordatorio', 'whatsapp', 'email'],
    icono: '⏰',
    color: '#f59e0b',
  },
  {
    nombre: '🎥 Enviar Link de Zoom para Cita Virtual',
    descripcion: 'Crea y envía automáticamente un link de Zoom cuando se agenda una cita virtual',
    categoria: 'citas',
    triggerType: 'cita_creada',
    activo: true,
    popularidad: 0,
    flujo: {
      nodes: [
        {
          id: '1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: {
            triggerType: 'cita_creada',
            label: 'Cita Creada desde Anytimebot',
          },
        },
        {
          id: '2',
          type: 'condition',
          position: { x: 100, y: 250 },
          data: {
            label: '¿Es Cita Virtual?',
            field: 'cita_tipo',
            operator: 'igual',
            valor: 'virtual',
          },
        },
        {
          id: '3',
          type: 'action',
          position: { x: 100, y: 400 },
          data: {
            actionType: 'crear_zoom_meeting',
            label: 'Crear Reunión de Zoom',
            config: {
              topic: 'Cita con {nombre}',
              start_time: '{cita_fecha_hora}',
              duration: '{cita_duracion}',
              timezone: 'America/Mexico_City',
            },
          },
        },
        {
          id: '4',
          type: 'action',
          position: { x: 100, y: 550 },
          data: {
            actionType: 'enviar_email',
            label: 'Enviar Link de Zoom',
            config: {
              asunto: '🎥 Link de tu Reunión Virtual - {nombre_empresa}',
              cuerpo: `Hola {nombre},

Tu cita virtual ha sido confirmada. Aquí están los detalles:

📅 Fecha: {cita_fecha}
⏰ Hora: {cita_hora}
⏱️ Duración: {cita_duracion} minutos

**Únete a la Reunión Zoom:**
🔗 Link: {zoom_link}
🔑 ID de Reunión: {zoom_meeting_id}
🔐 Contraseña: {zoom_password}

**Instrucciones:**
1. Haz clic en el link 5 minutos antes
2. Asegúrate de tener buena conexión a internet
3. Activa tu cámara y micrófono
4. Ten a mano cualquier documento necesario

¿Problemas técnicos? Contáctanos por WhatsApp: {telefono_empresa}

¡Nos vemos pronto!

{nombre_empresa}`,
              de: '{email_empresa}',
              para: '{lead_email}',
            },
          },
        },
        {
          id: '5',
          type: 'action',
          position: { x: 300, y: 400 },
          data: {
            actionType: 'finalizar',
            label: 'Cita Presencial - No Requiere Zoom',
          },
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3', label: 'Sí' },
        { id: 'e2-5', source: '2', target: '5', label: 'No' },
        { id: 'e3-4', source: '3', target: '4' },
      ],
    },
    tags: ['anytimebot', 'citas', 'zoom', 'virtual', 'video'],
    icono: '🎥',
    color: '#3b82f6',
  },
  {
    nombre: '🔔 Seguimiento Post-Cita',
    descripcion: 'Envía un email de seguimiento y solicita feedback después de completar una cita',
    categoria: 'citas',
    triggerType: 'cita_completada',
    activo: true,
    popularidad: 0,
    flujo: {
      nodes: [
        {
          id: '1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: {
            triggerType: 'cita_completada',
            label: 'Cita Completada',
          },
        },
        {
          id: '2',
          type: 'delay',
          position: { x: 100, y: 250 },
          data: {
            label: 'Esperar 2 Horas',
            delayType: 'horas',
            delayValue: 2,
          },
        },
        {
          id: '3',
          type: 'action',
          position: { x: 100, y: 400 },
          data: {
            actionType: 'enviar_email',
            label: 'Enviar Email de Seguimiento',
            config: {
              asunto: '¿Cómo fue tu experiencia con nosotros?',
              cuerpo: `Hola {nombre},

¡Gracias por tu tiempo hoy! Esperamos que la reunión haya sido productiva.

Nos encantaría conocer tu opinión:
🌟 ¿Cómo calificarías tu experiencia? [1-5 estrellas]
💬 ¿Tienes algún comentario o sugerencia?

**Próximos Pasos:**
{proximos_pasos}

Si tienes alguna pregunta o necesitas más información, no dudes en contactarnos.

¡Gracias por confiar en nosotros!

{nombre_empresa}

---
📧 {email_empresa}
📞 {telefono_empresa}`,
              de: '{email_empresa}',
              para: '{lead_email}',
            },
          },
        },
        {
          id: '4',
          type: 'action',
          position: { x: 100, y: 550 },
          data: {
            actionType: 'actualizar_score',
            label: 'Aumentar Score del Lead',
            config: {
              operacion: 'incrementar',
              valor: 10,
            },
          },
        },
        {
          id: '5',
          type: 'action',
          position: { x: 100, y: 700 },
          data: {
            actionType: 'crear_tarea',
            label: 'Tarea de Seguimiento',
            config: {
              titulo: 'Seguimiento post-cita: {nombre}',
              descripcion: 'Revisar feedback y programar próximos pasos',
              fechaVencimiento: '+3 días',
              prioridad: 'media',
            },
          },
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4' },
        { id: 'e4-5', source: '4', target: '5' },
      ],
    },
    tags: ['anytimebot', 'citas', 'seguimiento', 'feedback', 'satisfaccion'],
    icono: '🔔',
    color: '#8b5cf6',
  },
  {
    nombre: '❌ Manejo de Citas Canceladas',
    descripcion: 'Gestiona automáticamente citas canceladas desde Anytimebot y ofrece reagendar',
    categoria: 'citas',
    triggerType: 'cita_cancelada',
    activo: true,
    popularidad: 0,
    flujo: {
      nodes: [
        {
          id: '1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: {
            triggerType: 'cita_cancelada',
            label: 'Cita Cancelada',
          },
        },
        {
          id: '2',
          type: 'action',
          position: { x: 100, y: 250 },
          data: {
            actionType: 'enviar_email',
            label: 'Email de Confirmación de Cancelación',
            config: {
              asunto: 'Tu cita ha sido cancelada',
              cuerpo: `Hola {nombre},

Confirmamos la cancelación de tu cita.

**Detalles de la Cita Cancelada:**
📅 Fecha: {cita_fecha}
⏰ Hora: {cita_hora}

¿Cambio de planes? ¡No hay problema!

🔄 ¿Deseas reagendar para otra fecha?
Responde a este email o agenda directamente aquí: {link_agendamiento}

Estamos para ayudarte.

{nombre_empresa}`,
              de: '{email_empresa}',
              para: '{lead_email}',
            },
          },
        },
        {
          id: '3',
          type: 'action',
          position: { x: 100, y: 400 },
          data: {
            actionType: 'actualizar_lead',
            label: 'Actualizar Estado',
            config: {
              campo: 'estado',
              valor: 'cita_cancelada',
            },
          },
        },
        {
          id: '4',
          type: 'delay',
          position: { x: 100, y: 550 },
          data: {
            label: 'Esperar 3 Días',
            delayType: 'dias',
            delayValue: 3,
          },
        },
        {
          id: '5',
          type: 'action',
          position: { x: 100, y: 700 },
          data: {
            actionType: 'enviar_email',
            label: 'Recordatorio para Reagendar',
            config: {
              asunto: '🔄 ¿Ya tienes tiempo para reagendar?',
              cuerpo: `Hola {nombre},

Notamos que cancelaste tu cita hace unos días.

¿Ya encontraste el momento perfecto para reunirnos?

👉 Agenda aquí: {link_agendamiento}

Nuestros horarios disponibles:
📅 Lunes a Viernes: 9:00 AM - 6:00 PM
📅 Sábados: 9:00 AM - 1:00 PM

¡Esperamos verte pronto!

{nombre_empresa}`,
              de: '{email_empresa}',
              para: '{lead_email}',
            },
          },
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
        { id: 'e3-4', source: '3', target: '4' },
        { id: 'e4-5', source: '4', target: '5' },
      ],
    },
    tags: ['anytimebot', 'citas', 'cancelacion', 'reagendar', 'retencion'],
    icono: '❌',
    color: '#ef4444',
  },
];

async function main() {
  console.log('🌱 Seeding Anytimebot automation templates...');

  for (const template of anytimebotAutomationTemplates) {
    const existing = await prisma.automationTemplate.findFirst({
      where: { nombre: template.nombre },
    });

    if (existing) {
      console.log(`⏭️  Template "${template.nombre}" already exists, skipping...`);
      continue;
    }

    await prisma.automationTemplate.create({
      data: template as any,
    });

    console.log(`✅ Created template: ${template.nombre}`);
  }

  console.log('✨ Anytimebot automation templates seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding Anytimebot automation templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
