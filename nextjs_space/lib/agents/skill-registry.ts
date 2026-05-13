/**
 * Skill Registry - Registro dinámico de skills
 * 
 * Permite registrar y ejecutar skills locales o externos.
 * Preparado para marketplace multi-tenant.
 */

import { skills } from '@/lib/skills';

export interface Skill {
  execute: (params: any) => Promise<SkillOutput>;
  description?: string;
  permissions?: string[];
  inputSchema?: any;
}

export interface SkillOutput {
  message?: string;
  data?: any;
  break?: boolean;
  error?: string;
}

const registry = new Map<string, Skill>();

export const SkillRegistry = {
  /**
   * Registrar un skill en el registry
   */
  register(name: string, skill: Skill): void {
    registry.set(name, skill);
    console.log(`[SkillRegistry] Registered: ${name}`);
  },

  /**
   * Obtener un skill del registry
   */
  get(name: string): Skill | undefined {
    return registry.get(name);
  },

  /**
   * Obtener todos los skills registrados
   */
  getAll(): Map<string, Skill> {
    return registry;
  },

  /**
   * Verificar si existe un skill
   */
  has(name: string): boolean {
    return registry.has(name);
  },

  /**
   * Registrar skills de Volkern desde el skills registry existente
   */
  registerVolkernSkills(): void {
    const volkernSkills: Record<string, string> = {
      'auto_schedule': 'create_booking',
      'get_upcoming_bookings': 'get_upcoming_bookings',
      'cancel_booking': 'cancel_booking',
      'export_catalog': 'export_catalog',
      'search_catalog': 'search_catalog',
      'transfer_to_human': 'create_task',
      'get_contact': 'get_contact',
      'create_lead': 'create_lead',
      'get_deal': 'get_deal',
    };

    for (const [action, skillName] of Object.entries(volkernSkills)) {
      const volkernSkill = skills[skillName as keyof typeof skills];
      
      if (volkernSkill) {
        this.register(action, {
          execute: async (params: any) => {
            try {
              const result = await volkernSkill(params);
              return {
                message: typeof result === 'string' ? result : JSON.stringify(result),
                data: result
              };
            } catch (error: any) {
              return {
                message: `Error executing ${action}`,
                error: error.message
              };
            }
          },
          description: `Volkern skill: ${skillName}`
        });
      }
    }

    console.log(`[SkillRegistry] Registered ${registry.size} Volkern skills`);
  }
};

// Registrar skills al importar
SkillRegistry.registerVolkernSkills();

export default SkillRegistry;