export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createCheckoutSession } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { citaId } = await request.json()

    if (!citaId) {
      return NextResponse.json(
        { error: 'ID de cita es requerido' },
        { status: 400 }
      )
    }

    // Obtener la cita con lead y servicio
    const cita = await prisma.cita.findUnique({
      where: { id: citaId },
      include: {
        lead: true,
        servicio: true
      }
    })

    if (!cita) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      )
    }

    if (cita.estado === 'pagada') {
      return NextResponse.json(
        { error: 'Esta cita ya está pagada' },
        { status: 400 }
      )
    }

    // Validar que la cita tenga un servicio (solo citas de servicio pueden tener pago)
    if (!cita.servicio) {
      return NextResponse.json(
        { error: 'Esta cita no tiene un servicio asociado y no requiere pago' },
        { status: 400 }
      )
    }

    // Obtener la URL de origen
    const origin = request.headers.get("origin") || 'http://localhost:3000'

    // Crear sesión de checkout en Stripe
    const result = await createCheckoutSession({
      servicioId: cita.servicio.id,
      servicioNombre: cita.servicio.nombre,
      precio: cita.servicio.precio,
      moneda: cita.servicio.moneda,
      leadId: cita.lead!.id,
      citaId: cita.id,
      successUrl: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/payment/cancel?cita_id=${cita.id}`
    })

    if (!result.success) {
      return NextResponse.json(
        { error: 'Error al crear sesión de pago' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      url: result.session?.url
    })

  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Error al procesar el pago' },
      { status: 500 }
    )
  }
}
