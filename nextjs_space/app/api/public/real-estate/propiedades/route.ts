export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Catálogo público de solo lectura: se puede cachear en el CDN unos segundos
 * para que el widget embebido en webs de terceros cargue rápido.
 */
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseInmueble } from '@/lib/real-estate/property-helpers';
import type { CatalogoItem } from '@prisma/client';

/** Convierte un parámetro de precio en número; ignora valores no numéricos. */
function precio(valor: string | null): number | undefined {
  if (!valor) return undefined;
  const limpio = valor.replace(/[^\d]/g, '');
  if (!limpio) return undefined;
  const n = Number.parseInt(limpio, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * GET /api/public/real-estate/propiedades?tenantId=XXX
 *
 * Endpoint público (sin sesión) que devuelve las propiedades activas de un
 * tenant para uso en embebidos de terceros (widget de inmuebles).
 *
 * Solo devuelve inmuebles con `activo: true` y `tipo: 'inmueble'`.
 *
 * Filtros admitidos (todos opcionales y combinables):
 *   q            texto libre sobre nombre y descripción
 *   operacion    venta | alquiler | alquiler_temporada | traspaso
 *   tipo         tipo_inmueble (Casa, Departamento, …)
 *   ciudad       coincidencia parcial en zona, ciudad o dirección
 *   estado       disponible | reservada | vendida | alquilada
 *   minPrecio    precioBase mínimo
 *   maxPrecio    precioBase máximo
 *   destacadas   true para mostrar solo las destacadas
 */
export const GET = async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json(
      { error: 'tenantId es requerido' },
      { status: 400 }
    );
  }

  // Validar que el tenant exista y esté activo
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true, slug: true, estado: true, plan: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: 'Tenant no encontrado' },
      { status: 404 }
    );
  }

  if (tenant.estado !== 'activo') {
    return NextResponse.json(
      { error: 'Tenant no activo' },
      { status: 403 }
    );
  }

  // Botón de WhatsApp: se muestra solo si el negocio tiene un número de
  // contacto y no lo ha apagado en su configuración. El número sale de la
  // instancia conectada y, si esa fila aún no lo tiene, del canal de WhatsApp
  // del tenant (el webhook no siempre llega a persistirlo en la instancia).
  // Si nada de esto es accesible desde el catálogo, se degrada a «sin botón»
  // en lugar de romper el listado.
  const digitar = (valor: unknown): string | null => {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    return digitos.length >= 8 ? digitos : null;
  };

  let whatsappNumero: string | null = null;
  let estadoInstancia: string | null = null;

  try {
    const instancia = await prisma.tenantWhatsAppInstance.findUnique({
      where: { tenantId },
      select: { phoneNumber: true, status: true },
    });
    estadoInstancia = instancia?.status ?? null;
    if (instancia?.status === 'connected') {
      whatsappNumero = digitar(instancia.phoneNumber);
    }
  } catch (error) {
    console.warn('[Public Real Estate API] WhatsApp del negocio no disponible:', error);
  }

  // Respaldo por el canal: solo si no hay instancia, o si está conectada pero
  // sin número guardado. Una instancia desconectada no debe ofrecer el botón.
  if (!whatsappNumero && (estadoInstancia === null || estadoInstancia === 'connected')) {
    try {
      const canal = await prisma.channel.findFirst({
        where: { tenantId, type: 'whatsapp', isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { config: true },
      });
      const config = canal?.config as { phoneNumber?: unknown } | null;
      whatsappNumero = digitar(config?.phoneNumber);
    } catch (error) {
      console.warn('[Public Real Estate API] Canal de WhatsApp no disponible:', error);
    }
  }

  let whatsappActivo = Boolean(whatsappNumero);

  if (whatsappNumero) {
    try {
      const ajuste = await prisma.configuracion.findUnique({
        where: { tenantId_clave: { tenantId, clave: 'widgetWhatsappBoton' } },
        select: { valor: true },
      });
      // Sin ajuste guardado el botón queda activado por defecto.
      if (ajuste?.valor === 'false') whatsappActivo = false;
    } catch {
      // Sin tabla de configuración accesible: se mantiene el valor por defecto.
    }
  }

  const limite = Math.min(
    parseInt(searchParams.get('limite') || '50', 10),
    100
  );
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const soloDestacadas = searchParams.get('destacadas') === 'true';
  const operacion = searchParams.get('operacion') || undefined;
  const tipo = searchParams.get('tipo') || undefined;
  const ciudad = searchParams.get('ciudad')?.trim() || undefined;
  const estado = searchParams.get('estado') || undefined;
  const q = searchParams.get('q')?.trim() || undefined;
  const minPrecio = precio(searchParams.get('minPrecio'));
  const maxPrecio = precio(searchParams.get('maxPrecio'));

  try {
    const where: any = {
      tenantId,
      tipo: 'inmueble',
      activo: true,
    };

    if (soloDestacadas) where.destacado = true;

    // Cada filtro es una condición independiente: antes se sobrescribía la
    // misma clave `customFieldValues`, de modo que con operación + ciudad solo
    // se aplicaba el último filtro enviado.
    const condiciones: any[] = [];
    if (operacion) {
      condiciones.push({ customFieldValues: { path: ['tipo_operacion'], equals: operacion } });
    }
    if (tipo) {
      condiciones.push({ customFieldValues: { path: ['tipo_inmueble'], equals: tipo } });
    }
    if (estado) {
      condiciones.push({ customFieldValues: { path: ['estado'], equals: estado } });
    }
    if (ciudad) {
      // El visitante escribe indistintamente el barrio («Centro») o la
      // población («Córdoba») en el mismo campo, así que se busca en los tres:
      // buscar solo en `zona`/`direccion` dejaba «Córdoba» con un único
      // resultado (una calle llamada así) y ocultaba el resto de la ciudad.
      condiciones.push({
        OR: [
          { customFieldValues: { path: ['zona'], string_contains: ciudad } },
          { customFieldValues: { path: ['ciudad'], string_contains: ciudad } },
          { customFieldValues: { path: ['direccion'], string_contains: ciudad } },
        ],
      });
    }
    if (q) {
      condiciones.push({
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          { descripcion: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (minPrecio !== undefined) {
      condiciones.push({ precioBase: { gte: minPrecio } });
    }
    if (maxPrecio !== undefined) {
      condiciones.push({ precioBase: { lte: maxPrecio } });
    }
    if (condiciones.length > 0) where.AND = condiciones;

    const items = await prisma.catalogoItem.findMany({
      where,
      orderBy: [
        { destacado: 'desc' },
        { fechaCreacion: 'desc' },
      ],
      skip: offset,
      take: limite,
    });

    const total = await prisma.catalogoItem.count({ where });

    const properties = (items as unknown as CatalogoItem[]).map(parseInmueble);

    return NextResponse.json(
      {
        ok: true,
        tenant: {
          id: tenant.id,
          nombre: tenant.nombre,
          slug: tenant.slug,
          whatsapp: {
            activo: whatsappActivo,
            numero: whatsappNumero,
          },
        },
        properties,
        pagination: {
          limit: limite,
          offset,
          total,
          totalPages: Math.ceil(total / limite),
          currentPage: Math.floor(offset / limite) + 1,
        },
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error('[Public Real Estate API] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener propiedades' },
      { status: 500 }
    );
  }
};
