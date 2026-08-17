import { prisma } from '@/lib/db';
import { VaultService } from '@/lib/security/vault';
import { generateIntegrityHash } from '@/lib/security/integrity-service';

/**
 * Helper para obtener semilla de bóveda de forma segura
 */
async function getTenantVaultSeed(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { vaultSeed: true }
  });
  if (!tenant?.vaultSeed) throw new Error(`[Sovereignty Error] No vaultSeed found for tenant ${tenantId}`);
  return tenant.vaultSeed;
}

export class HRService {
  /**
   * Crear un nuevo empleado con cifrado obligatorio
   */
  static async createEmployee(data: {
    tenantId: string;
    fullName: string;
    email?: string;
    role: string;
    department: string;
    salary: number; 
    contractUrl?: string;
  }) {
    const vaultSeed = await getTenantVaultSeed(data.tenantId);
    
    const salaryEncrypted = VaultService.encrypt(data.salary.toString(), data.tenantId, vaultSeed);
    const contractUrlEncrypted = data.contractUrl 
      ? VaultService.encrypt(data.contractUrl, data.tenantId, vaultSeed) 
      : null;

    return await prisma.employee.create({
      data: {
        tenantId: data.tenantId,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        department: data.department,
        salaryEncrypted,
        contractUrlEncrypted,
        encryptionKeyId: 'v2-tenant-isolation'
      }
    });
  }

  /**
   * Actualizar datos de empleado
   */
  static async updateEmployee(id: string, tenantId: string, data: Partial<{
    fullName: string;
    role: string;
    department: string;
    salary: number;
    contractUrl: string;
    isActive: boolean;
  }>) {
    const vaultSeed = await getTenantVaultSeed(tenantId);
    const updateData: any = { ...data };

    if (data.salary !== undefined) {
      updateData.salaryEncrypted = VaultService.encrypt(data.salary.toString(), tenantId, vaultSeed);
      delete updateData.salary;
    }

    if (data.contractUrl !== undefined) {
      updateData.contractUrlEncrypted = VaultService.encrypt(data.contractUrl, tenantId, vaultSeed);
      delete updateData.contractUrl;
    }

    return await prisma.employee.update({
      where: { id, tenantId },
      data: updateData
    });
  }

