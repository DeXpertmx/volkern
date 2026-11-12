export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { applyRateLimit, RATE_LIMIT_ACTIONS } from "@/lib/rate-limit-middleware";
import { eventBus, EVENTS } from "@/lib/skills/event-bus";
import { referenciaPropiedad } from "@/lib/real-estate/referencia";

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
      tenantId: tenantIdBody,
      propertyId, 
      name, 
      email, 
      phone, 
      message, 
      preferredDate,
      consent,
      // El widget embebible marca su origen: solo esos leads avisan al equipo
      // por email, para no cambiar el comportamiento del formulario del portal.
      origen,
    } = body;

    if (!slug && !tenantIdBody) {
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

    // 1. Resolver tenant. El widget embebible solo conoce el id (data-tenant-id),
    // así que se admite también; el slug sigue teniendo prioridad.
    const tenant = slug
      ? await globalPrisma.tenant.findUnique({
          where: { slug },
          select: { id: true, nombre: true, subdomain: true },
        })
      : await globalPrisma.tenant.findUnique({
          where: { id: String(tenantIdBody) },
          select: { id: true, nombre: true, subdomain: true },
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
      //
      // El `id` llega del formulario público, así que la búsqueda va acotada al
      // tenant y el resultado es lo único que autoriza a escribir después: si la
      // propiedad es de otra cuenta, `property` es null y no se toca nada.
      const property = propertyId
        ? await prisma.catalogoItem.findFirst({
            where: {
              id: propertyId,
              tenantId: tenant.id,
              tipo: "inmueble",
            },
            select: { id: true, nombre: true, metadata: true, sku: true, customFieldValues: true },
          })
        : null;
      const propertyName = property?.nombre || "";
      // La referencia es lo que el asesor usa para identificar el inmueble en
      // el CRM; se guarda junto al nombre para no depender de abrirlo.
      const propertyReferencia = property ? referenciaPropiedad(property) : "";

      // 4. Crear lead desde la skill existente
      const { executeSkill } = await import("@/lib/skills");
      
      const lead = await executeSkill("create_lead", {
        tenantId: tenant.id,
        nombre: name,
        email,
        telefono: phone || "",
        notas: `[Portal Inmobiliario] ${message || "Sin mensaje adicional"}${propertyName ? `\nPropiedad: ${propertyName}${propertyReferencia ? ` (Ref: ${propertyReferencia})` : ""}` : ""}${preferredDate ? `\nFecha preferida de visita: ${preferredDate}` : ""}${consent === true ? `\nConsentimiento de contacto aceptado (${new Date().toISOString()})` : ""}`,
        fuente: "portal_inmobiliario" as any,
        metadataExterna: {
          propertyId: propertyId || null,
          propertyName,
          propiedadReferencia: propertyReferencia || null,
          preferredVisitDate: preferredDate || null,
          sourceUrl: req.headers.get("referer") || "",
          userAgent: req.headers.get("user-agent") || "",
          ip: req.headers.get("x-forwarded-for") || "unknown",
        } as any,
      } as any);

      // 5. Si la propiedad es de este tenant, registrar el interés en su metadata
      if (property && lead) {
        try {
          // La ficha del lead muestra las notas (`Note`), no el campo `notas`,
          // así que la referencia se registra también ahí: el asesor sabe qué
          // inmueble consultó sin abrir la conversación.
          if (propertyReferencia) {
            await prisma.note.create({
              data: {
                leadId: lead.id,
                contenido: `Propiedad consultada: ${propertyName} (Ref: ${propertyReferencia})`,
                metadata: {
                  propiedadId: property.id,
                  propiedadReferencia: propertyReferencia,
                } as any,
              },
            });
          }

          const existingMetadata =
            typeof property.metadata === "object" && property.metadata !== null
              ? property.metadata
              : {};

          await prisma.catalogoItem.updateMany({
            where: { id: property.id, tenantId: tenant.id },
            data: {
              metadata: {
                ...(existingMetadata as Record<string, unknown>),
                lastLeadAt: new Date().toISOString(),
              },
            },
          });

          // Incremento atómico, en la conexión de este tenant y acotado por
          // `tenantId`: el SQL crudo del proxy sale siempre por la conexión
          // global, así que el filtro tiene que ir en la propia sentencia.
          await (tenantClient as unknown as {
            $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown>;
          }).$executeRawUnsafe(
            `UPDATE "CatalogoItem" SET "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{totalLeads}', COALESCE(("metadata"->>'totalLeads')::int::text::jsonb, '0'::jsonb) + '1'::jsonb) WHERE id = $1 AND "tenantId" = $2`,
            property.id,
            tenant.id
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

      // 7. Avisar al equipo por email cuando el lead viene del widget embebible.
      // Nunca bloquea ni cambia la respuesta: el lead ya está creado y el
      // visitante tiene que ver su «gracias» aunque el correo falle.
      if (lead && origen === "widget") {
        try {
          const { avisarLeadDesdeWidget } = await import("@/lib/real-estate/aviso-lead");
          await avisarLeadDesdeWidget({
            tenantId: tenant.id,
            tenantName: tenant.nombre,
            tenantSubdomain: tenant.subdomain,
            leadId: lead.id,
            nombre: name,
            email,
            telefono: phone || null,
            mensaje: message || null,
            propiedad: property ? { id: property.id, nombre: propertyName } : null,
            consentimiento: consent === true,
            origenUrl: req.headers.get("referer") || null,
          });
        } catch (avisoError) {
          console.error("[Real Estate Contact] No se pudo avisar al equipo del lead:", avisoError);
        }
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
