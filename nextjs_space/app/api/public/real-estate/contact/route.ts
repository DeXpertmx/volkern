export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { applyRateLimit, RATE_LIMIT_ACTIONS } from "@/lib/rate-limit-middleware";
import { eventBus, EVENTS } from "@/lib/skills/event-bus";

/**
 * POST /api/public/real-estate/contact
 * 
 * Formulario de contacto para propiedades inmobiliarias.
 * Crea un lead asociado a la propiedad consultada.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      slug,
      propertyId, 
      name, 
      email, 
      phone, 
      message, 
      preferredDate 
    } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "Se requiere slug del tenant" },
        { status: 400 }
      );
    }

    if (!name || !email) {
      return NextResponse.json(
        { error: "Nombre y email son obligatorios" },
        { status: 400 }
      );
    }

    // 1. Resolver tenant
    const tenant = await globalPrisma.tenant.findUnique({
      where: { slug },
      select: { id: true, nombre: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant no encontrado" },
        { status: 404 }
      );
    }

    // 2. Rate limiting
    const rateLimitReq = new NextRequest(req.url, {
      headers: { "x-tenant-id": tenant.id },
    });
    const rateLimitResult = await applyRateLimit(rateLimitReq, {
      action: "api_request_hour",
      customLimit: 50,
    });
    if (rateLimitResult) return rateLimitResult;

    const tenantClient = await getTenantDb(tenant.id);

    return await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
      // 3. Obtener propiedad (si se especificó)
      let propertyName = "";
      if (propertyId) {
        const property = await prisma.catalogoItem.findFirst({
          where: {
            id: propertyId,
            tenantId: tenant.id,
            tipo: "inmueble",
          },
          select: { id: true, nombre: true, precioBase: true },
        });
        if (property) {
          propertyName = property.nombre;
        }
      }

      // 4. Crear lead desde la skill existente
      const { executeSkill } = await import("@/lib/skills");
      
      const lead = await executeSkill("create_lead", {
        tenantId: tenant.id,
        nombre: name,
        email,
        telefono: phone || "",
        notas: `[Portal Inmobiliario] ${message || "Sin mensaje adicional"}${propertyName ? `\nPropiedad: ${propertyName}` : ""}${preferredDate ? `\nFecha preferida de visita: ${preferredDate}` : ""}`,
        fuente: "portal_inmobiliario" as any,
        metadataExterna: {
          propertyId: propertyId || null,
          propertyName,
          preferredVisitDate: preferredDate || null,
          sourceUrl: req.headers.get("referer") || "",
          userAgent: req.headers.get("user-agent") || "",
          ip: req.headers.get("x-forwarded-for") || "unknown",
        } as any,
      } as any);

      // 5. Si hay propiedad, registrar interés en metadata
      if (propertyId && lead) {
        try {
          const currentMetadata = await prisma.catalogoItem.findUnique({
            where: { id: propertyId },
            select: { metadata: true },
          });
          const existingMetadata = typeof currentMetadata?.metadata === "object" && currentMetadata.metadata !== null
            ? currentMetadata.metadata
            : {};

          await prisma.catalogoItem.update({
            where: { id: propertyId },
            data: {
              metadata: {
                ...(existingMetadata as Record<string, unknown>),
                lastLeadAt: new Date().toISOString(),
              },
            },
          });
          // Incremento atómico
          await prisma.$executeRawUnsafe(
            `UPDATE "CatalogoItem" SET "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{totalLeads}', COALESCE(("metadata"->>'totalLeads')::int::text::jsonb, '0'::jsonb) + '1'::jsonb) WHERE id = $1`,
            propertyId
          );
        } catch {
          // No crítico si falla
        }
      }

      // 6. Disparar evento de lead creado
      if (lead) {
        eventBus.emitEvent(EVENTS.LEAD_CREATED, {
          tenantId: tenant.id,
          leadId: lead.id,
          email: lead.email,
          source: "portal_inmobiliario" as any,
          propertyId: propertyId || null,
          timestamp: new Date(),
        } as any);
      }

      return NextResponse.json({
        success: true,
        message: "Gracias por tu interés. Te contactaremos pronto.",
        leadId: lead?.id || null,
      });
    });
  } catch (error: any) {
    console.error("[Real Estate Contact] Error:", error);
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
