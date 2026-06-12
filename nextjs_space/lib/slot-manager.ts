import { prisma } from '@/lib/db';
import { PLANS, PLAN_MODULES } from '@/lib/plans';
import { AccountingInitializer } from '@/lib/accounting/initializer';
import type { PgcPlan, SectorAdaptation } from '@/lib/accounting/plans/catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlotType = 'agency' | 'accounting';

export interface CreateSlotInput {
  clientName: string;
  adminEmail: string;
  modulesEnabled?: string[];
  accountingPlanType?: PgcPlan;
  sector?: SectorAdaptation;
}

export interface SlotResult {
  id: string;
  nombre: string;
  slug: string;
  plan: string;
  estado: string;
  fechaCreacion: Date;
  enabledModules: string[];
  billingEmail?: string | null;
  _count?: {
    leads: number;
    users: number;
  };
}

export interface SlotLimitResult {
  allowed: boolean;
  current: number;
  max: number;
  message?: string;
}

// ─── Slot Manager ─────────────────────────────────────────────────────────────

export class SlotManager {
  /**
   * Lista todos los slots (hijos) de un tenant padre, ordenados por creación descendente.
   * Si se proporciona `type`, filtra por plan (AGENCY_SLOT vs ACCOUNTING_SLOT).
   */
  static async listSlots(parentTenantId: string, type?: SlotType): Promise<SlotResult[]> {
    const planFilter = type === 'accounting' ? PLANS.ACCOUNTING_SLOT : type === 'agency' ? PLANS.AGENCY_SLOT : undefined;

    return prisma.tenant.findMany({
      where: {
        parentId: parentTenantId,
        estado: { not: 'eliminado' },
        ...(planFilter ? { plan: planFilter } : {}),
      },
      select: {
        id: true,
        nombre: true,
        slug: true,
        plan: true,
        estado: true,
        fechaCreacion: true,
        enabledModules: true,
        billingEmail: true,
        _count: {
          select: {
            leads: true,
            users: true,
          },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  /**
   * Obtiene un slot individual por ID
   */
  static async getSlot(slotId: string): Promise<SlotResult | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        nombre: true,
        slug: true,
        plan: true,
        estado: true,
        fechaCreacion: true,
        fechaActualizacion: true,
        enabledModules: true,
        billingEmail: true,
        brandingConfig: true,
        provisioningStatus: true,
        _count: {
          select: {
            leads: true,
            users: true,
            citas: true,
            deals: true,
          },
        },
      },
    });
    return tenant;
  }

  /**
   * Crea un nuevo slot (tenant hijo) con el plan y branding adecuados
   */
  static async createSlot(
    parentTenantId: string,
    slotType: SlotType,
    input: CreateSlotInput
  ): Promise<SlotResult> {
    const parent = await prisma.tenant.findUnique({
      where: { id: parentTenantId },
      select: { maxSlots: true, brandingConfig: true, nombre: true },
    });

    if (!parent) {
      throw new Error('Tenant padre no encontrado');
    }

    // Verificar límite de slots
    const limitCheck = await SlotManager.checkSlotLimit(parentTenantId);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message || 'Límite de slots alcanzado');
    }

    // Determinar plan y módulos por defecto según el tipo de slot
    const plan = slotType === 'accounting' ? PLANS.ACCOUNTING_SLOT : PLANS.AGENCY_SLOT;
    const defaultModules = (PLAN_MODULES[plan] || ['leads', 'contactos', 'pipeline', 'tareas']).map(m =>
      m.toUpperCase()
    );
    const normalizedModules = input.modulesEnabled?.map(m => m.toUpperCase()) || defaultModules;

    // Generar slug único
    const baseSlug = input.clientName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');
    const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;

    // Heredar branding del padre
    let brandingConfig: Record<string, unknown> = {};
    if (parent.brandingConfig) {
      const parsed = typeof parent.brandingConfig === 'string'
        ? JSON.parse(parent.brandingConfig)
        : parent.brandingConfig;
      brandingConfig = { ...(parsed as Record<string, unknown>) };
    }
    // Para slots contables, forzar showPoweredBy = true
    if (slotType === 'accounting') {
      brandingConfig.showPoweredBy = true;
    }

    const planType = input.accountingPlanType ?? 'NORMAL';
    const sector = input.sector ?? 'NINGUNO';

    const newSlot = await prisma.tenant.create({
      data: {
        nombre: input.clientName,
        slug,
        accountType: 'BUSINESS',
        parentId: parentTenantId,
        billingEmail: input.adminEmail,
        brandingConfig: brandingConfig as any,
        enabledModules: normalizedModules,
        plan,
        estado: 'activo',
        provisioningStatus: 'PENDING',
        accountingPlanType: planType,
        sector: sector === 'NINGUNO' ? null : sector,
      },
      select: {
        id: true,
        nombre: true,
        slug: true,
        plan: true,
        estado: true,
        fechaCreacion: true,
        enabledModules: true,
        billingEmail: true,
        _count: {
          select: {
            leads: true,
            users: true,
          },
        },
      },
    });

    console.log(`[SlotManager] Slot '${input.clientName}' (${plan}) creado por padre ${parent.nombre}`);

    if (planType) {
      await AccountingInitializer.initializeTenant(newSlot.id, planType, sector);
    }

    return newSlot;
  }

  /**
   * Activa un slot (cambia estado a 'activo')
   */
  static async activateSlot(slotId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: slotId },
      data: { estado: 'activo' },
    });
  }

  /**
   * Desactiva un slot (cambia estado a 'inactivo')
   */
  static async deactivateSlot(slotId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: slotId },
      data: { estado: 'inactivo' },
    });
  }

  /**
   * Elimina un slot lógicamente (soft delete — cambia estado a 'eliminado')
   */
  static async deleteSlot(slotId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: slotId },
      data: { estado: 'eliminado' },
    });
  }

  /**
   * Cuenta los slots activos/no eliminados de un padre
   */
  static async getSlotCount(parentTenantId: string): Promise<number> {
    return prisma.tenant.count({
      where: { parentId: parentTenantId, estado: { not: 'eliminado' } },
    });
  }

  /**
   * Verifica si el padre puede crear más slots según su límite (maxSlots)
   */
  static async checkSlotLimit(parentTenantId: string): Promise<SlotLimitResult> {
    const parent = await prisma.tenant.findUnique({
      where: { id: parentTenantId },
      select: { maxSlots: true },
    });

    if (!parent) {
      return { allowed: false, current: 0, max: 0, message: 'Tenant padre no encontrado' };
    }

    const max = parent.maxSlots || 0;
    const current = await SlotManager.getSlotCount(parentTenantId);

    if (current >= max) {
      return {
        allowed: false,
        current,
        max,
        message: `Límite de slots alcanzado (${max}). Contacta a soporte para ampliar.`,
      };
    }

    return { allowed: true, current, max };
  }

  /**
   * Actualiza metadata de un slot (nombre, email, módulos)
   */
  static async updateSlot(
    slotId: string,
    data: { nombre?: string; billingEmail?: string; enabledModules?: string[] }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre;
    if (data.billingEmail !== undefined) updateData.billingEmail = data.billingEmail;
    if (data.enabledModules !== undefined) {
      updateData.enabledModules = data.enabledModules.map(m => m.toUpperCase());
    }

    await prisma.tenant.update({
      where: { id: slotId },
      data: updateData,
    });
  }
}
