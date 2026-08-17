export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-key-auth'
import { validateBody } from '@/lib/validation'
import { z } from 'zod'
import { crearOrdenVentaDesdeCotizacion } from '@/lib/ordenes-venta/from-cotizacion'

const FromCotizacionBodySchema = z.object({
  cotizacionId: z.string().min(25, 'ID de cotización inválido'),
  fechaEntrega: z.string().datetime().optional(),
  notas: z.string().max(5000).optional(),
  notasInternas: z.string().max(5000).optional(),
  condicionesVenta: z.string().max(500).optional(),
  referenciaCliente: z.string().max(255).optional(),
  ajustarPrecios: z.boolean().default(false),
});

/**
 * POST /api/ordenes-venta/from-cotizacion
 * Convertir una cotización aceptada en orden de venta
 * Hereda: items, cliente, datos fiscales, referencias al catálogo
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'orders:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }
    const tenantId = auth.tenant!.id

    const raw = await req.json()
    const parsed = validateBody(FromCotizacionBodySchema, raw)
    if (parsed instanceof NextResponse) return parsed

    const {
      cotizacionId,
      fechaEntrega,
      notas,
      notasInternas,
      condicionesVenta,
      referenciaCliente,
      ajustarPrecios = false,
    } = parsed

    const { orden, yaExistia } = await crearOrdenVentaDesdeCotizacion({
      cotizacionId,
      tenantId,
      userId: auth.user?.id || null,
      fechaEntrega,
      notas,
      notasInternas,
      condicionesVenta,
      referenciaCliente,
      ajustarPrecios,
    })

    return NextResponse.json({
      orden,
      yaExistia,
      mensaje: yaExistia
        ? `La cotización ya tiene la orden de venta ${orden.numero}`
        : `Orden de venta ${orden.numero} creada exitosamente desde la cotización`,
    }, { status: yaExistia ? 200 : 201 })
  } catch (error: any) {
    console.error('Error al crear orden desde cotización:', error)
    return NextResponse.json(
      { error: 'Error al crear orden de venta', details: error.message },
      { status: 500 }
    )
  }
}
