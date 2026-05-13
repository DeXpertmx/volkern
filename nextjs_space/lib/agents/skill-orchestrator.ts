/**
 * SkillOrchestratorAgent - Orquestador de planes de ejecución
 * 
 * Convierte intent → plan multi-step dinámico
 * Usa contexto para completar entidades faltantes
 * Permite flujos condicionales
 */

import { prisma } from '@/lib/db';

export interface ExecutionPlan {
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  action: string;
  params?: Record<string, any>;
}

export interface OrchestratorInput {
  intent: string;
  entities: Record<string, string>;
  context: {
    tenantId: string;
    userId: string;
    pendingIntent?: string;
    collectedEntities: Record<string, string>;
    missingEntities: string[];
  };
  tenantId: string;
}

const INTENT_TO_SKILL: Record<string, string> = {
  'agendar_cita': 'auto_schedule',
  'consultar_cita': 'get_upcoming_bookings',
  'cancelar_cita': 'cancel_booking',
  'consultar_servicios': 'export_catalog',
  'consultar_precio': 'search_catalog',
  'contactar_humano': 'transfer_to_human',
  'consultar_estado_pedido': 'get_deal',
  'help': 'help'
};

export const SkillOrchestratorAgent = {
  /**
   * Crear plan de ejecución desde intent
   */
  async createPlan(
    intentData: { intent: string; entities: Record<string, string>; missingEntities: string[] },
    context: any,
    tenantId: string
  ): Promise<{ success: boolean; plan?: ExecutionPlan; response?: string; error?: string }> {
    const { intent, entities, missingEntities } = intentData;

    // 🧠 1. Merge con contexto (entity completion)
    const mergedEntities = {
      ...(context.collectedEntities || {}),
      ...entities
    };

    // 🛡️ 2. Verificar acceso al skill
    const hasAccess = await this.checkSkillAccess(tenantId, intent);
    if (!hasAccess) {
      return {
        success: true,
        response: this.getNoAccessMessage(intent)
      };
    }

    // 🧩 3. Si hay missing entities, generar plan para pedir info
    if (missingEntities && missingEntities.length > 0) {
      return {
        success: true,
        plan: this.createAskUserPlan(missingEntities[0], intent)
      };
    }

    // 🧩 4. Generar plan según intent
    const plan = this.buildPlan(intent, mergedEntities, tenantId);
    
    if (!plan) {
      return {
        success: true,
        response: this.getHelpResponse()
      };
    }

    return {
      success: true,
      plan
    };
  },

  /**
   * Construir plan según intent
   */
  private buildPlan(intent: string, entities: Record<string, string>, tenantId: string): ExecutionPlan | null {
    const planBuilders: Record<string, (entities: Record<string, string>, tenantId: string) => ExecutionPlan | null> = {
      'agendar_cita': this.planAgendarCita,
      'consultar_cita': this.planConsultarCita,
      'cancelar_cita': this.planCancelarCita,
      'consultar_servicios': this.planConsultarServicios,
      'consultar_precio': this.planConsultarPrecio,
      'contactar_humano': this.planContactarHumano,
      'consultar_estado_pedido': this.planEstadoPedido,
      'help': this.planHelp
    };

    const builder = planBuilders[intent];
    return builder ? builder.call(this, entities, tenantId) : this.planFallback();
  },

  // ==================== PLANES POR INTENT ====================

  /**
   * Plan: Agendar cita
   */
  private planAgendarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    // Si falta fecha → pedir
    if (!entities.date) {
      return this.createAskUserPlan('date', 'agendar_cita');
    }

    // Si falta hora → pedir
    if (!entities.time) {
      return this.createAskUserPlan('time', 'agendar_cita');
    }

    // Si falta servicio → pedir
    if (!entities.service) {
      return this.createAskUserPlan('service', 'agendar_cita');
    }

    // Flujo completo
    return {
      steps: [
        {
          action: 'validate_availability',
          params: { date: entities.date, time: entities.time }
        },
        {
          action: 'auto_schedule',
          params: {
            tenantId,
            date: entities.date,
            time: entities.time,
            service: entities.service,
            customerName: entities.customer_name
          }
        },
        {
          action: 'confirm_booking',
          params: {}
        }
      ]
    };
  },

  /**
   * Plan: Consultar cita
   */
  private planConsultarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    return {
      steps: [
        {
          action: 'get_upcoming_bookings',
          params: { tenantId, limit: 5 }
        }
      ]
    };
  },

  /**
   * Plan: Cancelar cita
   */
  private planCancelarCita(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.appointment_id) {
      return this.createAskUserPlan('appointment_id', 'cancelar_cita');
    }

    return {
      steps: [
        {
          action: 'cancel_booking',
          params: { tenantId, bookingId: entities.appointment_id }
        }
      ]
    };
  },

  /**
   * Plan: Consultar servicios
   */
  private planConsultarServicios(_entities: Record<string, string>, tenantId: string): ExecutionPlan {
    return {
      steps: [
        {
          action: 'export_catalog',
          params: { tenantId, format: 'json' }
        }
      ]
    };
  },

  /**
   * Plan: Consultar precio
   */
  private planConsultarPrecio(entities: Record<string, string>, tenantId: string): ExecutionPlan {
    if (!entities.service) {
      return this.createAskUserPlan('service', 'consultar_precio');
    }

    return {
      steps: [
        {
          action: 'search_catalog',
          params: { tenantId, search: entities.service }
        }
      ]
    };
  },

  /**
   * Plan: Contactar humano
   */
  private planContactarHumano(_entities: Record<string, string>, tenantId: string): ExecutionPlan {
    return {
      steps: [
        {
          action: 'transfer_to_human',
          params: { tenantId, reason: 'Solicitud del usuario' }
        }
      ]
    };
  },

  /**
   * Plan: Estado de pedido
   */
  private planEstadoPedido(_entities: Record<string, string>, _tenantId: string): ExecutionPlan {
    return {
      steps: [
        {
          action: 'get_deal',
          params: { status: 'open' }
        }
      ]
    };
  },

  /**
   * Plan: Help
   */
  private planHelp(): ExecutionPlan {
    return {
      steps: [
        {
          action: 'help',
          params: {}
        }
      ]
    };
  },

  /**
   * Plan: Fallback
   */
  private planFallback(): ExecutionPlan {
    return {
      steps: [
        {
          action: 'ask_user',
          params: {
            message: '🤔 No entendí bien tu mensaje. ¿Puedes reformular o escribir con otras palabras?'
          }
        }
      ]
    };
  },

  /**
   * Crear plan para pedir información faltante
   */
  private createAskUserPlan(missingEntity: string, _intent: string): ExecutionPlan {
    const prompts: Record<string, string> = {
      date: '📅 ¿Para qué fecha te gustaría agendar? (puedes decir "mañana", "hoy", o "15/05")',
      time: '⏰ ¿A qué hora te viene bien? (ej: 10:00, 14:30)',
      service: '📋 ¿Qué servicio o producto necesitas?',
      customer_name: '👤 ¿Cuál es tu nombre?',
      phone: '📱 ¿Cuál es tu número de teléfono?',
      email: '📧 ¿Cuál es tu correo electrónico?',
      appointment_id: '🔖 ¿Podrías darme el ID de la cita?',
      productId: '🛒 ¿Qué producto deseas?',
      quantity: '🔢 ¿Cuántos necesitas?'
    };

    return {
      steps: [
        {
          action: 'ask_user',
          params: {
            message: prompts[missingEntity] || `❓ ¿Podrías darme ${missingEntity}?`,
            missingEntity
          }
        }
      ]
    };
  },

  /**
   * Verificar acceso al skill por tenant
   */
  private async checkSkillAccess(tenantId: string, intent: string): Promise<boolean> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { tenantFeatures: true }
      });

      if (!tenant) return false;

      // Mapping de intents a features
      const intentFeatures: Record<string, string> = {
        'agendar_cita': 'booking',
        'consultar_cita': 'booking',
        'cancelar_cita': 'booking',
        'consultar_servicios': 'catalog',
        'consultar_precio': 'catalog',
        'consultar_estado_pedido': 'deals'
      };

      const feature = intentFeatures[intent];
      if (!feature) return true; // Si no hay mapping, permitir

      const featureRecord = tenant.tenantFeatures.find(f => f.feature === feature);
      return featureRecord?.isActive ?? false;
    } catch {
      return false;
    }
  },

  /**
   * Mensaje cuando no hay acceso
   */
  private getNoAccessMessage(intent: string): string {
    const messages: Record<string, string> = {
      'agendar_cita': '📅 No tienes acceso al módulo de citas. Contacta al administrador.',
      'consultar_servicios': '📋 No tienes acceso al catálogo. Contacta al administrador.',
      'consultar_precio': '💰 No tienes acceso al módulo de precios. Contacta al administrador.'
    };
    return messages[intent] || '❌ No tienes acceso a esta función. Contacta al administrador.';
  },

  /**
   * Mensaje de ayuda
   */
  private getHelpResponse(): string {
    return `👋 Soy *Gemma*, tu asistente de Volkern.\n\nPuedo ayudarte con:\n\n📅 *Citas*: Agendar, consultar o cancelar\n📋 *Servicios*: Ver nuestro catálogo\n💰 *Precios*: Consultar precios\n👤 *Ayuda*: Hablar con un agente\n\n¿En qué puedo ayudarte?`;
  },

  /**
   * Obtener descripción de skill
   */
  getSkillDescription(skillName: string): string {
    const descriptions: Record<string, string> = {
      'auto_schedule': 'Agendar una cita',
      'get_upcoming_bookings': 'Consultar citas',
      'cancel_booking': 'Cancelar una cita',
      'export_catalog': 'Ver catálogo',
      'search_catalog': 'Buscar en catálogo',
      'transfer_to_human': 'Transferir a agente',
      'get_deal': 'Consultar deals',
      'ask_user': 'Pedir información',
      'help': 'Mostrar ayuda'
    };
    return descriptions[skillName] || 'Acción desconocida';
  }
};

export default SkillOrchestratorAgent;