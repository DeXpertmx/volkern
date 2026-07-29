/**
 * Volkern Real Estate — Commission Calculator
 *
 * Cálculo de comisiones inmobiliarias para el modelo de franquicias.
 * Soporta comisiones basadas en porcentaje, monto fijo, y splits
 * entre agentes/inmobiliaria/franquicia.
 */

import { prisma } from '@/lib/db';
import type { Comision, Deal, User } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommissionRule {
  tipo: 'porcentaje_venta' | 'porcentaje_comision' | 'monto_fijo' | 'escalonada' | 'suscripcion_mensual';
  porcentaje?: number;
  montoFijo?: number;
  cuotaMensual?: number;   // Para tipo suscripcion_mensual
  escalones?: CommissionTier[];
  splitAgente?: number;   // % que va al agente
  splitAgencia?: number;  // % que va a la agencia/franquicia
}

export interface CommissionTier {
  desde: number;       // precio mínimo del tramo
  hasta: number;       // precio máximo del tramo
  porcentaje: number;  // % de comisión en este tramo
}

export interface CommissionInput {
  dealId: string;
  tenantId: string;
  userId: string;
  valorOperacion: number;
  moneda: string;
  rule: CommissionRule;
}

export interface CommissionResult {
  montoCalculado: number;
  splitAgente: number;
  splitAgencia: number;
  desglose: string[];
}

