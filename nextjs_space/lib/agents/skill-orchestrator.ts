import { prisma } from '@/lib/db';
import { DetectedIntent } from './gemma-router';
import { ConversationContext } from './conversation-context';

export interface ExecutionPlan {
  steps: ExecutionStep[];
  skillName: string;
  skillParams: Record<string, any>;
}

export interface ExecutionStep {
  action: string;
  params?: Record<string, any>;
  skill?: string;
}

interface SkillMapping {
  skillName: string;
  permission?: string;
  paramBuilder: (entities: Record<string, string>, context: ConversationContext) => Record<string, any>;
}

const INTENT_TO_SKILL_MAP: Record<string, SkillMapping> = {
  'agendar_cita': {
    skillName: 'auto_schedule',
    paramBuilder: (entities, context) => ({
      tenantId: context.tenantId,
      leadId: context.userId,
      date: entities.date,
      time: entities.time,
      service: entities.service,
      customerName: entities.customer_name,
      phone: entities.phone,
      email: entities.email
    })
  },
  'consultar_cita': {
    skillName: 'get_upcoming_bookings',
    paramBuilder: (entities, context) => ({
      tenantId: context.tenantId,
      limit: 5
    })
  },
  'cancelar_cita': {
    skillName: 'cancel_booking',
    paramBuilder: (entities, context) => ({
      tenantId: context.tenantId,
      bookingId: entities.appointment_id
    })
  },
  'consultar_servicios': {
    skillName: 'export_catalog',
    paramBuilder: (entities, context) => ({
      tenantId: context.tenantId,
      format: 'json'
    })
  },
  'consultar_precio': {
    skillName: 'search_catalog',
    paramBuilder: (entities, context) => ({
      tenantId: context.tenantId,
      search: entities.service
    })
  },
  'contactar_humano': {
    skillName: 'transfer_to_human',
    paramBuilder: (entities, context) => ({
      tenantId: context.tenantId,
      userId: context.userId,
      reason: entities.reason || 'Solicitud del cliente',
      priority: 'normal'
    })
  }
};

export class SkillOrchestratorAgent {
  static async buildExecutionPlan(
    intent: DetectedIntent,
    context: ConversationContext,
    tenantId: string
  ): Promise<{ success: boolean; plan?: ExecutionPlan; error?: string; response?: string }> {
    // Si el intent no es accionable, generar respuesta de ayuda
    if (!this.isActionableIntent(intent.intent)) {
      return {
        success: true,
        response: this.getHelpResponse(intent.intent)
      };
    }

    // Si hay missing entities, generar prompt para obtenerlos
    if (intent.missingEntities && intent.missingEntities.length > 0) {
      return {
        success: true,
        response: intent.suggestedResponse || this.getPromptForEntity(intent.missingEntities[0])
      };
    }

    // Obtener mapping de skill
    const mapping = INTENT_TO_SKILL_MAP[intent.intent];
    if (!mapping) {
      return {
        success: false,
        error: `No hay skill mapeado para el intent: ${intent.intent}`
      };
    }

    // Verificar que el tenant tiene el skill disponible (module check)
    const hasAccess = await this.checkSkillAccess(tenantId, mapping.skillName);
    if (!hasAccess) {
      return {
        success: true,
        response: 'Lo siento, no tienes acceso a esta función. ¿Hay algo más en lo que pueda ayudarte?'
      };
    }

    // Construir parámetros del skill
    const skillParams = mapping.paramBuilder(intent.entities, context);

    // Construir plan de ejecución
    const plan: ExecutionPlan = {
      skillName: mapping.skillName,
      skillParams,
      steps: [
        {
          action: 'validate_params',
          params: skillParams
        },
        {
          action: 'execute_skill',
          skill: mapping.skillName,
          params: skillParams
        },
        {
          action: 'format_response'
        }
      ]
    };

    return {
      success: true,
      plan
    };
  }

  private static async checkSkillAccess(tenantId: string, skillName: string): Promise<boolean> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { tenantFeatures: true }
      });

      if (!tenant) return false;

      // Mapping de skills a features
      const skillToFeature: Record<string, string> = {
        'auto_schedule': 'booking',
        'get_upcoming_bookings': 'booking',
        'cancel_booking': 'booking',
        'export_catalog': 'catalog',
        'search_catalog': 'catalog',
        'transfer_to_human': 'chatbot'
      };

      const feature = skillToFeature[skillName];
      if (!feature) return true; // Si no hay mapping, permitir

      const featureRecord = tenant.tenantFeatures.find(f => f.feature === feature);
      return featureRecord?.isActive ?? false;
    } catch {
      return false;
    }
  }

  static isActionableIntent(intent: string): boolean {
    return Object.keys(INTENT_TO_SKILL_MAP).includes(intent);
  }

  private static getHelpResponse(intent: string): string {
    const responses: Record<string, string> = {
      'unknown': 'No entendí bien tu mensaje. Puedo ayudarte con:\n• Ver nuestros servicios\n• Agendar una cita\n• Consultar tus citas\n• Consultar precios\n• Hablar con un humano',
      'help': '¡Hola! Soy tu asistente de Volkern. Puedo ayudarte con:\n\n📋 *Servicios*: Pregunta por nuestros servicios\n📅 *Citas*: Puedo agendar, consultar o cancelar citas\n💰 *Precios*: Consulta precios de servicios\n👤 *Humano*: Puedo transferirte a un agente\n\n¿En qué puedo ayudarte?'
    };
    return responses[intent] || responses['help'];
  }

  private static getPromptForEntity(entity: string): string {
    const prompts: Record<string, string> = {
      date: '¿Para qué fecha te gustaría agendar? (puedes decir "mañana", "hoy", o una fecha específica)',
      time: '¿A qué hora te viene bien? (por ejemplo, 10:00, 14:30)',
      service: '¿Qué servicio necesitas?',
      appointment_id: '¿Podrías darme el ID de la cita que quieres cancelar?',
      customer_name: '¿Cuál es tu nombre?',
      phone: '¿Cuál es tu número de teléfono?',
      email: '¿Cuál es tu correo electrónico?'
    };
    return prompts[entity] || `¿Podrías proporcionarme ${entity}?`;
  }

  static getSkillDescription(skillName: string): string {
    const descriptions: Record<string, string> = {
      'auto_schedule': 'Agendar una cita automáticamente',
      'get_upcoming_bookings': 'Consultar próximas citas',
      'cancel_booking': 'Cancelar una cita',
      'export_catalog': 'Ver catálogo de servicios',
      'search_catalog': 'Buscar en el catálogo',
      'transfer_to_human': 'Transferir a un agente humano'
    };
    return descriptions[skillName] || 'Skill desconocido';
  }
}