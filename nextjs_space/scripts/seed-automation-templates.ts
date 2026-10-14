import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES GENERALES (CORREGIDOS)
  // ═══════════════════════════════════════════════════════════════
  {
    nombre: 'Secuencia de Bienvenida para Nuevos Leads',
    descripcion: 'Automatización completa para dar la bienvenida a nuevos leads con emails personalizados, SMS y seguimiento automático.',
    categoria: 'leads',
    icono: 'UserPlus',
    color: '#3B82F6',
    trigger: 'nuevo_lead',
    tags: ['bienvenida', 'onboarding', 'leads', 'email', 'sms'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Nuevo Lead Creado', triggerType: 'nuevo_lead', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Bienvenida',
            actionType: 'enviar_email',
            config: {
              asunto: '¡Bienvenido a {{empresa_nombre}}! 🎉',
              mensaje: 'Hola {{nombre}},\n\n¡Muchas gracias por tu interés en nuestros servicios!\n\nEstamos emocionados de poder ayudarte. En los próximos días, te estaremos compartiendo información valiosa.\n\nSi tienes alguna pregunta, no dudes en responder este email.\n\n¡Un abrazo!\nEl equipo de {{empresa_nombre}}'
            }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 310 },
          data: { label: 'Esperar 2 horas', delayType: 'horas', delayValue: 2 }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'SMS de Seguimiento',
            actionType: 'enviar_sms',
            config: { mensaje: 'Hola {{nombre}}! Soy {{usuario_nombre}} de {{empresa_nombre}}. ¿Recibiste mi email? Estoy aquí para ayudarte. 😊' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'Agregar Tag',
            actionType: 'asignar_tag',
            config: { tag: 'Bienvenida Enviada' }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 640 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 750 },
          data: {
            label: 'Email de Seguimiento',
            actionType: 'enviar_email',
            config: {
              asunto: '¿Cómo podemos ayudarte? 💬',
              mensaje: 'Hola {{nombre}},\n\nHace unos días te dimos la bienvenida y queríamos saber cómo podemos ayudarte.\n\n¿Tienes alguna pregunta sobre nuestros servicios?\n¿Te gustaría agendar una llamada?\n\nEstamos aquí para ayudarte.\n\nSaludos,\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'action-5',
          type: 'action',
          position: { x: 250, y: 860 },
          data: {
            label: 'Crear Tarea de Seguimiento',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Llamar a {{nombre}} - Seguimiento Bienvenida',
              descripcion: 'Realizar llamada de seguimiento después de secuencia de bienvenida',
              prioridad: 'media',
              diasVencimiento: 2
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'delay-1' },
        { id: 'e3', source: 'delay-1', target: 'action-2' },
        { id: 'e4', source: 'action-2', target: 'action-3' },
        { id: 'e5', source: 'action-3', target: 'delay-2' },
        { id: 'e6', source: 'delay-2', target: 'action-4' },
        { id: 'e7', source: 'action-4', target: 'action-5' }
      ]
    }
  },
  {
    nombre: 'Recuperación de Pagos Fallidos',
    descripcion: 'Secuencia automatizada para recuperar clientes con pagos fallidos o incompletos.',
    categoria: 'ventas',
    icono: 'CreditCard',
    color: '#F59E0B',
    trigger: 'pago_fallido',
    tags: ['recuperación', 'pagos', 'ventas', 'conversión'],
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
          position: { x: 250, y: 290 },
          data: {
            label: 'Email Recordatorio',
            actionType: 'enviar_email',
            config: {
              asunto: '¡Hubo un problema con tu pago! 💳',
              mensaje: 'Hola {{nombre}},\n\nNotamos que hubo un problema procesando tu pago.\n\n¿Tuviste algún inconveniente? Estamos aquí para ayudarte.\n\n[Reintentar Pago]\n\nSaludos,\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 420 },
          data: { label: 'Esperar 12 horas', delayType: 'horas', delayValue: 12 }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'WhatsApp de Ayuda',
            actionType: 'enviar_whatsapp',
            config: { mensaje: 'Hola {{nombre}} 👋 Notamos que hubo un problema con tu pago. ¿Puedo ayudarte a resolverlo?' }
          }
        },
        {
          id: 'delay-3',
          type: 'delay',
          position: { x: 250, y: 660 },
          data: { label: 'Esperar 24 horas', delayType: 'horas', delayValue: 24 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 770 },
          data: {
            label: 'Crear Tarea Urgente',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Llamar a {{nombre}} - Pago Fallido',
              descripcion: 'Cliente con pago fallido - requiere seguimiento urgente',
              prioridad: 'alta'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
        { id: 'e2', source: 'delay-1', target: 'action-1' },
        { id: 'e3', source: 'action-1', target: 'delay-2' },
        { id: 'e4', source: 'delay-2', target: 'action-2' },
        { id: 'e5', source: 'action-2', target: 'delay-3' },
        { id: 'e6', source: 'delay-3', target: 'action-3' }
      ]
    }
  },
  {
    nombre: 'Nurturing de Leads Sin Respuesta',
    descripcion: 'Reactiva leads que no han respondido en 24 horas con seguimiento estratégico.',
    categoria: 'leads',
    icono: 'Flame',
    color: '#EF4444',
    trigger: 'lead_sin_respuesta',
    tags: ['nurturing', 'reactivación', 'leads', 'engagement'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Lead Sin Respuesta 24h', triggerType: 'lead_sin_respuesta', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Actualizar Score',
            actionType: 'actualizar_score',
            config: { scoreValue: -5, motivo: 'Lead sin respuesta 24h' }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 290 },
          data: {
            label: 'Email de Reactivación',
            actionType: 'enviar_email',
            config: {
              asunto: '¿Seguimos en contacto, {{nombre}}? 👋',
              mensaje: 'Hola {{nombre}},\n\nTe escribimos ayer y queríamos saber si recibiste nuestro mensaje.\n\n¿Te gustaría agendar una llamada rápida para conocer más?\n\nEstamos aquí para ti,\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 420 },
          data: { label: 'Esperar 2 días', delayType: 'dias', delayValue: 2 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'WhatsApp Personal',
            actionType: 'enviar_whatsapp',
            config: { mensaje: 'Hola {{nombre}}, soy {{usuario_nombre}}. ¿Recibiste mi mensaje? Estoy disponible si necesitas información 😊' }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 660 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 770 },
          data: {
            label: 'Crear Tarea Final',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Última llamada - {{nombre}}',
              descripcion: 'Lead sin respuesta después de múltiples intentos',
              prioridad: 'baja'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'delay-1' },
        { id: 'e4', source: 'delay-1', target: 'action-3' },
        { id: 'e5', source: 'action-3', target: 'delay-2' },
        { id: 'e6', source: 'delay-2', target: 'action-4' }
      ]
    }
  },
  {
    nombre: 'Onboarding de Estudiantes',
    descripcion: 'Guía paso a paso para nuevos estudiantes, asegurando que completen su perfil y accedan al primer módulo.',
    categoria: 'cursos',
    icono: 'GraduationCap',
    color: '#8B5CF6',
    trigger: 'estudiante_inscrito',
    tags: ['onboarding', 'estudiantes', 'cursos', 'educación'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Estudiante Inscrito', triggerType: 'estudiante_inscrito', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Bienvenida',
            actionType: 'enviar_email',
            config: {
              asunto: '¡Bienvenido a {{curso_nombre}}! 🎉',
              mensaje: '¡Felicidades {{nombre}}!\n\nHas dado el primer paso. Estamos emocionados de acompañarte.\n\n🎯 Primeros pasos:\n1. Completa tu perfil\n2. Descarga recursos\n3. Comienza Módulo 1\n\n[Acceder al Curso]\n\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'WhatsApp con Video',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '🎓 ¡Hola {{nombre}}! Te doy la bienvenida al curso. Aquí tu video de introducción: {{video_url}}' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 440 },
          data: { label: 'Esperar 2 días', delayType: 'dias', delayValue: 2 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 550 },
          data: {
            label: 'Email de Recordatorio',
            actionType: 'enviar_email',
            config: {
              asunto: '¿Todo bien con el curso? 🤔',
              mensaje: 'Hola {{nombre}},\n\n¿Ya pudiste acceder al curso?\n\n¿Hay algo que te detenga? Responde este email y te ayudo.\n\n[Comenzar Mi Curso]\n\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 680 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 790 },
          data: {
            label: 'Crear Tarea de Llamada',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Llamar a {{nombre}} - Nuevo Estudiante',
              descripcion: 'Ofrecer ayuda y motivación al nuevo estudiante',
              prioridad: 'media'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'delay-1' },
        { id: 'e4', source: 'delay-1', target: 'action-3' },
        { id: 'e5', source: 'action-3', target: 'delay-2' },
        { id: 'e6', source: 'delay-2', target: 'action-4' }
      ]
    }
  },
  {
    nombre: 'Seguimiento Post-Pago',
    descripcion: 'Mantén a tus clientes satisfechos con seguimiento automático, solicitud de testimonios y ofertas.',
    categoria: 'servicio_cliente',
    icono: 'Heart',
    color: '#10B981',
    trigger: 'pago_recibido',
    tags: ['post-venta', 'satisfacción', 'testimonios', 'upselling'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Pago Recibido', triggerType: 'pago_recibido', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Agradecimiento',
            actionType: 'enviar_email',
            config: {
              asunto: '¡Gracias por tu compra! 🎉',
              mensaje: '¡Hola {{nombre}}!\n\nMuchas gracias por confiar en {{empresa_nombre}}.\n\n🔑 Acceso inmediato:\n[Acceder Ahora]\n\n¿Necesitas ayuda?\nResponde este email.\n\n¡Bienvenido!\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Actualizar Estado',
            actionType: 'actualizar_lead',
            config: { campo: 'estado', valor: 'cliente' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Agregar Tag Cliente',
            actionType: 'asignar_tag',
            config: { tag: 'Cliente Activo' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 530 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 640 },
          data: {
            label: 'Email de Seguimiento',
            actionType: 'enviar_email',
            config: {
              asunto: '¿Cómo va todo? 😊',
              mensaje: 'Hola {{nombre}},\n\n¿Has podido acceder sin problemas?\n\n¿Tienes alguna pregunta?\n\nResponde este email o agenda una llamada.\n\nSaludos,\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 770 },
          data: { label: 'Esperar 7 días', delayType: 'dias', delayValue: 7 }
        },
        {
          id: 'action-5',
          type: 'action',
          position: { x: 250, y: 880 },
          data: {
            label: 'Solicitud de Testimonio',
            actionType: 'enviar_email',
            config: {
              asunto: '¿Me ayudas con un favor? ⭐',
              mensaje: 'Hola {{nombre}},\n\n¿Podrías compartir tu opinión sobre nuestro servicio?\n\n[Dejar Mi Testimonio]\n\nTu feedback es muy valioso.\n\n¡Gracias!\n{{usuario_nombre}}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' },
        { id: 'e4', source: 'action-3', target: 'delay-1' },
        { id: 'e5', source: 'delay-1', target: 'action-4' },
        { id: 'e6', source: 'action-4', target: 'delay-2' },
        { id: 'e7', source: 'delay-2', target: 'action-5' }
      ]
    }
  },
  {
    nombre: 'Celebración de Curso Completado',
    descripcion: 'Felicita a los estudiantes que completan un curso y ofréceles el siguiente paso.',
    categoria: 'cursos',
    icono: 'Award',
    color: '#EC4899',
    trigger: 'estudiante_completa_curso',
    tags: ['graduación', 'estudiantes', 'certificados', 'upselling'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Curso Completado', triggerType: 'estudiante_completa_curso', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Felicitación',
            actionType: 'enviar_email',
            config: {
              asunto: '🎓 ¡FELICIDADES! Has completado {{curso_nombre}}',
              mensaje: '¡Increíble {{nombre}}!\n\n🎉 ¡LO LOGRASTE!\n\nHas completado exitosamente el curso "{{curso_nombre}}".\n\n📜 Tu certificado está listo para descargar.\n\n[Descargar Mi Certificado]\n\n¡Estamos muy orgullosos de ti!\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Enviar Certificado',
            actionType: 'enviar_certificado',
            config: {}
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'WhatsApp de Felicitación',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '🎓 ¡Felicidades {{nombre}}! Has completado el curso. Tu certificado ya está disponible. ¡Increíble logro! 🎉' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 550 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 660 },
          data: {
            label: 'Email Siguiente Curso',
            actionType: 'enviar_email',
            config: {
              asunto: '🚀 ¿Listo para el siguiente nivel?',
              mensaje: 'Hola {{nombre}},\n\nAhora que completaste "{{curso_nombre}}", ¿te gustaría continuar tu aprendizaje?\n\n🎯 Curso recomendado para ti:\n{{curso_siguiente}}\n\n[Ver Curso Avanzado]\n\n{{usuario_nombre}}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' },
        { id: 'e4', source: 'action-3', target: 'delay-1' },
        { id: 'e5', source: 'delay-1', target: 'action-4' }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES PARA BIENES RAÍCES / INMOBILIARIAS
  // ═══════════════════════════════════════════════════════════════
  {
    nombre: '🏠 Inmobiliaria: Nuevo Lead Interesado',
    descripcion: 'Secuencia de bienvenida para prospectos interesados en comprar o rentar propiedades.',
    categoria: 'inmobiliaria',
    icono: 'Home',
    color: '#059669',
    trigger: 'nuevo_lead',
    tags: ['inmobiliaria', 'bienes raíces', 'propiedades', 'ventas'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Nuevo Lead Inmobiliaria', triggerType: 'nuevo_lead', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Bienvenida',
            actionType: 'enviar_email',
            config: {
              asunto: '🏠 ¡Gracias por tu interés! Encontremos tu propiedad ideal',
              mensaje: 'Hola {{nombre}},\n\n¡Gracias por contactarnos!\n\nSomos especialistas en bienes raíces y estamos aquí para ayudarte a encontrar la propiedad perfecta.\n\n📋 Para conocerte mejor:\n• ¿Buscas comprar o rentar?\n• ¿Qué zona prefieres?\n• ¿Cuál es tu presupuesto aproximado?\n\nResponde este email o llámame directamente.\n\n🏡 Tu agente:\n{{usuario_nombre}}\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Tag Prospecto Nuevo',
            actionType: 'asignar_tag',
            config: { tag: 'Prospecto Inmobiliario' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 420 },
          data: { label: 'Esperar 4 horas', delayType: 'horas', delayValue: 4 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'WhatsApp con Propiedades',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '¡Hola {{nombre}}! 🏠 Soy {{usuario_nombre}} de {{empresa_nombre}}. Te comparto algunas propiedades que podrían interesarte. ¿Cuándo podemos agendar una visita?' }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 660 },
          data: { label: 'Esperar 2 días', delayType: 'dias', delayValue: 2 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 770 },
          data: {
            label: 'Email con Propiedades',
            actionType: 'enviar_email',
            config: {
              asunto: '📸 Propiedades seleccionadas para ti',
              mensaje: 'Hola {{nombre}},\n\nBasado en tu búsqueda, te comparto estas propiedades destacadas:\n\n🏡 Propiedad 1: [Link]\n🏡 Propiedad 2: [Link]\n🏡 Propiedad 3: [Link]\n\n¿Te gustaría agendar una visita?\n\n[Agendar Visita]\n\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'action-5',
          type: 'action',
          position: { x: 250, y: 880 },
          data: {
            label: 'Crear Tarea Seguimiento',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Llamar a {{nombre}} - Prospecto Inmobiliario',
              descripcion: 'Confirmar interés y agendar visita a propiedades',
              prioridad: 'alta'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'delay-1' },
        { id: 'e4', source: 'delay-1', target: 'action-3' },
        { id: 'e5', source: 'action-3', target: 'delay-2' },
        { id: 'e6', source: 'delay-2', target: 'action-4' },
        { id: 'e7', source: 'action-4', target: 'action-5' }
      ]
    }
  },
  {
    nombre: '🏠 Inmobiliaria: Visita Agendada',
    descripcion: 'Recordatorios y seguimiento para visitas a propiedades programadas.',
    categoria: 'inmobiliaria',
    icono: 'Calendar',
    color: '#0891B2',
    trigger: 'cita_agendada',
    tags: ['inmobiliaria', 'visitas', 'propiedades', 'citas'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Visita Agendada', triggerType: 'cita_agendada', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Confirmación de Visita',
            actionType: 'enviar_email',
            config: {
              asunto: '✅ Visita confirmada - {{titulo}}',
              mensaje: 'Hola {{nombre}},\n\n¡Tu visita está confirmada!\n\n📅 Fecha: {{fecha}}\n⏰ Hora: {{hora}}\n📍 Dirección: {{direccion}}\n\n📋 Qué necesitas:\n• Identificación oficial\n• Comprobante de ingresos (si aplica)\n\n¿Tienes preguntas? Responde este email.\n\n{{usuario_nombre}}\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'WhatsApp con Ubicación',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '📍 ¡Hola {{nombre}}! Tu visita está confirmada para {{fecha}} a las {{hora}}. Aquí la ubicación: {{google_maps_link}} ¡Te esperamos!' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Tag Visita Programada',
            actionType: 'asignar_tag',
            config: { tag: 'Visita Programada' }
          }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'Crear Tarea Preparar Visita',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Preparar visita - {{nombre}}',
              descripcion: 'Confirmar disponibilidad de propiedad y preparar documentación',
              prioridad: 'alta'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' },
        { id: 'e4', source: 'action-3', target: 'action-4' }
      ]
    }
  },
  {
    nombre: '🏠 Inmobiliaria: Post-Visita Seguimiento',
    descripcion: 'Seguimiento automatizado después de una visita a propiedad para cerrar la venta.',
    categoria: 'inmobiliaria',
    icono: 'MessageSquare',
    color: '#7C3AED',
    trigger: 'cita_confirmada',
    tags: ['inmobiliaria', 'post-visita', 'cierre', 'ventas'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Visita Completada', triggerType: 'cita_confirmada', config: {} }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 180 },
          data: { label: 'Esperar 2 horas', delayType: 'horas', delayValue: 2 }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 290 },
          data: {
            label: 'Email Post-Visita',
            actionType: 'enviar_email',
            config: {
              asunto: '🏡 ¿Qué te pareció la propiedad?',
              mensaje: 'Hola {{nombre}},\n\n¡Gracias por visitar la propiedad!\n\n¿Qué te pareció? Me encantaría conocer tu opinión:\n\n• ¿Cumplió tus expectativas?\n• ¿Tienes alguna duda?\n• ¿Te gustaría ver otras opciones?\n\n📞 Estoy disponible para resolver cualquier pregunta.\n\n{{usuario_nombre}}\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 420 },
          data: { label: 'Esperar 1 día', delayType: 'dias', delayValue: 1 }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'WhatsApp de Seguimiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '¡Hola {{nombre}}! 🏠 ¿Pudiste pensar sobre la propiedad? Si tienes dudas o quieres ver más opciones, estoy aquí para ayudarte.' }
          }
        },
        {
          id: 'delay-3',
          type: 'delay',
          position: { x: 250, y: 660 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 770 },
          data: {
            label: 'Email con Opciones Similares',
            actionType: 'enviar_email',
            config: {
              asunto: '📸 Más propiedades que podrían gustarte',
              mensaje: 'Hola {{nombre}},\n\nBuscando opciones similares encontré estas propiedades:\n\n🏡 Opción 1: [Link]\n🏡 Opción 2: [Link]\n\n¿Te gustaría visitarlas?\n\n[Agendar Nueva Visita]\n\n{{usuario_nombre}}'
            }
          }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 880 },
          data: {
            label: 'Tarea Cierre de Venta',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Seguimiento cierre - {{nombre}}',
              descripcion: 'Prospecto visitó propiedad, hacer seguimiento para cierre',
              prioridad: 'alta'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
        { id: 'e2', source: 'delay-1', target: 'action-1' },
        { id: 'e3', source: 'action-1', target: 'delay-2' },
        { id: 'e4', source: 'delay-2', target: 'action-2' },
        { id: 'e5', source: 'action-2', target: 'delay-3' },
        { id: 'e6', source: 'delay-3', target: 'action-3' },
        { id: 'e7', source: 'action-3', target: 'action-4' }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES PARA BARBERÍAS Y ESTÉTICAS
  // ═══════════════════════════════════════════════════════════════
  {
    nombre: '💇 Barbería: Nuevo Cliente',
    descripcion: 'Bienvenida para nuevos clientes de barbería o salón de belleza.',
    categoria: 'belleza',
    icono: 'Scissors',
    color: '#F97316',
    trigger: 'nuevo_lead',
    tags: ['barbería', 'estética', 'salón', 'belleza'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Nuevo Cliente', triggerType: 'nuevo_lead', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'WhatsApp Bienvenida',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '¡Hola {{nombre}}! 💇 Gracias por elegir {{empresa_nombre}}. ¿Te gustaría agendar tu primera cita? Tenemos disponibilidad esta semana. 📅' }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Tag Nuevo Cliente',
            actionType: 'asignar_tag',
            config: { tag: 'Cliente Nuevo' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 420 },
          data: { label: 'Esperar 1 día', delayType: 'dias', delayValue: 1 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'Email con Servicios',
            actionType: 'enviar_email',
            config: {
              asunto: '✨ Conoce nuestros servicios - {{empresa_nombre}}',
              mensaje: 'Hola {{nombre}},\n\n¡Bienvenido a {{empresa_nombre}}!\n\n💈 Nuestros servicios:\n• Corte clásico\n• Afeitado tradicional\n• Diseño de barba\n• Tratamientos capilares\n\n🎁 ¡Primera visita con 15% de descuento!\n\n[Agendar Mi Cita]\n\n¡Te esperamos!'
            }
          }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 660 },
          data: {
            label: 'Crear Tarea Seguimiento',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Confirmar cita - {{nombre}}',
              descripcion: 'Nuevo cliente, confirmar si agendó su primera cita',
              prioridad: 'media'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'delay-1' },
        { id: 'e4', source: 'delay-1', target: 'action-3' },
        { id: 'e5', source: 'action-3', target: 'action-4' }
      ]
    }
  },
  {
    nombre: '💇 Barbería: Recordatorio de Cita',
    descripcion: 'Recordatorios automáticos para citas en barbería o salón.',
    categoria: 'belleza',
    icono: 'Bell',
    color: '#DC2626',
    trigger: 'cita_agendada',
    tags: ['barbería', 'estética', 'recordatorio', 'citas'],
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
            label: 'Confirmación WhatsApp',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '✅ ¡Cita confirmada {{nombre}}!\n\n📅 {{fecha}}\n⏰ {{hora}}\n💈 Servicio: {{servicio}}\n\n¡Te esperamos en {{empresa_nombre}}!' }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Email de Confirmación',
            actionType: 'enviar_email',
            config: {
              asunto: '✅ Tu cita está confirmada - {{empresa_nombre}}',
              mensaje: 'Hola {{nombre}},\n\n¡Tu cita está confirmada!\n\n📅 Fecha: {{fecha}}\n⏰ Hora: {{hora}}\n💈 Servicio: {{servicio}}\n📍 Dirección: {{direccion}}\n\n⚠️ Si necesitas cancelar, avísanos con 2 horas de anticipación.\n\n¡Te esperamos!\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Tag Cita Activa',
            actionType: 'asignar_tag',
            config: { tag: 'Cita Pendiente' }
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
  {
    nombre: '💇 Barbería: Post-Servicio',
    descripcion: 'Seguimiento después del servicio para fidelización y re-agendamiento.',
    categoria: 'belleza',
    icono: 'Star',
    color: '#FBBF24',
    trigger: 'cita_confirmada',
    tags: ['barbería', 'estética', 'fidelización', 'reseñas'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Servicio Completado', triggerType: 'cita_confirmada', config: {} }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 180 },
          data: { label: 'Esperar 2 horas', delayType: 'horas', delayValue: 2 }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 290 },
          data: {
            label: 'WhatsApp Agradecimiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '¡Gracias por visitarnos {{nombre}}! 💈 ¿Qué te pareció tu corte? ¡Tu opinión es muy importante! ⭐⭐⭐⭐⭐' }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Agregar Tag Fidelización',
            actionType: 'asignar_tag',
            config: { tag: 'Cliente Activo' }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 530 },
          data: { label: 'Esperar 3 semanas', delayType: 'dias', delayValue: 21 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 660 },
          data: {
            label: 'WhatsApp Re-agendamiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '¡Hola {{nombre}}! 💇 Ya pasaron 3 semanas desde tu último corte. ¿Agendamos tu próxima cita? 📅 Tenemos disponibilidad esta semana.' }
          }
        },
        {
          id: 'delay-3',
          type: 'delay',
          position: { x: 250, y: 790 },
          data: { label: 'Esperar 1 semana', delayType: 'dias', delayValue: 7 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 900 },
          data: {
            label: 'Email con Promoción',
            actionType: 'enviar_email',
            config: {
              asunto: '🎁 ¡Oferta especial para ti! - {{empresa_nombre}}',
              mensaje: 'Hola {{nombre}},\n\n¡Te extrañamos!\n\n🎁 Oferta especial:\n10% de descuento en tu próximo servicio.\n\nCódigo: VUELVE10\n\n[Agendar con Descuento]\n\n¡Te esperamos!\n{{empresa_nombre}}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
        { id: 'e2', source: 'delay-1', target: 'action-1' },
        { id: 'e3', source: 'action-1', target: 'action-2' },
        { id: 'e4', source: 'action-2', target: 'delay-2' },
        { id: 'e5', source: 'delay-2', target: 'action-3' },
        { id: 'e6', source: 'action-3', target: 'delay-3' },
        { id: 'e7', source: 'delay-3', target: 'action-4' }
      ]
    }
  },
  {
    nombre: '💇 Barbería: Cita Cancelada',
    descripcion: 'Seguimiento para reagendar citas canceladas.',
    categoria: 'belleza',
    icono: 'XCircle',
    color: '#6B7280',
    trigger: 'cita_cancelada',
    tags: ['barbería', 'estética', 'cancelación', 'recuperación'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Cita Cancelada', triggerType: 'cita_cancelada', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'WhatsApp de Reagendamiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '¡Hola {{nombre}}! 😊 Vimos que cancelaste tu cita. ¿Todo bien? Cuando quieras reagendar, estamos aquí para ti. 📅' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 310 },
          data: { label: 'Esperar 3 días', delayType: 'dias', delayValue: 3 }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Email con Disponibilidad',
            actionType: 'enviar_email',
            config: {
              asunto: '📅 Te guardamos un lugar - {{empresa_nombre}}',
              mensaje: 'Hola {{nombre}},\n\nNotamos que tuviste que cancelar tu cita.\n\n¿Te gustaría reagendar? Tenemos estos horarios disponibles:\n\n📅 Esta semana:\n• [Ver horarios]\n\n[Agendar Nueva Cita]\n\n¡Te esperamos!\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 550 },
          data: {
            label: 'Crear Tarea Seguimiento',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Reagendar cita - {{nombre}}',
              descripcion: 'Cliente canceló cita, hacer seguimiento para reagendar',
              prioridad: 'media'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'delay-1' },
        { id: 'e3', source: 'delay-1', target: 'action-2' },
        { id: 'e4', source: 'action-2', target: 'action-3' }
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATES PARA CONSULTORIOS MÉDICOS
  // ═══════════════════════════════════════════════════════════════
  {
    nombre: '🏥 Consultorio: Nuevo Paciente',
    descripcion: 'Bienvenida y preparación para nuevos pacientes de consultorio médico.',
    categoria: 'salud',
    icono: 'Stethoscope',
    color: '#0EA5E9',
    trigger: 'nuevo_lead',
    tags: ['médico', 'consultorio', 'salud', 'pacientes'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Nuevo Paciente', triggerType: 'nuevo_lead', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Bienvenida',
            actionType: 'enviar_email',
            config: {
              asunto: '🏥 Bienvenido a {{empresa_nombre}}',
              mensaje: 'Estimado/a {{nombre}},\n\n¡Gracias por contactarnos!\n\nEn {{empresa_nombre}} estamos comprometidos con tu salud y bienestar.\n\n📋 Para agilizar tu primera consulta, te pedimos:\n• Traer identificación oficial\n• Estudios médicos previos (si los tienes)\n• Lista de medicamentos actuales\n\n📞 Para agendar tu cita:\nTeléfono: {{telefono_consultorio}}\n\n[Agendar Cita]\n\nAtentamente,\n{{usuario_nombre}}\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'Tag Paciente Nuevo',
            actionType: 'asignar_tag',
            config: { tag: 'Paciente Nuevo' }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 420 },
          data: { label: 'Esperar 4 horas', delayType: 'horas', delayValue: 4 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'WhatsApp de Seguimiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: 'Hola {{nombre}}, soy de {{empresa_nombre}}. 🏥 ¿Recibiste la información para tu consulta? ¿Puedo ayudarte a agendar tu cita?' }
          }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 660 },
          data: {
            label: 'Crear Tarea Seguimiento',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Agendar cita - {{nombre}}',
              descripcion: 'Nuevo paciente, confirmar que agendó su primera consulta',
              prioridad: 'alta'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'delay-1' },
        { id: 'e4', source: 'delay-1', target: 'action-3' },
        { id: 'e5', source: 'action-3', target: 'action-4' }
      ]
    }
  },
  {
    nombre: '🏥 Consultorio: Recordatorio de Cita',
    descripcion: 'Recordatorios automáticos para consultas médicas programadas.',
    categoria: 'salud',
    icono: 'Clock',
    color: '#14B8A6',
    trigger: 'cita_agendada',
    tags: ['médico', 'consultorio', 'recordatorio', 'citas'],
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
            label: 'Email de Confirmación',
            actionType: 'enviar_email',
            config: {
              asunto: '✅ Cita confirmada - {{empresa_nombre}}',
              mensaje: 'Estimado/a {{nombre}},\n\n¡Su cita está confirmada!\n\n📅 Fecha: {{fecha}}\n⏰ Hora: {{hora}}\n👨‍⚕️ Doctor(a): {{doctor}}\n📍 Dirección: {{direccion}}\n\n📋 Recuerde traer:\n• Identificación oficial\n• Estudios previos\n• Lista de medicamentos\n\n⚠️ Por favor llegue 15 minutos antes.\n\nAtentamente,\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 310 },
          data: {
            label: 'WhatsApp Confirmación',
            actionType: 'enviar_whatsapp',
            config: { mensaje: '✅ Cita confirmada {{nombre}}\n\n📅 {{fecha}} a las {{hora}}\n👨‍⚕️ {{doctor}}\n📍 {{direccion}}\n\nLlegue 15 min antes. ¿Confirma asistencia?' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Tag Cita Pendiente',
            actionType: 'asignar_tag',
            config: { tag: 'Cita Médica Pendiente' }
          }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 530 },
          data: {
            label: 'Crear Tarea Preparación',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Preparar expediente - {{nombre}}',
              descripcion: 'Revisar historial médico y preparar consultorio',
              prioridad: 'media'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'action-2' },
        { id: 'e3', source: 'action-2', target: 'action-3' },
        { id: 'e4', source: 'action-3', target: 'action-4' }
      ]
    }
  },
  {
    nombre: '🏥 Consultorio: Post-Consulta',
    descripcion: 'Seguimiento después de la consulta médica con instrucciones y próximos pasos.',
    categoria: 'salud',
    icono: 'ClipboardList',
    color: '#8B5CF6',
    trigger: 'cita_confirmada',
    tags: ['médico', 'consultorio', 'seguimiento', 'tratamiento'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Consulta Completada', triggerType: 'cita_confirmada', config: {} }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 180 },
          data: { label: 'Esperar 3 horas', delayType: 'horas', delayValue: 3 }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 290 },
          data: {
            label: 'Email Post-Consulta',
            actionType: 'enviar_email',
            config: {
              asunto: '📋 Resumen de su consulta - {{empresa_nombre}}',
              mensaje: 'Estimado/a {{nombre}},\n\n¡Gracias por su visita!\n\n📋 Resumen de consulta:\n• Fecha: {{fecha}}\n• Doctor(a): {{doctor}}\n\n💊 Recuerde seguir las indicaciones del tratamiento.\n\n📅 Si necesita agendar una cita de seguimiento:\n[Agendar Cita]\n\n⚠️ Si presenta síntomas de alarma, acuda a urgencias.\n\nAtentamente,\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'Actualizar Score',
            actionType: 'actualizar_score',
            config: { scoreValue: 10, motivo: 'Consulta completada' }
          }
        },
        {
          id: 'delay-2',
          type: 'delay',
          position: { x: 250, y: 530 },
          data: { label: 'Esperar 7 días', delayType: 'dias', delayValue: 7 }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 660 },
          data: {
            label: 'WhatsApp Seguimiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: 'Hola {{nombre}}, de {{empresa_nombre}}. 🏥 ¿Cómo se ha sentido con el tratamiento? ¿Tiene alguna duda o necesita agendar una cita de seguimiento?' }
          }
        },
        {
          id: 'delay-3',
          type: 'delay',
          position: { x: 250, y: 790 },
          data: { label: 'Esperar 21 días', delayType: 'dias', delayValue: 21 }
        },
        {
          id: 'action-4',
          type: 'action',
          position: { x: 250, y: 900 },
          data: {
            label: 'Email Cita de Control',
            actionType: 'enviar_email',
            config: {
              asunto: '📅 Es momento de su cita de control',
              mensaje: 'Estimado/a {{nombre}},\n\nHa pasado un mes desde su última consulta.\n\n¿Cómo se ha sentido?\n\nLe recomendamos agendar su cita de control para dar seguimiento a su tratamiento.\n\n[Agendar Cita de Control]\n\n¡Su salud es nuestra prioridad!\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'action-5',
          type: 'action',
          position: { x: 250, y: 1030 },
          data: {
            label: 'Crear Tarea Seguimiento',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Seguimiento paciente - {{nombre}}',
              descripcion: 'Verificar evolución del tratamiento y agendar control',
              prioridad: 'media'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
        { id: 'e2', source: 'delay-1', target: 'action-1' },
        { id: 'e3', source: 'action-1', target: 'action-2' },
        { id: 'e4', source: 'action-2', target: 'delay-2' },
        { id: 'e5', source: 'delay-2', target: 'action-3' },
        { id: 'e6', source: 'action-3', target: 'delay-3' },
        { id: 'e7', source: 'delay-3', target: 'action-4' },
        { id: 'e8', source: 'action-4', target: 'action-5' }
      ]
    }
  },
  {
    nombre: '🏥 Consultorio: Cita Cancelada',
    descripcion: 'Seguimiento para reagendar citas médicas canceladas.',
    categoria: 'salud',
    icono: 'CalendarX',
    color: '#EF4444',
    trigger: 'cita_cancelada',
    tags: ['médico', 'consultorio', 'cancelación', 'reagendamiento'],
    flowData: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { label: 'Cita Cancelada', triggerType: 'cita_cancelada', config: {} }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 180 },
          data: {
            label: 'Email de Reagendamiento',
            actionType: 'enviar_email',
            config: {
              asunto: '📅 Reagende su cita - {{empresa_nombre}}',
              mensaje: 'Estimado/a {{nombre}},\n\nLamentamos que no pueda asistir a su cita.\n\nSu salud es nuestra prioridad. ¿Le gustaría agendar una nueva fecha?\n\n[Ver Disponibilidad]\n\nSi tiene alguna urgencia médica, no dude en contactarnos.\n\nAtentamente,\n{{empresa_nombre}}'
            }
          }
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 250, y: 310 },
          data: { label: 'Esperar 2 días', delayType: 'dias', delayValue: 2 }
        },
        {
          id: 'action-2',
          type: 'action',
          position: { x: 250, y: 420 },
          data: {
            label: 'WhatsApp Seguimiento',
            actionType: 'enviar_whatsapp',
            config: { mensaje: 'Hola {{nombre}}, de {{empresa_nombre}}. 🏥 Notamos que canceló su cita. ¿Está todo bien? ¿Puedo ayudarle a reagendar?' }
          }
        },
        {
          id: 'action-3',
          type: 'action',
          position: { x: 250, y: 550 },
          data: {
            label: 'Crear Tarea Urgente',
            actionType: 'crear_tarea',
            config: {
              titulo: 'Reagendar cita médica - {{nombre}}',
              descripcion: 'Paciente canceló cita, verificar estado de salud y reagendar',
              prioridad: 'alta'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger-1', target: 'action-1' },
        { id: 'e2', source: 'action-1', target: 'delay-1' },
        { id: 'e3', source: 'delay-1', target: 'action-2' },
        { id: 'e4', source: 'action-2', target: 'action-3' }
      ]
    }
  }
];

async function seedAutomationTemplates() {
  console.log('🌱 Seeding automation templates...');

  try {
    // Eliminar templates oficiales existentes
    await prisma.automationTemplate.deleteMany({ where: { esOficial: true } });
    console.log('✅ Deleted existing official templates');

    // Crear templates con esOficial: true
    for (const template of templates) {
      await prisma.automationTemplate.create({ 
        data: {
          ...template,
          esOficial: true
        }
      });
      console.log(`✅ Created: ${template.nombre}`);
    }

    console.log(`\n🎉 Successfully seeded ${templates.length} templates!`);
    console.log('\n📋 Templates by category:');
    
    // Mostrar resumen por categoría
    const categories = templates.reduce((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`   • ${cat}: ${count} templates`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedAutomationTemplates();