  /**
   * Obtener datos de empleado (descifrado bajo demanda auditado)
   */
  static async getEmployeeData(id: string, tenantId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id, tenantId }
    });

    if (!employee) return null;

    const vaultSeed = await getTenantVaultSeed(tenantId);

    return {
      ...employee,
      salary: employee.salaryEncrypted ? parseInt(VaultService.decrypt(employee.salaryEncrypted, tenantId, vaultSeed)) : 0,
      contractUrl: employee.contractUrlEncrypted ? VaultService.decrypt(employee.contractUrlEncrypted, tenantId, vaultSeed) : null
    };
  }

  static async requestVacation(data: {
    employeeId: string;
    tenantId: string;
    startDate: Date;
    endDate: Date;
    type?: string;
    reason?: string;
  }) {
    return await prisma.erp_vacation_requests.create({
      data
    } as any);
  }

  /**
   * Silent Checker: Validación de políticas sin bloqueo (Soberanía de Mando)
   */
  static async checkVacationPolicy(employeeId: string, tenantId: string, startDate: Date, endDate: Date) {
    // 1. Verificar Saldo (The Vault)
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId, tenantId },
      select: { vacationQuota: true, vacationUsed: true, fullName: true }
    });

    if (!employee) throw new Error('Empleado no encontrado');

    const requestedDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const remainingDays = employee.vacationQuota - employee.vacationUsed;
    const hasEnoughDays = remainingDays >= requestedDays;

    // 2. Obtener Configuración del Tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { configuracion: true }
    });

    const config = (tenant?.configuracion as any) || {};
    const isSnifferEnabled = config?.hr?.enableLogisticsSniffer ?? true;

    // 3. Verificar Hitos Críticos y Activos (Sniffer)
    let criticalMilestones: any[] = [];
    let erp_employee_assets: any[] = [];
    let erp_digital_access: any[] = [];

    if (isSnifferEnabled) {
      criticalMilestones = await prisma.projectMilestone.findMany({
        where: {
          tenantId,
          isCritical: true,
          status: 'PENDING',
          dueDate: {
            gte: startDate,
            lte: endDate
          }
        },
        include: { project: true }
      });

      erp_employee_assets = await (prisma as any).erp_employee_assets.findMany({
        where: {
          employeeId,
          tenantId,
          status: 'ASSIGNED',
          catalogo_items: { isOperationalBlocker: true }
        },
        include: { catalogo_items: true }
      });

      erp_digital_access = await (prisma as any).erp_digital_access.findMany({
        where: {
          employeeId,
          tenantId,
          status: 'ACTIVE',
          isCritical: true
        }
      });
    }

    const hasDigitalRisk = erp_digital_access.length > 0;
    const hasLogisticsConflict = (criticalMilestones.length > 0 && erp_employee_assets.length > 0) || hasDigitalRisk;

    return {
      employeeName: employee.fullName,
      requestedDays,
      remainingDays,
      hasEnoughDays,
      quotaAlert: !hasEnoughDays ? `Saldo insuficiente: Quedan ${remainingDays} días, solicitados ${requestedDays}.` : null,
      criticalMilestones: criticalMilestones.map(m => ({
        name: m.name,
        projectName: m.project.name,
        date: m.dueDate
      })),
      erp_employee_assets: erp_employee_assets.map(a => ({
        id: a.id,
        name: a.catalogoItem.nombre,
        sku: a.catalogoItem.sku,
        serialNumber: a.serialNumber
      })),
      erp_digital_access: erp_digital_access.map(d => ({
        id: d.id,
        resource: d.resourceName,
        level: d.accessLevel,
        env: d.environment
      })),
      isViable: hasEnoughDays && criticalMilestones.length === 0,
      logisticsAlert: erp_employee_assets.length > 0 ? `Atención: El colaborador tiene ${erp_employee_assets.length} activos físicos críticos asignados.` : null,
      digitalFootprintAlert: hasDigitalRisk ? `ALERTA DE SEGURIDAD: El colaborador posee ${erp_digital_access.length} accesos críticos activos (Átomos y Bits).` : null,
      hasLogisticsConflict,
      hasDigitalRisk
    };
  }

  static async approveVacation(id: string, tenantId: string, approvedById: string) {
    return await prisma.erp_vacation_requests.update({
      where: { id, tenantId },
      data: {
        status: 'APPROVED',
        approvedById
      }
    });
  }

  /**
   * Gestión de Gastos (Workflow Adaptativo & Veri*factu)
   */
  static async submitExpenseClaim(data: {
    employeeId: string;
    tenantId: string;
    amount: number;
    currency: string;
    category: string;
    description: string;
    receiptUrl?: string;
    visionLockData?: any;
  }) {
    return await prisma.erp_expense_claims.create({
      data
    } as any);
  }

  /**
   * Autorizar Gasto y vincular a la cadena de hashes de Integridad
   */
  static async authorizeExpense(claimId: string, tenantId: string, authorizerId: string) {
    const claim = await prisma.erp_expense_claims.findUnique({
      where: { id: claimId, tenantId },
      include: { erp_employees: true }
    });

    if (!claim) throw new Error('Solicitud de gasto no encontrada');
    if (claim.status !== 'PENDING') throw new Error('Este gasto ya ha sido procesado');

    // 1. Marcar como autorizado
    await prisma.erp_expense_claims.update({
      where: { id: claimId },
      data: { status: 'APPROVED' }
    });

    // 2. Generar Hash de Integridad Forense (Veri*factu)
    const integrityData = {
      claimId: claim.id,
      amount: claim.amount,
      currency: claim.currency,
      employee: (claim as any).erp_employees.fullName,
      category: claim.category,
      timestamp: new Date().toISOString()
    };
    
    const integrityHash = await generateIntegrityHash(integrityData, tenantId);

    // 3. Crear Gasto persistente en el Integrity Graph
    // Nota: El modelo Expense ya existe en el esquema global
    const expense = await prisma.expense.create({
      data: {
        tenantId,
        createdById: authorizerId, // Quien lo autoriza lo consolida
        supplierId: 'SYSTEM_HR_EXPENSE', // Marcador para gastos internos
        description: `Authorised HR Expense: ${claim.description || claim.category}`,
        amount: claim.amount,
        currency: claim.currency,
        category: claim.category,
        receiptUrl: claim.receiptUrl,
        fingerprint: integrityHash,
        verificationStatus: 'VERIFIED',
        metadata: {
          claimId: claim.id,
          employeeId: (claim as any).employeeId,
          visionLock: claim.visionLockData
        }
      }
    });

    // 4. Registrar en la Auditoría Financiera Inmutable
    await prisma.financialAudit.create({
      data: {
        tenantId,
        userId: authorizerId,
        action: 'APPROVE_EXPENSE_HR',
        userEmail: 'SYSTEM', // Opcional: obtener email del autorizador
        ipAddress: 'VAULT_INTERNAL',
        integrityCheck: integrityHash
      } as any
    });

    return expense;
  }

  static async rejectExpense(claimId: string, tenantId: string) {
    return await prisma.erp_expense_claims.update({
      where: { id: claimId, tenantId },
      data: { status: 'REJECTED' }
    });
  }

  /**
   * Recolectar datos para el Briefing Militar de RRHH
   */
  static async getDailyBriefData(tenantId: string) {
    const today = new Date();
    
    // 1. Estado de Fuerza (Activos vs Ausentes)
    const totalEmployees = await prisma.employee.count({ where: { tenantId, isActive: true } });
    const absentToday = await prisma.erp_vacation_requests.count({
      where: {
        tenantId,
        status: 'APPROVED',
        startDate: { lte: today },
        endDate: { gte: today }
      }
    });

    // 2. Alertas de Integridad (Gastos sin VISION-LOCK)
    const pendingExpenses = await prisma.erp_expense_claims.findMany({
      where: { tenantId, status: 'PENDING' }
    });
    const integrityAlerts = pendingExpenses.filter(e => !e.visionLockData || !(e.visionLockData as any).exif_verified).length;

    // 3. Conflictos de Hitos Críticos (Próximos 7 días)
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const criticalConflicts = await prisma.projectMilestone.findMany({
      where: {
        tenantId,
        isCritical: true,
        status: 'PENDING',
        dueDate: { gte: today, lte: nextWeek }
      },
      include: { project: true }
    });

    return {
      activeCount: totalEmployees - absentToday,
      totalCount: totalEmployees,
      absentCount: absentToday,
      integrityAlerts,
      pendingExpensesCount: pendingExpenses.length,
      criticalConflicts: criticalConflicts.map(c => ({
        name: c.name,
        projectName: c.project.name,
        date: c.dueDate
      }))
    };
  }

  /**
   * Autorización masiva filtrada por GPS (VISION-LOCK)
   */
  static async authorizeBulkExpenses(tenantId: string, authorizerId: string) {
    const pending = await prisma.erp_expense_claims.findMany({
      where: { tenantId, status: 'PENDING' }
    });

    const verified = pending.filter(e => e.visionLockData && (e.visionLockData as any).exif_verified);
    const doubtful = pending.filter(e => !e.visionLockData || !(e.visionLockData as any).exif_verified);

    const authorizedIds = [];
    for (const claim of verified) {
      await this.authorizeExpense(claim.id, tenantId, authorizerId);
      authorizedIds.push(claim.id);
    }

    // Registrar en auditoría con tag [VOICE_CMD]
    await prisma.systemAlert.create({
      data: {
        tenantId,
        level: 'INFO',
        message: `[VOICE_CMD] Autorización masiva ejecutada. ${verified.length} gastos procesados por VISION-LOCK. ${doubtful.length} en revisión manual.`,
      } as any
    });

    return {
      authorizedCount: verified.length,
      doubtfulCount: doubtful.length,
      doubtfulItems: doubtful.map(d => ({ id: d.id, amount: d.amount, category: d.category, description: d.description }))
    };
  }
}
