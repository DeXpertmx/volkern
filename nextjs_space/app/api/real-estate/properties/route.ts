export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { parseInmueble, buildCustomFieldValues, getProperties, syncPropertyOwnerToContact, type InmuebleParsed } from '@/lib/real-estate/property-helpers';

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
});

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
      status = 'disponible',
      featured = false,
      longDescription,
      seoTags,
      amenities,

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
      status,
      featured,
      longDescription,
      seoTags,
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
        moneda: moneda || 'EUR',
        activo,
        destacado,
        media: media || null,
        customFieldValues,
        categorias: ['inmueble'],
        etiquetas: seoTags ? seoTags.split(',').map((t: string) => t.trim()) : [],
      },
    });

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
});
