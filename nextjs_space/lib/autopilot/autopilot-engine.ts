import { prisma } from '@/lib/db'

export class AutopilotEngine {
  /**
   * Genera propuestas de acción basadas en eventos del sistema
   */
  static async proposeAction(data: {
    tenantId: string;
    category: 'FINANCE' | 'SALES' | 'SUPPLY' | 'HR';
    title: string;
    description: string;
    triggerEvent: string;
    actionPayload: any;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confidence: number;
  }) {
    return await prisma.proposedAction.create({
      data: {
        ...data,
        status: 'DRAFT'
      }
    })
  }

  /**
   * Ejecuta una acción aprobada (Trust Protocol)
   */
  static async executeApprovedAction(actionId: string, operatorId: string) {
    const action = await prisma.proposedAction.findUnique({
      where: { id: actionId }
    })

    if (!action || action.status !== 'APPROVED') {
      throw new Error('ACCIÓN_NO_APROBADA')
    }

    // 1. Ejecutar Lógica según Categoría
    switch (action.category) {
      case 'FINANCE':
        // Ej: Enviar correo de cobro redactado
        console.log(`[Autopilot] Ejecutando acción de Finanzas: ${action.title}`)
        break
      case 'SALES':
        // Ej: Crear lead o tarea de seguimiento
        break
    }

    // 2. Marcar como ejecutada y registrar en Auditoría
    return await prisma.$transaction([
      prisma.proposedAction.update({
        where: { id: actionId },
        data: { status: 'EXECUTED', executedAt: new Date() }
      }),
      prisma.auditLog.create({
        data: {
          tenantId: action.tenantId,
          userId: operatorId,
          accion: 'AUTOPILOT_ACTION_EXECUTED',
          entidad: 'ProposedAction',
          entidadId: action.id,
          descripcion: `Acción ejecutada vía Autopilot: ${action.title}.`
        }
      })
    ])
  }
}
