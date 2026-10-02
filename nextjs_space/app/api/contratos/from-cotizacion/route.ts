export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-key-auth'
import { crearContratoDesdeCotizacion } from '@/lib/contratos/from-cotizacion'

/**
 * POST /api/contratos/from-cotizacion
 * Convertir una cotización aceptada en contrato.
 * Hereda: items, cliente, datos fiscales, referencias al catálogo.
 * La lógica vive en lib/contratos/from-cotizacion.ts (compartida con el
 * skill MCP create_contrato_from_cotizacion).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'contracts:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()
    const {
      cotizacionId,
      tipo = 'servicio',
      fechaInicio,
      fechaFin,
      metodoPago,
      condicionesPago,
      frecuenciaPago,
      diaPago,
      clausulas,
      notasInternas,
      notasCliente,
      ajustarPrecios = false,
    } = body

    if (!cotizacionId) {
      return NextResponse.json({ error: 'cotizacionId es requerido' }, { status: 400 })
    }

    const { contrato, mensaje } = await crearContratoDesdeCotizacion({
      cotizacionId,
      tenantId: auth.tenant!.id,
      userId: auth.user?.id || null,
      tipo,
      fechaInicio: fechaInicio || null,
      fechaFin: fechaFin || null,
      metodoPago: metodoPago || null,
      condicionesPago: condicionesPago || null,
      frecuenciaPago: frecuenciaPago || null,
      diaPago: diaPago ?? null,
      clausulas: clausulas || null,
      notasInternas: notasInternas || null,
      notasCliente: notasCliente || null,
      ajustarPrecios,
    })

    return NextResponse.json({ contrato, mensaje }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear contrato desde cotización:', error)
    const status = error?.message === 'Cotización no encontrada' ? 404
      : error?.message?.startsWith('No se puede convertir') ? 400
      : 500
    return NextResponse.json(
      { error: 'Error al crear contrato', details: error.message },
      { status }
    )
  }
}
