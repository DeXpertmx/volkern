export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { parseInmueble, buildCustomFieldValues, updatePropertyCustomFields, syncPropertyOwnerToContact, type InmuebleParsed } from '@/lib/real-estate/property-helpers';

/**
 * Valida un mapa de contadores para `habitaciones_detalle`/`camas_detalle`.
 * Devuelve `{}` cuando la forma no es un objeto de enteros ≥ 0.
 */
function saneardetalle(valor: unknown): Record<string, number> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const salida: Record<string, number> = {};
  for (const [clave, numero] of Object.entries(valor as Record<string, unknown>)) {
    const n = Number(numero);
    if (typeof clave === 'string' && clave.length > 0 && Number.isInteger(n) && n >= 0) {
      salida[clave] = n;
    }
  }
  return salida;
}

/**
 * GET /api/real-estate/properties/[id]
 *
 * Obtiene una propiedad por ID.
 */
export const GET = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const item = await prisma.catalogoItem.findFirst({
      where: {
        id,
        tenantId,
        tipo: 'inmueble',
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Propiedad no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(parseInmueble(item));
  } catch (error) {
    console.error('[Real Estate API] Error getting property:', error);
    return NextResponse.json(
      { error: 'Error al obtener la propiedad' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/real-estate/properties/[id]
 *
 * Actualiza una propiedad existente.
 */
export const PATCH = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    // Verificar que existe
    const existing = await prisma.catalogoItem.findFirst({
      where: { id, tenantId, tipo: 'inmueble' },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Propiedad no encontrada' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const updateData: any = {};

    // Campos directos de CatalogoItem
    const directFields = ['nombre', 'descripcion', 'precioBase', 'moneda', 'activo', 'destacado', 'media'];
    for (const field of directFields) {
      if (body[field] !== undefined) {
        updateData[field] = field === 'precioBase' ? parseFloat(body[field]) : body[field];
      }
    }

    // Campos inmobiliarios → customFieldValues
    const customFields: Record<string, any> = {};
    const inmuebleFields: Array<{ key: string; field: string; type: 'string' | 'number' | 'boolean' }> = [
      { key: 'operationType', field: 'tipo_operacion', type: 'string' },
      { key: 'propertyType', field: 'tipo_inmueble', type: 'string' },
      { key: 'areaM2', field: 'superficie_total', type: 'number' },
      { key: 'builtM2', field: 'superficie_construida', type: 'number' },
      { key: 'bedrooms', field: 'habitaciones', type: 'number' },
      { key: 'bathrooms', field: 'banos', type: 'number' },
      { key: 'parking', field: 'estacionamientos', type: 'number' },
      { key: 'address', field: 'direccion', type: 'string' },
      { key: 'city', field: 'zona', type: 'string' },
      { key: 'lat', field: 'latitud', type: 'number' },
      { key: 'lng', field: 'longitud', type: 'number' },
      { key: 'yearBuilt', field: 'antiguedad', type: 'number' },
      { key: 'status', field: 'estado', type: 'string' },
      { key: 'orientation', field: 'orientacion', type: 'string' },
      { key: 'energyCert', field: 'certificacion_energetica', type: 'string' },
      { key: 'energyCertConsumption', field: 'consumo_energetico', type: 'number' },
      { key: 'energyCertEmission', field: 'emisiones_co2', type: 'number' },
      { key: 'energyCertBody', field: 'organismo_certificador', type: 'string' },
      { key: 'energyCertDate', field: 'fecha_certificado', type: 'string' },
      { key: 'energyCertExpiry', field: 'caducidad_certificado', type: 'string' },
      { key: 'energyCertUrl', field: 'documento_certificado', type: 'string' },
      { key: 'longDescription', field: 'descripcion_larga', type: 'string' },
      { key: 'seoTags', field: 'tags_seo', type: 'string' },
      { key: 'amenities', field: 'amenidades', type: 'string' },
      // 👤 Propietario
      { key: 'ownerName', field: 'propietario_nombre', type: 'string' },
      { key: 'ownerPhone', field: 'propietario_telefono', type: 'string' },
      { key: 'ownerEmail', field: 'propietario_email', type: 'string' },
      { key: 'ownerContactId', field: 'propietario_contact_id', type: 'string' },
    ];

    const booleanFields: Array<{ key: string; field: string }> = [
      { key: 'hasElevator', field: 'ascensor' },
      { key: 'hasParking', field: 'estacionamiento' },
      { key: 'hasPool', field: 'alberca' },
      { key: 'hasGarden', field: 'jardin' },
      { key: 'hasStorageRoom', field: 'trastero' },
      { key: 'furnished', field: 'amueblado' },
      { key: 'hasTerrace', field: 'terraza' },
      { key: 'hasBalcony', field: 'balcon' },
      { key: 'hasAirConditioning', field: 'aire_acondicionado' },
      { key: 'hasHeating', field: 'calefaccion' },
      { key: 'featured', field: 'destacada' },
    ];

    for (const f of inmuebleFields) {
      if (body[f.key] !== undefined) {
        customFields[f.field] = f.type === 'number' ? Number(body[f.key]) : body[f.key];
      }
    }

    for (const f of booleanFields) {
      if (body[f.key] !== undefined) {
        customFields[f.field] = body[f.key] ? true : false;
      }
    }

    // 🛏️ Detalle del editor por secciones: habitaciones, camas y servicios.
    // Se sanea antes de persistir: el JSONB acepta cualquier forma y un mapa
    // corrupto rompería los contadores del editor.
    if (body.roomsDetail !== undefined) {
      customFields.habitaciones_detalle = saneardetalle(body.roomsDetail);
    }
    if (body.bedsDetail !== undefined) {
      customFields.camas_detalle = saneardetalle(body.bedsDetail);
    }
    if (body.servicios !== undefined) {
      customFields.servicios = Array.isArray(body.servicios)
        ? body.servicios.filter((s: unknown) => typeof s === 'string' && s.length > 0)
        : [];
    }

    // Si hay campos inmobiliarios, hacer merge con los existentes
    if (Object.keys(customFields).length > 0) {
      const current = (existing.customFieldValues as Record<string, any>) || {};
      updateData.customFieldValues = { ...current, ...customFields };
    }

    // Actualizar etiquetas si se envían tags SEO
    if (body.seoTags !== undefined) {
      updateData.etiquetas = body.seoTags.split(',').map((t: string) => t.trim());
    }

    const updated = await prisma.catalogoItem.update({
      where: { id },
      data: updateData,
    });

    // Sincronizar propietario → Contact en CRM
    // Solo usar valor actual si el campo NO fue enviado en el body
    const wasSent = (key: string) => body[key] !== undefined;
    const orCurrent = (key: string, current: any) => wasSent(key) ? body[key] : current;

    const currentFields = (existing.customFieldValues as Record<string, any>) || {};
    const contactIdSent = wasSent('ownerContactId');
    const ownerDataSent = wasSent('ownerName') || wasSent('ownerPhone') || wasSent('ownerEmail');

    if (contactIdSent || ownerDataSent) {
      const resolvedContactId = orCurrent('ownerContactId', currentFields.propietario_contact_id) ?? undefined;
      const resolvedName      = orCurrent('ownerName',      currentFields.propietario_nombre)      ?? undefined;
      const resolvedPhone     = orCurrent('ownerPhone',     currentFields.propietario_telefono)    ?? undefined;
      const resolvedEmail     = orCurrent('ownerEmail',     currentFields.propietario_email)       ?? undefined;

      syncPropertyOwnerToContact(tenantId, resolvedContactId, {
        name: resolvedName,
        phone: resolvedPhone,
        email: resolvedEmail,
      }).catch((err) =>
        console.error('[Properties PATCH] Owner sync failed (non-blocking):', err)
      );
    }

    return NextResponse.json(parseInmueble(updated));
  } catch (error) {
    console.error('[Real Estate API] Error updating property:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la propiedad' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/real-estate/properties/[id]
 *
 * Elimina (soft-delete) una propiedad.
 */
export const DELETE = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const existing = await prisma.catalogoItem.findFirst({
      where: { id, tenantId, tipo: 'inmueble' },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Propiedad no encontrada' },
        { status: 404 }
      );
    }

    // Soft-delete: desactivar en lugar de eliminar
    await prisma.catalogoItem.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ success: true, message: 'Propiedad desactivada exitosamente' });
  } catch (error) {
    console.error('[Real Estate API] Error deleting property:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la propiedad' },
      { status: 500 }
    );
  }
});
