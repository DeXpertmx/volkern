import { prisma } from '@/lib/db';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type WorkflowCategory =
  | 'EXPENSE'
  | 'DEAL'
  | 'CONTRACT'
  | 'VACATION'
  | 'BUDGET'
  | 'DISCOUNT'
  | 'PRODUCTION'
  | 'QUALITY';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'cancelled';

export interface WorkflowRule {
  id: string;
  name: string;
  category: WorkflowCategory;
  description: string;
  /** threshold condition in human-readable form */
  condition: string;
  /** The role that can approve this (from seed-roles.ts: Admin, Manager, Superadmin, etc.) */
  requiredRole: string;
  /** Optional: if the amount/value exceeds this threshold, trigger the workflow */
  amountThreshold?: number;
  /** Priority level */
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Whether this rule is active */
  active: boolean;
}

export interface CreateApprovalInput {
  tenantId: string;
  userId: string;
  category: WorkflowCategory;
  title: string;
  description: string;
  amount?: number;
  currency?: string;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, any>;
}

export interface ApprovalResult {
  requiresApproval: boolean;
  rule?: WorkflowRule;
  requestId?: string;
  message: string;
}

/* ─── Predefined Workflow Rules ───────────────────────────────────────────── */

const PREDEFINED_RULES: WorkflowRule[] = [
  {
    id: 'expense-high',
    name: 'Gastos > €500',
    category: 'EXPENSE',
    description: 'Cualquier gasto superior a 500€ requiere aprobación del Manager',
    condition: 'monto > 500€',
    requiredRole: 'Manager',
    amountThreshold: 500,
    priority: 'MEDIUM',
    active: true,
  },
  {
    id: 'expense-critical',
    name: 'Gastos > €2,000',
    category: 'EXPENSE',
    description: 'Gastos superiores a 2.000€ requieren aprobación del Administrador',
    condition: 'monto > 2.000€',
    requiredRole: 'Admin',
    amountThreshold: 2000,
    priority: 'HIGH',
    active: true,
  },
  {
    id: 'deal-large',
    name: 'Deals > €10,000',
    category: 'DEAL',
    description: 'Oportunidades de venta mayores a 10.000€ requieren aprobación del Director',
    condition: 'valor > 10.000€',
    requiredRole: 'Admin',
    amountThreshold: 10000,
    priority: 'HIGH',
    active: true,
  },
  {
    id: 'deal-enterprise',
    name: 'Deals > €50,000',
    category: 'DEAL',
    description: 'Oportunidades enterprise requieren aprobación del Superadmin',
    condition: 'valor > 50.000€',
    requiredRole: 'Superadmin',
    amountThreshold: 50000,
    priority: 'CRITICAL',
    active: true,
  },
  {
    id: 'contract-signing',
    name: 'Firma de contratos',
    category: 'CONTRACT',
    description: 'Todo contrato requiere revisión y aprobación del Manager antes de ser enviado',
    condition: 'todo contrato a firmar',
    requiredRole: 'Manager',
    priority: 'MEDIUM',
    active: true,
  },
  {
    id: 'vacation-long',
    name: 'Vacaciones > 5 días',
    category: 'VACATION',
    description: 'Solicitudes de vacaciones mayores a 5 días laborables requieren aprobación del Manager',
    condition: 'días > 5',
    requiredRole: 'Manager',
    amountThreshold: 5,
    priority: 'LOW',
    active: true,
  },
  {
    id: 'budget-change',
    name: 'Cambio presupuestario > €1,000',
    category: 'BUDGET',
    description: 'Cambios en presupuesto que excedan 1.000€ requieren aprobación del Admin',
    condition: 'desviación > 1.000€',
    requiredRole: 'Admin',
    amountThreshold: 1000,
    priority: 'HIGH',
    active: true,
  },
  {
    id: 'discount-high',
    name: 'Descuento > 20%',
    category: 'DISCOUNT',
    description: 'Descuentos superiores al 20% requieren aprobación del Manager',
    condition: 'descuento > 20%',
    requiredRole: 'Manager',
    amountThreshold: 20,
    priority: 'MEDIUM',
    active: true,
  },
  {
    id: 'quality-nonconformity',
    name: 'No conformidad de calidad',
    category: 'QUALITY',
    description: 'Cualquier no conformidad de calidad requiere aprobación del Manager antes de cerrar',
    condition: 'no conformidad detectada',
    requiredRole: 'Manager',
    priority: 'HIGH',
    active: true,
  },
  {
    id: 'production-order-change',
    name: 'Cambio en orden de producción',
    category: 'PRODUCTION',
    description: 'Modificaciones a órdenes de producción activas requieren aprobación del Admin',
    condition: 'orden activa modificada',
    requiredRole: 'Admin',
    priority: 'MEDIUM',
    active: true,
  },
];

