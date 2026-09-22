export const dynamic = 'force-dynamic';

/**
 * Factura de la penalización por no-show — emitida por el ERP.
 *
 *   POST /api/hospitality/reservations/[id]/penalizacion/facturar
 *
 * Hospitality no factura: aporta el concepto y el importe, y el ERP
 * (`InvoicingService`, la misma vía que una orden de venta o un hito de
 * proyecto) pone la numeración, los impuestos y la firma Veri*factu (regla 4
 * del plan: nada de un segundo sistema financiero).
 *
 * Es una acción **explícita**: facturar es consecuente (serie fiscal, AEAT) y
 * no debe ser efecto colateral de marcar un no-show. Requiere que el huésped
 * esté vinculado al CRM (`contactId`), porque sin receptor fiscal no hay
 * factura; si falta, la respuesta lo dice y el operador lo vincula.
 *
 * Idempotente: la línea guarda el `invoiceId` de la factura que la saldó, así
 * que repetir la llamada devuelve la misma factura en vez de emitir otra.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { facturarPenalizacionNoShow } from '@/lib/hospitality/penalizaciones';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

export async function POST(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const { id } = await ctx.params;
    // El emisor valida reserva, tenant, estado y existencia del cargo.
    const resultado = await facturarPenalizacionNoShow(tenantId, id);

    if (!resultado.ok) {
      // Fallo del ERP (numeración, integración, cola AEAT): es del servidor.
      return NextResponse.json(
        { error: 'Error facturando la penalización por el ERP', detalle: resultado.error },
        { status: 500 }
      );
    }

    if (resultado.motivo === 'sin_penalizacion') {
      return NextResponse.json(
        { error: 'Esta reserva no tiene penalización emitida que facturar' },
        { status: 400 }
      );
    }

    if (resultado.motivo === 'sin_contacto_fiscal') {
      return NextResponse.json(
        {
          error:
            'El huésped no está vinculado al CRM: sin receptor fiscal no se puede emitir la factura. Vincula el huésped y vuelve a intentarlo.',
          motivo: resultado.motivo,
        },
        { status: 400 }
      );
    }

    if (resultado.facturada) {
      await logAuditAction(
        auth.user!.id,
        tenantId,
        'crear',
        'hospitality_penalizacion_factura',
        resultado.invoiceId || id,
        `Penalización por no-show facturada por el ERP (${resultado.numero}, ${resultado.importe} ${resultado.moneda})`
      ).catch(() => {});
    }

    return NextResponse.json(resultado, { status: resultado.facturada ? 201 : 200 });
  } catch (error) {
    console.error('Error facturando la penalización:', error);
    return NextResponse.json({ error: 'Error al facturar la penalización' }, { status: 500 });
  }
}
