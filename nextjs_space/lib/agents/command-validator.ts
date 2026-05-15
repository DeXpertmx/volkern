import { prisma } from '@/lib/db';
import { intentClassifier } from './intent-classifier';

export interface ValidationResult {
  isValid: boolean;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  message: string;
  confirmationId?: string;
  nextAction?: 'waiting_confirmation' | 'waiting_approval' | 'execute' | 'reject';
}

export interface PendingConfirmation {
  id: string;
  userId: string;
  tenantId: string;
  intent: string;
  params: Record<string, any>;
  originalMessage: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

export interface ValidationRule {
  intent: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  maxDailyCount?: number;
  maxTotalAmount?: number;
  allowedRoles?: string[];
}

export class CommandValidatorAgent {
  private validationRules: ValidationRule[] = [
    {
      intent: 'cancelar_cita',
      requiresConfirmation: true,
      requiresApproval: false,
      maxDailyCount: 10
    },
    {
      intent: 'eliminar_lead',
      requiresConfirmation: true,
      requiresApproval: true,
      maxDailyCount: 5
    },
    {
      intent: 'eliminar_tarea',
      requiresConfirmation: true,
      requiresApproval: false,
      maxDailyCount: 20
    },
    {
      intent: 'registrar_gasto',
      requiresConfirmation: false,
      requiresApproval: false,
      maxDailyCount: 50,
      maxTotalAmount: 1000
    },
    {
      intent: 'modificar_cita',
      requiresConfirmation: false,
      requiresApproval: false,
      maxDailyCount: 20
    },
    {
      intent: 'actualizar_lead',
      requiresConfirmation: false,
      requiresApproval: false,
      maxDailyCount: 50
    }
  ];

  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();

  async validate(params: {
    intent: string;
    params: Record<string, any>;
    message: string;
    userId: string;
    tenantId: string;
    userRole?: string;
    isReauth?: boolean;
    confirmationResponse?: string;
  }): Promise<ValidationResult> {
    const { intent, params: commandParams, message, userId, tenantId, userRole, isReauth, confirmationResponse } = params;

    if (isReauth && confirmationResponse) {
      return this.handlePendingConfirmation(userId, tenantId, confirmationResponse);
    }

    const rules = this.validationRules.find(r => r.intent === intent);
    if (!rules) {
      return { isValid: true, requiresConfirmation: false, requiresApproval: false, message: 'Comando válido' };
    }

    const dailyCount = await this.getDailyCount(userId, tenantId, intent);
    if (rules.maxDailyCount && dailyCount >= rules.maxDailyCount) {
      return {
        isValid: false,
        requiresConfirmation: false,
        requiresApproval: false,
        message: `⚠️ Has alcanzado el límite diario de ${rules.maxDailyCount} operaciones.`
      };
    }

    if (intent === 'registrar_gasto' && rules.maxTotalAmount) {
      const amount = commandParams.monto || commandParams.amount || 0;
      if (amount > rules.maxTotalAmount) {
        return {
          isValid: false,
          requiresConfirmation: true,
          requiresApproval: true,
          message: `⚠️ El gasto de ${amount}€ supera el límite de ${rules.maxTotalAmount}€. Se requiere aprobación.`
        };
      }
    }

    if (rules.allowedRoles && userRole) {
      if (!rules.allowedRoles.includes(userRole)) {
        return {
          isValid: false,
          requiresConfirmation: false,
          requiresApproval: false,
          message: `❌ No tienes permisos para esta acción.`
        };
      }
    }

    if (rules.requiresConfirmation) {
      const confirmation = await this.createPendingConfirmation({
        userId,
        tenantId,
        intent,
        params: commandParams,
        originalMessage: message
      });

      return {
        isValid: false,
        requiresConfirmation: true,
        requiresApproval: rules.requiresApproval,
        message: this.getConfirmationMessage(intent, commandParams),
        confirmationId: confirmation.id,
        nextAction: 'waiting_confirmation'
      };
    }

    if (rules.requiresApproval) {
      await this.createApprovalRequest({ userId, tenantId, intent, params: commandParams, originalMessage: message });
      return {
        isValid: false,
        requiresConfirmation: false,
        requiresApproval: true,
        message: `✅ Se ha solicitado aprobación para ${this.getIntentName(intent)}.`,
        nextAction: 'waiting_approval'
      };
    }

    return { isValid: true, requiresConfirmation: false, requiresApproval: false, message: 'Comando válido' };
  }

