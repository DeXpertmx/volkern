export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { monedaEscritura } from '@/lib/moneda';
import { parseInmueble, buildCustomFieldValues, getProperties, syncPropertyOwnerToContact, type InmuebleParsed } from '@/lib/real-estate/property-helpers';
import { revalidarPortalDeInmueble } from '@/lib/real-estate/portal-revalidate';

/**
 * GET /api/real-estate/properties
 *
 * Lista paginada de propiedades inmobiliarias con filtros.
 * Endpoint interno (autenticado con API key o sesión).
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;
  const { searchParams } = new URL(req.url);

  const filters = {
    operationType: searchParams.get('operationType') || undefined,
    propertyType: searchParams.get('propertyType') || undefined,
    city: searchParams.get('city') || undefined,
    minPrice: searchParams.get('minPrice') ? parseInt(searchParams.get('minPrice')!) : undefined,
    maxPrice: searchParams.get('maxPrice') ? parseInt(searchParams.get('maxPrice')!) : undefined,
    minBedrooms: searchParams.get('minBedrooms') ? parseInt(searchParams.get('minBedrooms')!) : undefined,
    minArea: searchParams.get('minArea') ? parseInt(searchParams.get('minArea')!) : undefined,
    status: searchParams.get('status') || undefined,
    featured: searchParams.get('featured') === 'true' ? true : searchParams.get('featured') === 'false' ? false : undefined,
    limit: Math.min(parseInt(searchParams.get('limit') || '50'), 100),
    offset: parseInt(searchParams.get('offset') || '0'),
  };

  // Búsqueda textual
  const search = searchParams.get('search');

  try {
    if (search) {
      // Búsqueda textual con Prisma ORM
      const [items, total] = await Promise.all([
        prisma.catalogoItem.findMany({
          where: {
            tenantId,
            tipo: 'inmueble',
            activo: true,
            OR: [
              { nombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
            ],
            ...(filters.status ? {
              customFieldValues: {
                path: ['estado'],
                equals: filters.status,
              },
            } : {}),
          },
          orderBy: [
            { destacado: 'desc' },
            { fechaCreacion: 'desc' },
          ],
          skip: filters.offset,
          take: filters.limit,
        }),
        prisma.catalogoItem.count({
          where: {
            tenantId,
            tipo: 'inmueble',
            activo: true,
            OR: [
              { nombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
            ],
          },
        }),
      ]);

      return NextResponse.json({
        properties: parseInmueble(items as any),
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          total,
          totalPages: Math.ceil(total / filters.limit),
          currentPage: Math.floor(filters.offset / filters.limit) + 1,
        },
      });
    }

    // Filtros avanzados
    const result = await getProperties(tenantId, filters);

    return NextResponse.json({
      properties: result.properties,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: result.total,
        totalPages: Math.ceil(result.total / filters.limit),
        currentPage: Math.floor(filters.offset / filters.limit) + 1,
      },
    });
  } catch (error) {
    console.error('[Real Estate API] Error listing properties:', error);
    return NextResponse.json(
      { error: 'Error al obtener propiedades' },
      { status: 500 }
    );
  }
}, ['real-estate:read']);

/**
 * Valida un mapa de contadores para `habitaciones_detalle`/`camas_detalle`.
 * Devuelve `undefined` cuando la forma no es un objeto de enteros ≥ 0.
 */
