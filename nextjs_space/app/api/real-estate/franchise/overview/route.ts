export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getFranchiseGlobalStats, getFranchiseCommissionSummary } from '@/lib/real-estate/commission-calculator';
import { enCadaConexion, sumarPorMoneda } from '@/lib/real-estate/franquicia';

/**
 * GET /api/real-estate/franchise/overview
 *
 * Dashboard consolidado para el franquiciatario master.
 * Muestra estadísticas agregadas de todas las oficinas (sub-tenants).
 *
 * Toda lectura consolidada pasa por `enCadaConexion`: cada oficina puede estar en
 * una base de datos distinta de la matriz, y consultar con un `IN` sobre una sola
 * conexión devolvería ceros sin dar error.
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  // Validar que sea una cuenta de tipo AGENCY o BUSINESS con módulo REAL_ESTATE
  if (auth.tenant?.accountType !== 'AGENCY' && auth.tenant?.accountType !== 'BUSINESS') {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Franquicia' },
      { status: 403 }
    );
  }

  try {
    // 1. Estadísticas globales (agregadas por conexión)
    const globalStats = await getFranchiseGlobalStats(tenantId);

    const childTenantIds = globalStats.childTenants.map(t => t.id);
    const allTenantIds = [tenantId, ...childTenantIds];

    // 2. Resumen de comisiones por oficina
    const commissionSummary = await getFranchiseCommissionSummary(tenantId, true);

    // 3. Top propiedades más recientes (se toma el top de cada conexión y se
    //    vuelve a recortar: el top global está contenido en la unión)
    const propiedades = (
      await enCadaConexion(allTenantIds, (idsDeLaConexion) =>
        prisma.catalogoItem.findMany({
          where: {
            tenantId: { in: idsDeLaConexion },
            tipo: 'inmueble',
            activo: true,
          },
          orderBy: { fechaCreacion: 'desc' },
          take: 10,
          select: {
            id: true,
            nombre: true,
            precioBase: true,
            tenantId: true,
            customFieldValues: true,
            media: true,
            fechaCreacion: true,
          },
        }),
      )
    ).flat();
    const topProperties = propiedades
      .sort((a, b) => b.fechaCreacion.getTime() - a.fechaCreacion.getTime())
      .slice(0, 10);

    // 4. Leads recientes
    const leads = (
      await enCadaConexion(allTenantIds, (idsDeLaConexion) =>
        prisma.lead.findMany({
          where: {
            tenantId: { in: idsDeLaConexion },
            fuente: 'portal_inmobiliario',
          },
          orderBy: { fechaCreacion: 'desc' },
          take: 10,
          select: {
            id: true,
            nombre: true,
            email: true,
            empresa: true,
            tenantId: true,
            fechaCreacion: true,
          },
        }),
      )
    ).flat();
    const recentLeads = leads
      .sort((a, b) => b.fechaCreacion.getTime() - a.fechaCreacion.getTime())
      .slice(0, 10);

    // 5. Deals por etapa. El valor se agrupa por divisa: sumar pesos y euros en
    //    una cifra daría un número sin significado.
    const deals = (
      await enCadaConexion(allTenantIds, (idsDeLaConexion) =>
        prisma.deal.findMany({
          where: { tenantId: { in: idsDeLaConexion }, estado: 'activo' },
          select: { etapa: true, valor: true, moneda: true },
        }),
      )
    ).flat();

    const etapas = new Map<string, Array<{ moneda: string; monto: number; estado: string }>>();
    for (const deal of deals) {
      const filas = etapas.get(deal.etapa) ?? [];
      filas.push({ moneda: deal.moneda, monto: deal.valor, estado: 'activo' });
      etapas.set(deal.etapa, filas);
    }

    const dealsByStage = [...etapas.entries()].map(([etapa, filas]) => {
      const porMoneda = sumarPorMoneda(filas);
      const cantidad = filas.length;
      return {
        etapa,
        cantidad,
        // Cifra única solo si la etapa está íntegramente en una divisa.
        valorTotal: porMoneda.length <= 1 ? (porMoneda[0]?.total ?? 0) : null,
        multiDivisa: porMoneda.length > 1,
        porMoneda: porMoneda.map(p => ({ moneda: p.moneda, valorTotal: p.total })),
      };
    }).sort((a, b) => b.cantidad - a.cantidad);

    // Mapear nombres de tenants (incluye el tenant principal + hijos de globalStats)
    const tenantNames = new Map(
      [[tenantId, auth.tenant!.nombre], ...globalStats.childTenants.map(t => [t.id, t.nombre] as [string, string])]
    );

    return NextResponse.json({
      globalStats,
      commissions: commissionSummary,
      topProperties: topProperties.map(p => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precioBase,
        oficina: tenantNames.get(p.tenantId) || '—',
        ciudad: (p.customFieldValues as Record<string, unknown>)?.zona || '',
        imagen: Array.isArray(p.media) ? ((p.media[0] as { url?: string })?.url || '') : '',
        fechaCreacion: p.fechaCreacion,
      })),
      recentLeads: recentLeads.map(l => ({
        ...l,
        oficina: tenantNames.get(l.tenantId ?? '') || '—',
      })),
      dealsByStage,
    });
  } catch (error) {
    console.error('[Franchise Overview] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos del dashboard' },
      { status: 500 }
    );
  }
}, ['real-estate:read']);
