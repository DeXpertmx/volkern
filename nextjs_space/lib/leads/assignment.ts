import { prisma } from '@/lib/db';
import { logAuditAction } from '@/lib/permissions';

export interface LeadAssignmentConfig {
  enabled: boolean;
  method: 'round_robin' | 'load_balanced';
  agentIds: string[];
  lastAssignedIndex: number;
}

const CONFIG_KEY = 'leads_assignment_config';

/**
 * Gets the lead assignment configuration for a tenant
 */
export async function getLeadAssignmentConfig(tenantId: string): Promise<LeadAssignmentConfig> {
  const config = await prisma.configuracion.findUnique({
    where: {
      tenantId_clave: {
        tenantId,
        clave: CONFIG_KEY
      }
    }
  });

  if (!config) {
    return {
      enabled: false,
      method: 'round_robin',
      agentIds: [],
      lastAssignedIndex: -1
    };
  }

  try {
    return JSON.parse(config.valor);
  } catch (e) {
    console.error('Error parsing lead assignment config:', e);
    return {
      enabled: false,
      method: 'round_robin',
      agentIds: [],
      lastAssignedIndex: -1
    };
  }
}

/**
 * Saves the lead assignment configuration for a tenant
 */
export async function saveLeadAssignmentConfig(tenantId: string, config: LeadAssignmentConfig) {
  return prisma.configuracion.upsert({
    where: {
      tenantId_clave: {
        tenantId,
        clave: CONFIG_KEY
      }
    },
    update: {
      valor: JSON.stringify(config)
    },
    create: {
      tenantId,
      clave: CONFIG_KEY,
      valor: JSON.stringify(config)
    }
  });
}

/**
 * Assigns a lead automatically based on the tenant's configuration
 */
export async function assignLeadAutomatically(leadId: string, tenantId: string) {
  const config = await getLeadAssignmentConfig(tenantId);

  if (!config.enabled || !config.agentIds || config.agentIds.length === 0) {
    return null;
  }

  let assignedUserId: string | null = null;

  if (config.method === 'round_robin') {
    assignedUserId = await getNextAgentRoundRobin(tenantId, config);
  } else if (config.method === 'load_balanced') {
    assignedUserId = await getAgentWithLowestLoad(tenantId, config);
  }

  if (assignedUserId) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { asignadoA: assignedUserId }
    });

    console.log(`Lead ${leadId} automatically assigned to ${assignedUserId} via ${config.method}`);
    
    // Log action (optional, depends on system requirements)
    try {
        await logAuditAction(
            'system',
            tenantId,
            'auto_assign',
            'Lead',
            leadId,
            `Asignación automática inteligente (${config.method})`
        );
    } catch (e) {
        console.error('Error logging auto-assignment:', e);
    }
  }

  return assignedUserId;
}

/**
 * Round Robin Algorithm
 */
async function getNextAgentRoundRobin(tenantId: string, config: LeadAssignmentConfig): Promise<string | null> {
  const agents = config.agentIds;
  let nextIndex = (config.lastAssignedIndex + 1) % agents.length;
  
  const assignedUserId = agents[nextIndex];

  // Update config with new index
  config.lastAssignedIndex = nextIndex;
  await saveLeadAssignmentConfig(tenantId, config);

  return assignedUserId;
}

/**
 * Load Balanced Algorithm
 * Picks the agent with the fewest leads in 'nuevo' or 'new' status
 */
async function getAgentWithLowestLoad(tenantId: string, config: LeadAssignmentConfig): Promise<string | null> {
  const agents = config.agentIds;

  // Count active leads per agent
  const counts = await Promise.all(
    agents.map(async (agentId) => {
      const count = await prisma.lead.count({
        where: {
          tenantId,
          asignadoA: agentId,
          estado: { in: ['nuevo', 'new', 'en progreso', 'proceso'] }
        }
      });
      return { agentId, count };
    })
  );

  // Sort by count ascending
  counts.sort((a, b) => a.count - b.count);

  return counts[0]?.agentId || null;
}
