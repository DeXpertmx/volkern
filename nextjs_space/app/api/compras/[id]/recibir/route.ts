export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { ErrorCompra, recibirCompra, statusDeErrorCompra } from '@/lib/compras/service';

const RecepcionSchema = z.object({
  lineas: z
    .array(
      z.object({
        itemId: z.string().min(1),
        cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero'),
      })
    )
    .min(1, 'Indica al menos una línea a recibir'),
  /** Nota libre de la entrega (albarán, transportista, incidencias). */
  notas: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/compras/[id]/recibir — Entra la mercancía.
 *
 * Mueve el stock de las líneas con artículo de almacén, apunta lo recibido en
 * cada línea, deja el pedido en `parcial` o `recibida` según lo que realmente
 * entró y, si queda completo, genera el gasto contable con el total.
 *
 * Responde con los avisos (líneas sin almacén, pedidos sin proveedor) para que
 * la pantalla pueda decirlo en vez de dar por hecho que todo se apuntó.
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = validateBody(RecepcionSchema, body);
    if (parsed instanceof NextResponse) return parsed;

    // Una recepción deja rastro de quién recibió (movimiento de stock) y crea un
    // gasto atribuido a esa persona, así que sin usuario no se puede registrar.
    // Se dice con un 403 explicable en vez de reventar con un TypeError.
    const usuarioId = auth.user?.id;
    if (!usuarioId) {
      return NextResponse.json(
        { error: 'La recepción necesita un usuario: usa una clave de API ligada a un usuario' },
        { status: 403 }
      );
    }

    const resultado = await recibirCompra({
      tenantId: auth.tenant!.id,
      compraId: params.id,
      usuarioId,
      lineas: parsed.lineas,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    if (error instanceof ErrorCompra) {
      return NextResponse.json({ error: error.message }, { status: statusDeErrorCompra(error.codigo) });
    }
    console.error('Error registrando recepción:', error);
    return NextResponse.json({ error: 'Error al registrar la recepción' }, { status: 500 });
  }
}, ['erp:write']);
