export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPropertyStats } from "@/lib/real-estate/property-helpers";
import { withTenantAuth } from "@/lib/api-key-auth";

/**
 * GET /api/real-estate/dashboard-stats
 * 
 * Estadísticas consolidadas del dashboard inmobiliario.
 * Endpoint interno (no público).
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    // 1. Estadísticas de propiedades
    const stats = await getPropertyStats(tenantId);

    // 2. Leads del mes (de propiedades)
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [leadsThisMonth, totalLeads] = await Promise.all([
      prisma.lead.count({
        where: {
          tenantId,
          fuente: "portal_inmobiliario",
          fechaCreacion: { gte: thisMonth },
        },
      }),
      prisma.lead.count({
        where: {
          tenantId,
          fuente: "portal_inmobiliario",
        },
      }),
    ]);

    // 3. Visitas agendadas (Citas con catalogoItemId)
    const [visitsPending, visitsCompleted] = await Promise.all([
      prisma.cita.count({
        where: {
          tenantId,
          catalogoItemId: { not: null },
          estado: "pendiente",
          fechaHora: { gte: new Date() },
        },
      }),
      prisma.cita.count({
        where: {
          tenantId,
          catalogoItemId: { not: null },
          estado: "completada",
        },
      }),
    ]);

    // 4. Propiedades recientes
    const recentProperties = await prisma.catalogoItem.findMany({
      where: {
        tenantId,
        tipo: "inmueble",
        activo: true,
      },
      orderBy: { fechaCreacion: "desc" },
      take: 10,
      select: {
        id: true,
        nombre: true,
        precioBase: true,
        customFieldValues: true,
        media: true,
        fechaCreacion: true,
      },
    });

    // 5. Distribución por tipo de operación — usando findMany + group en JS
    const allProperties = await prisma.catalogoItem.findMany({
      where: {
        tenantId,
        tipo: "inmueble",
        activo: true,
      },
      select: {
        customFieldValues: true,
      },
    });

    const opCount: Record<string, number> = {};
    const cityCount: Record<string, number> = {};
    for (const p of allProperties) {
      const cfv = p.customFieldValues as Record<string, any> | null;
      const op = cfv?.tipo_operacion || "Sin especificar";
      opCount[op] = (opCount[op] || 0) + 1;

      const city = cfv?.zona || cfv?.ciudad || "Sin ubicación";
      cityCount[city] = (cityCount[city] || 0) + 1;
    }

    const byOperation = Object.entries(opCount).map(([operation, count]) => ({ operation, count }));
    const byCity = Object.entries(cityCount)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      // Moneda de reporte del tenant: con la que se deben escribir los importes
      // de este panel. Antes el cliente los escribía siempre en euros.
      moneda: auth.tenant?.moneda ?? "",
      stats,
      leads: {
        thisMonth: leadsThisMonth,
        total: totalLeads,
      },
      visits: {
        pending: visitsPending,
        completed: visitsCompleted,
        total: visitsPending + visitsCompleted,
      },
      recentProperties: recentProperties.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precioBase: p.precioBase,
        ciudad: (p.customFieldValues as any)?.zona || (p.customFieldValues as any)?.ciudad || "",
        tipo_operacion: (p.customFieldValues as any)?.tipo_operacion || "",
        imagen: Array.isArray(p.media) ? (p.media[0] as any)?.url || "" : "",
        fechaCreacion: p.fechaCreacion,
      })),
      distribution: {
        byOperation,
        byCity,
      },
    });
  } catch (error: any) {
    console.error("[Real Estate Dashboard] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}, ['real-estate:read']);