export interface FranchiseCommissionSummary {
  tenantId: string;
  tenantNombre: string;
  totalComisiones: number;
  pendientes: number;
  pagadas: number;
  moneda: string;
  desglose: Array<{
    dealId: string;
    dealTitulo: string;
    agente: string;
    monto: number;
    estado: string;
    fecha: Date;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula la comisión según la regla especificada
 */
export function calculateCommission(input: CommissionInput): CommissionResult {
  const { valorOperacion, rule } = input;
  const desglose: string[] = [];
  let montoComision = 0;

  switch (rule.tipo) {
    case 'porcentaje_venta': {
      // % sobre el precio de venta total
      const pct = rule.porcentaje || 3; // default 3%
      montoComision = valorOperacion * (pct / 100);
      desglose.push(`${pct}% sobre ${valorOperacion.toLocaleString()} = ${montoComision.toLocaleString()}`);
      break;
    }

    case 'porcentaje_comision': {
      // % sobre la comisión total (útil para splits internos)
      const pct = rule.porcentaje || 100;
      montoComision = valorOperacion * (pct / 100);
      desglose.push(`${pct}% del valor de operación = ${montoComision.toLocaleString()}`);
      break;
    }

    case 'monto_fijo': {
      montoComision = rule.montoFijo || 0;
      desglose.push(`Tarifa fija: ${montoComision.toLocaleString()}`);
      break;
    }

    case 'escalonada': {
      if (!rule.escalones || rule.escalones.length === 0) {
        desglose.push('Sin escalones definidos, se usa 0');
        break;
      }

      // Ordenar escalones por precio ascendente
      const tiers = [...rule.escalones].sort((a, b) => a.desde - b.desde);
      montoComision = 0;

      for (const tier of tiers) {
        if (valorOperacion >= tier.desde && valorOperacion <= tier.hasta) {
          montoComision = valorOperacion * (tier.porcentaje / 100);
          desglose.push(
            `Tramo ${tier.desde.toLocaleString()}–${tier.hasta.toLocaleString()}: ${tier.porcentaje}% = ${montoComision.toLocaleString()}`
          );
          break;
        }
      }

      // Si no cayó en ningún escalón, usar el porcentaje del último
      if (montoComision === 0 && tiers.length > 0) {
        const lastTier = tiers[tiers.length - 1];
        if (valorOperacion > lastTier.hasta) {
          montoComision = valorOperacion * (lastTier.porcentaje / 100);
          desglose.push(
            `Excede último tramo: ${lastTier.porcentaje}% = ${montoComision.toLocaleString()}`
          );
        }
      }
      break;
    }

    case 'suscripcion_mensual': {
      montoComision = rule.cuotaMensual || 0;
      desglose.push(`Suscripción mensual: ${montoComision.toLocaleString()}/mes`);
      // La suscripción no tiene split — el monto completo va a la franquicia
      return {
        montoCalculado: montoComision,
        splitAgente: 0,
        splitAgencia: montoComision,
        desglose,
      };
    }
  }

  // Aplicar splits si están definidos
  const splitAgente = rule.splitAgente !== undefined
    ? montoComision * (rule.splitAgente / 100)
    : montoComision;

  const splitAgencia = rule.splitAgencia !== undefined
    ? montoComision * (rule.splitAgencia / 100)
    : 0;

  if (rule.splitAgente !== undefined || rule.splitAgencia !== undefined) {
    desglose.push(
      `Split: ${splitAgente.toLocaleString()} agente (${rule.splitAgente || 0}%) + ` +
      `${splitAgencia.toLocaleString()} agencia (${rule.splitAgencia || 0}%)`
    );
  }

  return {
    montoCalculado: montoComision,
    splitAgente: Math.round(splitAgente * 100) / 100,
    splitAgencia: Math.round(splitAgencia * 100) / 100,
    desglose,
  };
}

// ─── Crear Comisión ───────────────────────────────────────────────────────────

/**
 * Crea un registro de comisión a partir de una operación cerrada
 */
export async function createCommissionFromDeal(
  deal: Deal,
  userId: string,
  rule: CommissionRule,
  userMoneda?: string
): Promise<Comision> {
  const moneda = userMoneda || deal.moneda || 'EUR';

  const calcResult = calculateCommission({
    dealId: deal.id,
    tenantId: deal.tenantId,
    userId,
    valorOperacion: deal.valorReal || deal.valor,
    moneda,
    rule,
  });

  return prisma.comision.create({
    data: {
      tenantId: deal.tenantId,
      dealId: deal.id,
      userId,
      tipo: rule.tipo,
      porcentaje: rule.porcentaje || null,
      montoFijo: rule.montoFijo || null,
      montoCalculado: calcResult.montoCalculado,
      moneda,
      estado: 'pendiente',
      metodoCalculo: JSON.stringify(rule),
    },
  });
}

// ─── Consultas Agregadas ──────────────────────────────────────────────────────

/**
 * Obtiene resumen de comisiones para un tenant (agencia/franquicia)
 * Incluye las comisiones de todos los sub-tenants si aplica
 */
export async function getFranchiseCommissionSummary(
  tenantId: string,
  includeChildren: boolean = false
): Promise<FranchiseCommissionSummary[]> {
  const tenantIds = [tenantId];

  if (includeChildren) {
    const children = await prisma.tenant.findMany({
      where: { parentId: tenantId },
      select: { id: true, nombre: true },
    });
    tenantIds.push(...children.map(c => c.id));
  }

  // Conseguir nombres de tenants
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, nombre: true, moneda: true },
  });

  const tenantMap = new Map(tenants.map(t => [t.id, t]));

  const result: FranchiseCommissionSummary[] = [];

  for (const tid of tenantIds) {
    const tInfo = tenantMap.get(tid);
    if (!tInfo) continue;

    const comisiones = await prisma.comision.findMany({
      where: { tenantId: tid },
      include: {
        deal: { select: { titulo: true } },
        usuario: { select: { name: true, email: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
    });

    const totalComisiones = comisiones.reduce((s, c) => s + c.montoCalculado, 0);
    const pendientes = comisiones
      .filter(c => c.estado === 'pendiente')
      .reduce((s, c) => s + c.montoCalculado, 0);
    const pagadas = comisiones
      .filter(c => c.estado === 'pagada')
      .reduce((s, c) => s + c.montoCalculado, 0);

    result.push({
      tenantId: tid,
      tenantNombre: tInfo.nombre,
      totalComisiones,
      pendientes,
      pagadas,
      moneda: tInfo.moneda || 'EUR',
      desglose: comisiones.map(c => ({
        dealId: c.dealId,
        dealTitulo: c.deal?.titulo || '—',
        agente: c.usuario?.name || c.usuario?.email || '—',
        monto: c.montoCalculado,
        estado: c.estado,
        fecha: c.fechaCreacion,
      })),
    });
  }

  return result;
}

/**
 * Obtiene estadísticas globales para el dashboard de franquicia
 */
export async function getFranchiseGlobalStats(tenantId: string) {
  const childTenants = await prisma.tenant.findMany({
    where: { parentId: tenantId },
    select: { id: true, nombre: true, moneda: true },
  });

  const allTenantIds = [tenantId, ...childTenants.map(t => t.id)];

  // Totales agregados
  const [totalProperties, totalDeals, totalLeads, commissionStats] = await Promise.all([
    // Propiedades (CatalogoItem tipo inmueble)
    prisma.catalogoItem.count({
      where: {
        tenantId: { in: allTenantIds },
        tipo: 'inmueble',
        activo: true,
      },
    }),
    // Deals activos
    prisma.deal.count({
      where: {
        tenantId: { in: allTenantIds },
        estado: 'activo',
      },
    }),
    // Leads del portal
    prisma.lead.count({
      where: {
        tenantId: { in: allTenantIds },
        fuente: 'portal_inmobiliario',
      },
    }),
    // Comisiones
    prisma.comision.aggregate({
      where: { tenantId: { in: allTenantIds } },
      _sum: { montoCalculado: true },
      _count: true,
    }),
  ]);

  return {
    totalProperties,
    totalDeals,
    totalLeads,
    totalComisiones: commissionStats._sum.montoCalculado || 0,
    totalComisionesCount: commissionStats._count,
    childTenants: childTenants.map(t => ({
      id: t.id,
      nombre: t.nombre,
      moneda: t.moneda || 'EUR',
    })),
  };
}

/**
 * Marca una comisión como pagada
 */
export async function markCommissionAsPaid(
  commissionId: string,
  referenciaPago?: string,
  notasPago?: string
): Promise<Comision> {
  return prisma.comision.update({
    where: { id: commissionId },
    data: {
      estado: 'pagada',
      fechaPago: new Date(),
      referenciaPago: referenciaPago || null,
      notasPago: notasPago || null,
    },
  });
}

/**
 * Aprueba una comisión
 */
export async function approveCommission(commissionId: string): Promise<Comision> {
  return prisma.comision.update({
    where: { id: commissionId },
    data: {
      estado: 'aprobada',
      fechaAprobacion: new Date(),
    },
  });
}

/**
 * Obtiene el resumen de comisiones por agente
 */
export async function getCommissionByAgent(
  tenantId: string,
  fechaDesde?: Date,
  fechaHasta?: Date
) {
  const where: any = { tenantId };

  if (fechaDesde || fechaHasta) {
    where.fechaCreacion = {};
    if (fechaDesde) where.fechaCreacion.gte = fechaDesde;
    if (fechaHasta) where.fechaCreacion.lte = fechaHasta;
  }

  const comisiones = await prisma.comision.findMany({
    where,
    include: {
      usuario: { select: { id: true, name: true, email: true } },
      deal: { select: { titulo: true, valor: true } },
    },
    orderBy: { fechaCreacion: 'desc' },
  });

  // Agrupar por agente
  const byAgent = new Map<string, {
    agenteId: string;
    agenteNombre: string;
    totalComisiones: number;
    cantidad: number;
    pendientes: number;
    pagadas: number;
    comisiones: typeof comisiones;
  }>();

  for (const c of comisiones) {
    const agentId = c.userId;
    if (!byAgent.has(agentId)) {
      byAgent.set(agentId, {
        agenteId: agentId,
        agenteNombre: c.usuario?.name || c.usuario?.email || 'Desconocido',
        totalComisiones: 0,
        cantidad: 0,
        pendientes: 0,
        pagadas: 0,
        comisiones: [],
      });
    }

    const entry = byAgent.get(agentId)!;
    entry.totalComisiones += c.montoCalculado;
    entry.cantidad++;
    if (c.estado === 'pendiente') entry.pendientes += c.montoCalculado;
    if (c.estado === 'pagada') entry.pagadas += c.montoCalculado;
    entry.comisiones.push(c);
  }

  return Array.from(byAgent.values()).sort((a, b) => b.totalComisiones - a.totalComisiones);
}
