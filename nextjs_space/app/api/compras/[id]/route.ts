export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { ErrorCompra, cambiarEstadoCompra, statusDeErrorCompra } from '@/lib/compras/service';
import {
  ETIQUETAS_ESTADO,
  TRANSICIONES,
  pendienteDeLinea,
  pendienteDeRecepcion,
  type EstadoCompra,
} from '@/lib/compras/reglas';

const EstadoSchema = z.object({ estado: z.string().min(1) });

/**
 * GET /api/compras/[id] — Pedido completo, con lo que le falta por recibir
 * línea a línea y las transiciones que hoy admite.
 */
export const GET = withTenantAuth(async (_request, auth, { params }) => {
  try {
    const compra = await prisma.compra.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: {
        items: {
          orderBy: { orden: 'asc' },
          include: { catalogoItem: { select: { id: true, nombre: true, sku: true, unidad: true } } },
        },
        proveedor: {
          select: { id: true, name: true, taxId: true, email: true, city: true, country: true },
        },
        almacen: { select: { id: true, name: true } },
        // El estado de la conciliación viaja con el pedido: la ficha tiene que
        // poder decir si su coste ya lo justifica una factura o sigue siendo
        // una estimación.
        gasto: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            category: true,
            invoiceNumber: true,
            reconciledAt: true,
            date: true,
          },
        },
      },
    });

    if (!compra) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

    const estado = compra.estado as EstadoCompra;

    return NextResponse.json({
      compra: {
        ...compra,
        estadoEtiqueta: ETIQUETAS_ESTADO[estado] ?? compra.estado,
        pendiente: pendienteDeRecepcion(compra.items),
        transiciones: TRANSICIONES[estado] ?? [],
        items: compra.items.map((item) => ({ ...item, pendiente: pendienteDeLinea(item) })),
      },
    });
  } catch (error) {
    console.error('Error cargando compra:', error);
    return NextResponse.json({ error: 'Error al cargar el pedido' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * PATCH /api/compras/[id] — Mueve el pedido por su ciclo (enviar, cancelar…).
 *
 * No acepta «recibida»: ese estado solo lo pone la recepción de mercancía.
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = validateBody(EstadoSchema, body);
    if (parsed instanceof NextResponse) return parsed;

    const compra = await cambiarEstadoCompra({
      tenantId: auth.tenant!.id,
      compraId: params.id,
      estado: parsed.estado,
    });

    return NextResponse.json({ ok: true, compra });
  } catch (error) {
    if (error instanceof ErrorCompra) {
      return NextResponse.json({ error: error.message }, { status: statusDeErrorCompra(error.codigo) });
    }
    console.error('Error cambiando estado de compra:', error);
    return NextResponse.json({ error: 'Error al cambiar el estado' }, { status: 500 });
  }
}, ['erp:write']);