function saneardetalle(valor: unknown): Record<string, number> | undefined {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return undefined;
  const salida: Record<string, number> = {};
  for (const [clave, numero] of Object.entries(valor as Record<string, unknown>)) {
    const n = Number(numero);
    if (typeof clave === 'string' && clave.length > 0 && Number.isInteger(n) && n >= 0) {
      salida[clave] = n;
    }
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
}

/**
 * POST /api/real-estate/properties
 *
 * Crea una nueva propiedad inmobiliaria.
 */
export const POST = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    const body = await req.json();
    const {
      nombre,
      descripcion,
      precioBase,
      moneda,
      activo = true,
      destacado = false,
      media,

      // Campos inmobiliarios (mapeados a customFieldValues)
      operationType,
      propertyType,
      areaM2,
      builtM2,
      bedrooms,
      bathrooms,
      parking,
      address,
      city,
      lat,
      lng,
      yearBuilt,
      hasElevator,
      hasParking,
      hasPool,
      hasGarden,
      hasStorageRoom,
      furnished,
      orientation,
      energyCert,
      energyCertConsumption,
      energyCertEmission,
      energyCertBody,
      energyCertDate,
      energyCertExpiry,
      energyCertUrl,
      status = 'disponible',
      featured = false,
      longDescription,
      seoTags,
      amenities,

      // 🛏️ Detalle del editor por secciones
      roomsDetail,
      bedsDetail,
      servicios,

      // Propietario / Vendedor
      ownerName,
      ownerPhone,
      ownerEmail,
      ownerContactId,
    } = body;

    if (!nombre || precioBase === undefined) {
      return NextResponse.json(
        { error: 'Nombre y precio base son requeridos' },
        { status: 400 }
      );
    }

    // Construir customFieldValues desde los campos inmobiliarios
    const customFieldValues = buildCustomFieldValues({
      operationType,
      propertyType,
      areaM2,
      builtM2,
      bedrooms,
      bathrooms,
      parking,
      address,
      city,
      lat,
      lng,
      yearBuilt,
      hasElevator,
      hasParking,
      hasPool,
      hasGarden,
      hasStorageRoom,
      furnished,
      orientation,
      energyCert,
      energyCertConsumption,
      energyCertEmission,
      energyCertBody,
      energyCertDate,
      energyCertExpiry,
      energyCertUrl,
      status,
      featured,
      longDescription,
      seoTags,
      roomsDetail: saneardetalle(roomsDetail),
      bedsDetail: saneardetalle(bedsDetail),
      servicios: Array.isArray(servicios)
        ? servicios.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
        : undefined,
      owner: {
        name: ownerName,
        phone: ownerPhone,
        email: ownerEmail,
        contactId: ownerContactId,
      },
    } as unknown as Partial<InmuebleParsed>);

    // Agregar amenidades si vienen
    if (amenities) {
      customFieldValues.amenidades = amenities;
    }

    const item = await prisma.catalogoItem.create({
      data: {
        tenantId,
        nombre,
        descripcion: descripcion || null,
        tipo: 'inmueble',
        precioBase: parseFloat(precioBase),
        // Divisa del inmueble: la que indique el usuario y, si no la indica, la
        // moneda de reporte del tenant. Antes caía a 'EUR' —el valor por defecto
        // de la columna—, así que un inmueble de un tenant en pesos nacía en euros.
        moneda: monedaEscritura(moneda, auth.tenant?.moneda),
        activo,
        destacado,
        media: media || null,
        customFieldValues,
        categorias: ['inmueble'],
        etiquetas: seoTags ? seoTags.split(',').map((t: string) => t.trim()) : [],
      },
    });

    // El portal es ISR: al crear la ficha se invalida la portada, el catálogo y
    // la propia ficha de esta cuenta, sin esperar al ciclo de revalidación.
    await revalidarPortalDeInmueble(tenantId, item.id);

    // Sincronizar propietario → Contact en CRM (best-effort)
    if (ownerContactId) {
      syncPropertyOwnerToContact(tenantId, ownerContactId, {
        name: ownerName,
        phone: ownerPhone,
        email: ownerEmail,
      }).catch((err) =>
        console.error('[Properties POST] Owner sync failed (non-blocking):', err)
      );
    }

    return NextResponse.json(parseInmueble(item), { status: 201 });
  } catch (error) {
    console.error('[Real Estate API] Error creating property:', error);
    return NextResponse.json(
      { error: 'Error al crear la propiedad' },
      { status: 500 }
    );
  }
}, ['real-estate:write']);

/**
 * PATCH /api/real-estate/properties
 *
 * Acción masiva del listado: marca o desmarca varias fichas como publicables
 * en portales de una sola vez (una petición por ficha obligaría a decenas de
 * PATCH al seleccionar media cartera).
 *
 * Body: { ids: string[], publicableEnPortales: boolean }
 */
export const PATCH = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    const body = await req.json();
    const ids: unknown = body?.ids;
    const publicable = body?.publicableEnPortales;

    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
      return NextResponse.json(
        { error: 'ids debe ser un array de identificadores' },
        { status: 400 }
      );
    }
    if (typeof publicable !== 'boolean') {
      return NextResponse.json(
        { error: 'publicableEnPortales debe ser true o false' },
        { status: 400 }
      );
    }

    // Sólo fichas del tenant y de tipo inmueble: los ids vienen del cliente.
    const items = await prisma.catalogoItem.findMany({
      where: { tenantId, tipo: 'inmueble', id: { in: ids as string[] } },
      select: { id: true, customFieldValues: true },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Ninguna de las propiedades indicadas existe' },
        { status: 404 }
      );
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.catalogoItem.update({
          where: { id: item.id },
          data: {
            customFieldValues: {
              ...((item.customFieldValues as Record<string, any>) || {}),
              publicable_portales: publicable,
            },
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      actualizadas: items.length,
      publicableEnPortales: publicable,
    });
  } catch (error) {
    console.error('[Properties PATCH masivo] Error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar las propiedades' },
      { status: 500 }
    );
  }
}, ['real-estate:write']);
