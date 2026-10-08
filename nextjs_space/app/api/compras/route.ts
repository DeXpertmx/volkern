export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { monedaEscritura } from '@/lib/moneda';
import { validateBody, CommonSchemas } from '@/lib/validation';
import { ErrorCompra, crearCompra, statusDeErrorCompra } from '@/lib/compras/service';
import { ESTADOS_COMPRA, ETIQUETAS_ESTADO, pendienteDeRecepcion, type EstadoCompra } from '@/lib/compras/reglas';

/** Línea que envía el formulario de pedido. */
const LineaInputSchema = z.object({
  catalogoItemId: CommonSchemas.id.optional().nullable(),
  concepto: z.string().min(1, 'Cada línea necesita un concepto').max(300),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero'),
  precioUnitario: z.coerce.number().min(0),
  porcentajeImpuesto: z.coerce.number().min(0).max(100).optional().nullable(),
});

const CompraInputSchema = z.object({
  proveedorId: CommonSchemas.id.optional().nullable(),
  almacenId: CommonSchemas.id.optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
  fechaEntrega: z.string().datetime().optional().nullable(),
  items: z.array(LineaInputSchema).min(1, 'El pedido necesita al menos una línea'),
});

/**
 * GET /api/compras — Pedidos del tenant.
 *
 * Filtros: `estado`, `proveedorId`, `search` (número, proveedor o notas) y
 * paginación. Cada pedido viaja con lo que le falta por recibir, calculado con
 * las mismas reglas que usa la recepción.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const proveedorId = searchParams.get('proveedorId');
    const search = searchParams.get('search');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);

    const where: any = { tenantId: auth.tenant!.id };
    if (estado && (ESTADOS_COMPRA as readonly string[]).includes(estado)) where.estado = estado;
    if (proveedorId) where.proveedorId = proveedorId;
    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { notas: { contains: search, mode: 'insensitive' } },
        { proveedor: { is: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [total, compras] = await Promise.all([
      prisma.compra.count({ where }),
      prisma.compra.findMany({
        where,
        orderBy: [{ fechaPedido: 'desc' }, { numero: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: {
            orderBy: { orden: 'asc' },
            select: {
              id: true, concepto: true, cantidad: true, cantidadRecibida: true,
              catalogoItemId: true, total: true,
            },
          },
          proveedor: { select: { id: true, name: true } },
          almacen: { select: { id: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      limit,
      compras: compras.map((compra) => ({
        ...compra,
        estadoEtiqueta: ETIQUETAS_ESTADO[compra.estado as EstadoCompra] ?? compra.estado,
        pendiente: pendienteDeRecepcion(compra.items),
      })),
    });
  } catch (error) {
    console.error('Error listando compras:', error);
    return NextResponse.json({ error: 'Error al cargar los pedidos' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/compras — Alta de un pedido a proveedor (nace en `borrador`).
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = validateBody(CompraInputSchema, body);
    if (parsed instanceof NextResponse) return parsed;

    const compra = await crearCompra({
      tenantId: auth.tenant!.id,
      usuarioId: auth.user?.id ?? null,
      proveedorId: parsed.proveedorId ?? null,
      almacenId: parsed.almacenId ?? null,
      notas: parsed.notas ?? null,
      fechaEntrega: parsed.fechaEntrega ? new Date(parsed.fechaEntrega) : null,
      moneda: monedaEscritura(auth.tenant?.moneda),
      items: parsed.items.map((linea) => ({
        catalogoItemId: linea.catalogoItemId ?? null,
        concepto: linea.concepto,
        cantidad: linea.cantidad,
        precioUnitario: linea.precioUnitario,
        porcentajeImpuesto: linea.porcentajeImpuesto ?? 21,
      })),
    });

    return NextResponse.json({ ok: true, compra }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCompra) {
      return NextResponse.json({ error: error.message }, { status: statusDeErrorCompra(error.codigo) });
    }
    console.error('Error creando compra:', error);
    return NextResponse.json({ error: 'Error al crear el pedido' }, { status: 500 });
  }
}, ['erp:write']);