  private async handlePendingConfirmation(userId: string, tenantId: string, response: string): Promise<ValidationResult> {
    const pending = Array.from(this.pendingConfirmations.values()).find(p => p.userId === userId && p.status === 'pending');

    if (!pending) {
      return { isValid: false, requiresConfirmation: false, requiresApproval: false, message: 'No tengo operaciones pendientes. ¿Qué necesitas?' };
    }

    if (pending.expiresAt < new Date()) {
      this.pendingConfirmations.delete(pending.id);
      return { isValid: false, requiresConfirmation: false, requiresApproval: false, message: 'El tiempo para confirmar ha expirado.' };
    }

    const normalizedResponse = response.trim().toUpperCase();
    const isConfirmed = ['SÍ', 'SI', 'CONFIRMO', 'YES', 'Y', 'CONFIRMAR'].includes(normalizedResponse);

    if (!isConfirmed) {
      await this.updateConfirmationStatus(pending.id, 'rejected');
      return { isValid: false, requiresConfirmation: false, requiresApproval: false, message: `Operación cancelada.` };
    }

    await this.updateConfirmationStatus(pending.id, 'confirmed');
    return { isValid: true, requiresConfirmation: false, requiresApproval: false, message: `✅ Confirmado. Ejecutando ${this.getIntentName(pending.intent)}...`, nextAction: 'execute' };
  }

  private async createPendingConfirmation(data: { userId: string; tenantId: string; intent: string; params: Record<string, any>; originalMessage: string }): Promise<PendingConfirmation> {
    const confirmation: PendingConfirmation = {
      id: `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: data.userId,
      tenantId: data.tenantId,
      intent: data.intent,
      params: data.params,
      originalMessage: data.originalMessage,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 1000)
    };

    this.pendingConfirmations.set(confirmation.id, confirmation);
    await this.saveConfirmationToDB(confirmation);
    return confirmation;
  }

  private async saveConfirmationToDB(confirmation: PendingConfirmation): Promise<void> {
    try {
      await prisma.pendingCommand.create({
        data: {
          id: confirmation.id,
          userId: confirmation.userId,
          tenantId: confirmation.tenantId,
          intent: confirmation.intent,
          params: confirmation.params as any,
          originalMessage: confirmation.originalMessage,
          status: confirmation.status,
          expiresAt: confirmation.expiresAt
        }
      });
    } catch (error) {
      console.error('Error saving confirmation to DB:', error);
    }
  }

  private async updateConfirmationStatus(id: string, status: 'confirmed' | 'rejected'): Promise<void> {
    const confirmation = this.pendingConfirmations.get(id);
    if (confirmation) {
      confirmation.status = status;
      this.pendingConfirmations.set(id, confirmation);
    }

    try {
      await prisma.pendingCommand.update({ where: { id }, data: { status, updatedAt: new Date() } });
    } catch (error) {
      console.error('Error updating confirmation status:', error);
    }
  }

  private async createApprovalRequest(data: { userId: string; tenantId: string; intent: string; params: Record<string, any>; originalMessage: string }): Promise<void> {
    try {
      await prisma.approvalRequest.create({
        data: {
          userId: data.userId,
          tenantId: data.tenantId,
          intent: data.intent,
          params: data.params as any,
          originalMessage: data.originalMessage,
          status: 'pending',
          requestedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error creating approval request:', error);
    }
  }

  private async getDailyCount(userId: string, tenantId: string, intent: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
      return await prisma.chatbotAuditLog.count({
        where: { userId, tenantId, intent, createdAt: { gte: today } }
      });
    } catch (error) {
      return 0;
    }
  }

  private getConfirmationMessage(intent: string, params: Record<string, any>): string {
    const messages: Record<string, string> = {
      'cancelar_cita': `⚠️ ¿Seguro que quieres cancelar ${params.fecha || params.citaId || 'la cita'}? Responde "SÍ" para confirmar.`,
      'eliminar_lead': `⚠️ ¿Seguro que quieres eliminar a ${params.nombre || params.email || 'este contacto'}? Responde "SÍ" para confirmar.`,
      'eliminar_tarea': `⚠️ ¿Seguro que quieres eliminar ${params.titulo || 'esta tarea'}? Responde "SÍ" para confirmar.`
    };
    return messages[intent] || `⚠️ ¿Estás seguro? Responde "SÍ" para confirmar.`;
  }

  private getIntentName(intent: string): string {
    const names: Record<string, string> = { 'cancelar_cita': 'cancelación de cita', 'eliminar_lead': 'eliminación de lead', 'eliminar_tarea': 'eliminación de tarea', 'registrar_gasto': 'registro de gasto' };
    return names[intent] || 'la operación';
  }

  startCleanupJob(): NodeJS.Timeout {
    return setInterval(() => {
      const now = new Date();
      for (const [id, confirmation] of this.pendingConfirmations.entries()) {
        if (confirmation.expiresAt < now) this.pendingConfirmations.delete(id);
      }
    }, 60 * 1000);
  }
}

export const commandValidator = new CommandValidatorAgent();