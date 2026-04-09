import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Templates de n8n según especificación de integración
 * Estos templates se usan desde Volkern, n8n actúa como motor oculto
 */
const n8nTemplates = [
  // 1. Lead AI Enrichment - Trigger: lead_creado → n8n OpenAI analiza lead
  {
    nombre: 'Lead AI Enrichment',
    descripcion: 'Cuando se crea un nuevo lead, n8n usa OpenAI para analizar y enriquecer los datos automáticamente.',
    categoria: 'leads',
    icono: 'Sparkles',
    color: '#9333EA',
    trigger: 'nuevo_lead',
    tags: ['n8n', 'ai', 'openai', 'enriquecimiento', 'leads', 'automatización'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Nuevo Lead', triggerType: 'nuevo_lead', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Analizar con AI (n8n)',
            actionType: 'ejecutar_workflow',
            config: {
              workflowId: '',
              workflowName: 'Lead AI Enrichment',
              timeout: 60000,
              retryCount: 3,
              includeLeadData: true,
              customPayload: JSON.stringify({
                action: 'analyze_lead',
                analyze: ['company_size', 'industry', 'social_presence', 'potential_score'],
                model: 'gpt-4'
              })
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Actualizar Score',
            actionType: 'actualizar_score',
            config: { scoreAdjustment: 10, reason: 'AI Enrichment completado' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 440 },
          data: {
            label: 'Tag AI Enriched',
            actionType: 'asignar_tag',
            config: { tag: 'AI Enriched' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' }
      ]
    }
  },

  // 2. WhatsApp Follow Up - lead_creado → esperar 5 min → whatsapp
  {
    nombre: 'WhatsApp Follow Up',
    descripcion: 'Envía un mensaje de WhatsApp de seguimiento 5 minutos después de crear un nuevo lead.',
    categoria: 'leads',
    icono: 'MessageCircle',
    color: '#25D366',
    trigger: 'nuevo_lead',
    tags: ['whatsapp', 'seguimiento', 'leads', 'automatización', 'comunicación'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Nuevo Lead', triggerType: 'nuevo_lead', config: {} }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 180 },
          data: { label: 'Esperar 5 minutos', delayType: 'minutos', delayValue: 5 }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Enviar WhatsApp',
            actionType: 'enviar_whatsapp',
            config: {
              mensaje: '¡Hola {{nombre}}! 👋\n\nGracias por tu interés. Soy de {{empresa_nombre}} y me gustaría ayudarte.\n\n¿Tienes unos minutos para conversar sobre lo que necesitas?',
              phoneField: 'telefono'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 440 },
          data: {
            label: 'Tag Contactado',
            actionType: 'asignar_tag',
            config: { tag: 'WhatsApp Enviado' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
        { id: 'e2', source: 'delay-1', target: 'action-1' },
        { id: 'e3', source: 'action-1', target: 'action-2' }
      ]
    }
  },

  // 3. Recuperación de Carrito - pago_fallido → esperar 1h → whatsapp → email
  {
    nombre: 'Recuperación de Carrito',
    descripcion: 'Secuencia de recuperación cuando un pago falla: espera 1 hora, envía WhatsApp y luego email.',
    categoria: 'ventas',
    icono: 'ShoppingCart',
    color: '#EF4444',
    trigger: 'pago_fallido',
    tags: ['recuperación', 'carrito', 'pagos', 'whatsapp', 'email', 'ventas'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Pago Fallido', triggerType: 'pago_fallido', config: {} }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 180 },
          data: { label: 'Esperar 1 hora', delayType: 'horas', delayValue: 1 }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'WhatsApp Recuperación',
            actionType: 'enviar_whatsapp',
            config: {
              mensaje: 'Hola {{nombre}} 👋\n\nNotamos que hubo un problema con tu pago. No te preocupes, estas cosas pasan.\n\n¿Necesitas ayuda para completar tu compra? Estoy aquí para ayudarte 🙌',
              phoneField: 'telefono'
            }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 440 },
          data: { label: 'Esperar 30 minutos', delayType: 'minutos', delayValue: 30 }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 570 },
          data: {
            label: 'Email Recuperación',
            actionType: 'enviar_email',
            config: {
              subject: '{{nombre}}, tu compra está esperándote 🛒',
              message: 'Hola {{nombre}},\n\nVimos que tuviste un problema al completar tu pago.\n\nSabemos que estas cosas pasan, por eso queremos ayudarte:\n\n✅ Tu carrito sigue guardado\n✅ Puedes reintentar el pago cuando quieras\n✅ Estamos aquí para resolver cualquier duda\n\nSi tienes alguna pregunta, solo responde este email.\n\n¡Saludos!\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 700 },
          data: {
            label: 'Tag Recuperación',
            actionType: 'asignar_tag',
            config: { tag: 'Secuencia Recuperación Enviada' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
        { id: 'e2', source: 'delay-1', target: 'action-1' },
        { id: 'e3', source: 'action-1', target: 'delay-2' },
        { id: 'e4', source: 'delay-2', target: 'action-2' },
        { id: 'e5', source: 'action-2', target: 'action-3' }
      ]
    }
  },

  // 4. Confirmación de Cita - cita_agendada → email confirmación → whatsapp recordatorio
  {
    nombre: 'Confirmación de Cita',
    descripcion: 'Envía email de confirmación inmediato y WhatsApp de recordatorio cuando se agenda una cita.',
    categoria: 'servicio_cliente',
    icono: 'Calendar',
    color: '#3B82F6',
    trigger: 'cita_agendada',
    tags: ['citas', 'confirmación', 'recordatorio', 'email', 'whatsapp'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Cita Agendada', triggerType: 'cita_agendada', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email Confirmación',
            actionType: 'enviar_email',
            config: {
              subject: '✅ Cita Confirmada - {{cita_titulo}}',
              message: 'Hola {{nombre}},\n\n¡Tu cita ha sido confirmada!\n\n📅 Fecha: {{cita_fecha}}\n⏰ Hora: {{cita_hora}}\n📍 Lugar/Link: {{cita_ubicacion}}\n\nDetalles:\n{{cita_descripcion}}\n\nSi necesitas reprogramar, contáctanos con anticipación.\n\n¡Te esperamos!\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'WhatsApp Recordatorio',
            actionType: 'enviar_whatsapp',
            config: {
              mensaje: '¡Hola {{nombre}}! 📅\n\nTu cita está confirmada:\n\n📆 {{cita_fecha}} a las {{cita_hora}}\n\nTe enviaremos un recordatorio antes de la cita.\n\n¿Tienes alguna pregunta? Escríbenos aquí 👇',
              phoneField: 'telefono'
            }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 440 },
          data: {
            label: 'Tag Confirmada',
            actionType: 'asignar_tag',
            config: { tag: 'Cita Confirmada' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' }
      ]
    }
  },

  // 5. Lead Scoring Automático - lead_actualizado → n8n IA scoring → actualizar score
  {
    nombre: 'Lead Scoring Automático con IA',
    descripcion: 'Cuando un lead se actualiza, n8n calcula un score automático usando IA basado en sus datos.',
    categoria: 'leads',
    icono: 'Target',
    color: '#F59E0B',
    trigger: 'lead_actualizado',
    tags: ['n8n', 'ai', 'scoring', 'leads', 'automatización', 'calificación'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Lead Actualizado', triggerType: 'lead_actualizado', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'IA Scoring (n8n)',
            actionType: 'ejecutar_workflow',
            config: {
              workflowId: '',
              workflowName: 'AI Lead Scoring',
              timeout: 30000,
              retryCount: 2,
              includeLeadData: true,
              customPayload: JSON.stringify({
                action: 'calculate_score',
                factors: ['engagement', 'company_fit', 'budget_signals', 'urgency_indicators'],
                model: 'gpt-4'
              })
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Actualizar Score',
            actionType: 'actualizar_score',
            config: { useExternalScore: true, reason: 'AI Scoring automático' }
          }
        },
        {
          id: 'condition-1',
          type: 'condition',
          position: { x: 250, y: 440 },
          data: {
            label: '¿Score > 80?',
            conditionType: 'lead',
            field: 'scoreValue',
            operator: 'mayor_que',
            value: '80'
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 80, y: 590 },
          data: {
            label: 'Tag Hot Lead',
            actionType: 'asignar_tag',
            config: { tag: '🔥 Hot Lead' }
          }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 80, y: 720 },
          data: {
            label: 'Notificar Ventas',
            actionType: 'enviar_notificacion',
            config: { mensaje: '🔥 Lead caliente detectado: {{nombre}} - Score: {{scoreValue}}' }
          }
        },
        {
          id: 'action-5',
          type: 'action',
          position: { x: 420, y: 590 },
          data: {
            label: 'Tag Scored',
            actionType: 'asignar_tag',
            config: { tag: 'AI Scored' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'condition-1' },
        { id: 'e4', source: 'condition-1', target: 'action-3', label: 'Sí' },
        { id: 'e5', source: 'condition-1', target: 'action-5', label: 'No' },
        { id: 'e6', source: 'action-3', target: 'action-4' }
      ]
    }
  },

  // Templates adicionales de integración n8n
  {
    nombre: 'Respuesta a Workflow n8n Completado',
    descripcion: 'Ejecuta acciones en Volkern cuando un workflow de n8n se completa exitosamente.',
    categoria: 'integraciones',
    icono: 'CheckCircle',
    color: '#10B981',
    trigger: 'n8n_workflow_completado',
    tags: ['n8n', 'callbacks', 'webhooks', 'automatización', 'eventos'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Workflow n8n Completado', triggerType: 'n8n_workflow_completado', config: {} }
        },
        {
          id: 'condition-1',
          type: 'condition',
          position: { x: 250, y: 180 },
          data: {
            label: '¿Tiene Lead?',
            conditionType: 'contexto',
            field: 'leadId',
            operator: 'no_vacio',
            value: ''
          }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 80, y: 330 },
          data: {
            label: 'Actualizar Lead',
            actionType: 'actualizar_lead',
            config: {
              updateField: 'notas',
              updateValue: 'Workflow n8n completado: {{workflowName}} - {{timestamp}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 80, y: 460 },
          data: {
            label: 'Tag Procesado',
            actionType: 'asignar_tag',
            config: { tag: 'n8n Processed' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 420, y: 330 },
          data: {
            label: 'Log Sistema',
            actionType: 'enviar_notificacion',
            config: { mensaje: 'Workflow {{workflowName}} completado sin lead asociado' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'condition-1' },
        { id: 'e2', source: 'condition-1', target: 'action-1', label: 'Sí' },
        { id: 'e3', source: 'condition-1', target: 'action-3', label: 'No' },
        { id: 'e4', source: 'action-1', target: 'action-2' }
      ]
    }
  },
  {
    nombre: 'Manejo de Errores n8n',
    descripcion: 'Captura y gestiona errores de workflows n8n con notificaciones y alertas.',
    categoria: 'integraciones',
    icono: 'AlertTriangle',
    color: '#DC2626',
    trigger: 'n8n_workflow_fallido',
    tags: ['n8n', 'errores', 'alertas', 'monitoreo'],
    esOficial: true,
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Workflow n8n Falló', triggerType: 'n8n_workflow_fallido', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Notificar Admin',
            actionType: 'enviar_notificacion',
            config: { mensaje: '⚠️ ERROR en workflow "{{workflowName}}": {{error}}' }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Email Alerta',
            actionType: 'enviar_email',
            config: {
              subject: '🚨 Error en Automatización n8n',
              message: 'Error detectado:\n\nWorkflow: {{workflowName}}\nError: {{error}}\nTimestamp: {{timestamp}}\n\nRevisa los logs para más detalles.'
            }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 440 },
          data: {
            label: 'Crear Tarea',
            actionType: 'crear_tarea',
            config: {
              titulo: 'URGENTE: Revisar error n8n - {{workflowName}}',
              descripcion: 'Error: {{error}}',
              prioridad: 'alta',
              diasVencimiento: 0
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' }
      ]
    }
  }
];

async function seedN8nTemplates() {
  console.log('🤖 Seeding n8n automation templates según especificación...');
  console.log('='.repeat(60));

  const summary: Record<string, number> = {};

  try {
    for (const template of n8nTemplates) {
      // Verificar si ya existe
      const existing = await prisma.automationTemplate.findFirst({
        where: { nombre: template.nombre }
      });

      if (existing) {
        await prisma.automationTemplate.update({
          where: { id: existing.id },
          data: {
            ...template,
            esOficial: true
          }
        });
        console.log(`✅ Actualizado: ${template.nombre}`);
      } else {
        await prisma.automationTemplate.create({ 
          data: {
            ...template,
            esOficial: true
          }
        });
        console.log(`✅ Creado: ${template.nombre}`);
      }

      // Contabilizar por categoría
      summary[template.categoria] = (summary[template.categoria] || 0) + 1;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Resumen de templates n8n:');
    Object.entries(summary).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} template(s)`);
    });
    console.log(`   TOTAL: ${n8nTemplates.length} templates`);
    console.log('='.repeat(60));
    console.log('\n🎉 Templates n8n seeded successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedN8nTemplates();