/* ─── Service ──────────────────────────────────────────────────────────────── */

export class ApprovalWorkflowService {
  /**
   * Get all predefined workflow rules
   */
  static getRules(): WorkflowRule[] {
    return PREDEFINED_RULES.filter(r => r.active);
  }

  /**
   * Get rules by category
   */
  static getRulesByCategory(category: WorkflowCategory): WorkflowRule[] {
    return PREDEFINED_RULES.filter(r => r.active && r.category === category);
  }

  /**
   * Check if an action requires approval based on predefined rules.
   * Returns the matching rule and creates an approval request if needed.
   */
  static async checkAndRequestApproval(
    input: CreateApprovalInput
  ): Promise<ApprovalResult> {
    const matchingRule = this.findMatchingRule(input);

    if (!matchingRule) {
      return {
        requiresApproval: false,
        message: 'No requiere aprobación',
      };
    }

    // Check if user has the required role — if they do, auto-approve
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { role: { select: { nombre: true } } },
    });

    const userRole = user?.role?.nombre || '';

    // Map role hierarchy: Superadmin can approve everything, Admin can approve Manager/Agent level
    const roleHierarchy: Record<string, number> = {
      Viewer: 0,
      Agent: 1,
      Manager: 2,
      Admin: 3,
      Superadmin: 4,
      OWNER: 5,
    };

    const userLevel = roleHierarchy[userRole] ?? 0;
    const requiredLevel = roleHierarchy[matchingRule.requiredRole] ?? 0;

    // If user has sufficient role level, auto-approve
    if (userLevel >= requiredLevel && userLevel >= 3) {
      return {
        requiresApproval: false,
        message: `Aprobado automáticamente (rol ${userRole} tiene autoridad suficiente)`,
      };
    }

    // Find users with the required role in this tenant
    const approvers = await prisma.user.findMany({
      where: {
        tenantId: input.tenantId,
        role: { nombre: matchingRule.requiredRole },
        estado: 'activo',
      },
      select: { id: true, name: true, email: true },
    });

    // Create the approval request
    const request = await prisma.approvalRequest.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        intent: `workflow_${matchingRule.id}`,
        params: {
          category: input.category,
          title: input.title,
          description: input.description,
          amount: input.amount,
          currency: input.currency,
          entityId: input.entityId,
          entityType: input.entityType,
          metadata: input.metadata,
          ruleId: matchingRule.id,
          ruleName: matchingRule.name,
          requiredRole: matchingRule.requiredRole,
          priority: matchingRule.priority,
          availableApprovers: approvers.map(a => ({ id: a.id, name: a.name, email: a.email })),
        },
        originalMessage: `[${matchingRule.category}] ${input.title}: ${input.description}`,
        status: 'pending',
        requestedAt: new Date(),
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        accion: 'APPROVAL_REQUESTED',
        entidad: 'ApprovalRequest',
        entidadId: request.id,
        descripcion: `Solicitud de aprobación: ${matchingRule.name} — ${input.title}`,
        metadata: {
          category: input.category,
          ruleId: matchingRule.id,
          requiredRole: matchingRule.requiredRole,
          amount: input.amount,
        },
      },
    });

    return {
      requiresApproval: true,
      rule: matchingRule,
      requestId: request.id,
      message: `🔒 Se requiere aprobación de un rol ${matchingRule.requiredRole}: ${matchingRule.name}. Solicitud #${request.id.slice(0, 8)} creada.`,
    };
  }

  /**
   * Approve an approval request
   */
  static async approve(
    requestId: string,
    approverId: string,
    note?: string
  ) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new Error('Solicitud no encontrada');
    if (request.status !== 'pending') throw new Error(`La solicitud ya fue ${request.status === 'approved' ? 'aprobada' : 'rechazada'}`);

    const [updated] = await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          resolvedAt: new Date(),
          resolvedBy: approverId,
          approverNote: note,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          userId: approverId,
          accion: 'APPROVAL_APPROVED',
          entidad: 'ApprovalRequest',
          entidadId: request.id,
          descripcion: `✅ Aprobado: ${(request.params as any)?.title || request.intent}`,
          metadata: { previousStatus: 'pending', note },
        },
      }),
    ]);

    return updated;
  }

  /**
   * Reject an approval request
   */
  static async reject(
    requestId: string,
    approverId: string,
    reason: string
  ) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new Error('Solicitud no encontrada');
    if (request.status !== 'pending') throw new Error(`La solicitud ya fue ${request.status === 'approved' ? 'aprobada' : 'rechazada'}`);

    const [updated] = await prisma.$transaction([
      prisma.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          resolvedAt: new Date(),
          resolvedBy: approverId,
          approverNote: reason,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          userId: approverId,
          accion: 'APPROVAL_REJECTED',
          entidad: 'ApprovalRequest',
          entidadId: request.id,
          descripcion: `❌ Rechazado: ${(request.params as any)?.title || request.intent} — Motivo: ${reason}`,
          metadata: { previousStatus: 'pending', reason },
        },
      }),
    ]);

    return updated;
  }

  /**
   * Get pending approvals for a tenant (for approvers)
   */
  static async getPendingApprovals(tenantId: string, userRole?: string) {
    const where: any = { tenantId, status: 'pending' };

    // If user has a specific role, filter to requests matching their role level
    if (userRole) {
      const roleRules = PREDEFINED_RULES.filter(r => r.requiredRole === userRole || this.isRoleSufficient(userRole, r.requiredRole));
      const ruleIds = roleRules.map(r => r.id);
      if (ruleIds.length > 0) {
        where.OR = ruleIds.map(ruleId => ({
          intent: `workflow_${ruleId}`,
        }));
      }
    }

    return prisma.approvalRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Get approval history for a tenant
   */
  static async getApprovalHistory(tenantId: string, limit = 50) {
    return prisma.approvalRequest.findMany({
      where: {
        tenantId,
        status: { in: ['approved', 'rejected', 'cancelled'] },
      },
      orderBy: { resolvedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get requests made by a specific user
   */
  static async getUserRequests(tenantId: string, userId: string) {
    return prisma.approvalRequest.findMany({
      where: { tenantId, userId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Get statistics
   */
  static async getStats(tenantId: string) {
    const [pending, approved, rejected, total] = await Promise.all([
      prisma.approvalRequest.count({ where: { tenantId, status: 'pending' } }),
      prisma.approvalRequest.count({ where: { tenantId, status: 'approved' } }),
      prisma.approvalRequest.count({ where: { tenantId, status: 'rejected' } }),
      prisma.approvalRequest.count({ where: { tenantId } }),
    ]);

    return {
      pending,
      approved,
      rejected,
      total,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      pendingByCategory: await this.getPendingByCategory(tenantId),
    };
  }

  /* ─── Private Helpers ──────────────────────────────────────────────────── */

  private static findMatchingRule(input: CreateApprovalInput): WorkflowRule | undefined {
    return PREDEFINED_RULES.find(rule => {
      if (!rule.active) return false;
      if (rule.category !== input.category) return false;
      // If the rule has an amount threshold, check it
      if (rule.amountThreshold !== undefined && input.amount !== undefined) {
        if (input.amount <= rule.amountThreshold) return false;
      }
      return true;
    });
  }

  private static isRoleSufficient(userRole: string, requiredRole: string): boolean {
    const hierarchy: Record<string, number> = {
      Viewer: 0,
      Agent: 1,
      Manager: 2,
      Admin: 3,
      Superadmin: 4,
      OWNER: 5,
    };
    return (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 0);
  }

  private static async getPendingByCategory(tenantId: string) {
    const pending = await prisma.approvalRequest.findMany({
      where: { tenantId, status: 'pending' },
      select: { intent: true },
    });

    const categoryCount: Record<string, number> = {};
    for (const req of pending) {
      // Extract category from intent: workflow_{ruleId}
      const ruleId = req.intent.replace('workflow_', '');
      const rule = PREDEFINED_RULES.find(r => r.id === ruleId);
      const category = rule?.category || 'OTHER';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    }

    return Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count,
      label: this.getCategoryLabel(category as WorkflowCategory),
    }));
  }

  private static getCategoryLabel(category: WorkflowCategory): string {
    const labels: Record<WorkflowCategory, string> = {
      EXPENSE: 'Gastos',
      DEAL: 'Ventas',
      CONTRACT: 'Contratos',
      VACATION: 'Vacaciones',
      BUDGET: 'Presupuesto',
      DISCOUNT: 'Descuentos',
      PRODUCTION: 'Producción',
      QUALITY: 'Calidad',
    };
    return labels[category] || category;
  }
}

export default ApprovalWorkflowService;
