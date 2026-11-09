export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// GET - Obtener tasa específica
export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['config:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const tasa = await prisma.tasaImpuesto.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!tasa) {
      return NextResponse.json(
        { error: 'Tasa de impuesto no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json(tasa)
  } catch (error) {
    console.error('Error al obtener tasa:', error)
    return NextResponse.json(
      { error: 'Error al obtener tasa de impuesto' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar tasa
export async function PATCH(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['config:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()

    // Verificar que existe y pertenece al tenant
    const tasaExistente = await prisma.tasaImpuesto.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!tasaExistente) {
      return NextResponse.json(
        { error: 'Tasa de impuesto no encontrada' },
        { status: 404 }
      )
    }

    // Preparar datos para actualizar
    const updateData: any = {}
    
    if (body.nombre !== undefined) updateData.nombre = body.nombre
    if (body.porcentaje !== undefined) updateData.porcentaje = parseFloat(body.porcentaje)
    if (body.tipo !== undefined) updateData.tipo = body.tipo
    if (body.aplicaRetencion !== undefined) updateData.aplicaRetencion = body.aplicaRetencion
    if (body.porcentajeRetencion !== undefined) {
      updateData.porcentajeRetencion = body.porcentajeRetencion ? parseFloat(body.porcentajeRetencion) : null
    }
    if (body.inversionSujetoPasivo !== undefined) updateData.inversionSujetoPasivo = body.inversionSujetoPasivo
    if (body.descripcionRegla !== undefined) updateData.descripcionRegla = body.descripcionRegla
    if (body.fechaFinVigencia !== undefined) {
      updateData.fechaFinVigencia = body.fechaFinVigencia ? new Date(body.fechaFinVigencia) : null
    }
    if (body.activo !== undefined) updateData.activo = body.activo

    const tasa = await prisma.tasaImpuesto.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json(tasa)
  } catch (error) {
    console.error('Error al actualizar tasa:', error)
    return NextResponse.json(
      { error: 'Error al actualizar tasa de impuesto' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar o desactivar tasa
export async function DELETE(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['config:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const hardDelete = searchParams.get('hard') === 'true'

    // Verificar que existe y pertenece al tenant
    const tasa = await prisma.tasaImpuesto.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        _count: {
          select: {
            ordenVentaItems: true,
            cotizacionItems: true,
            contratoItems: true
          }
        }
      }
    })

    if (!tasa) {
      return NextResponse.json(
        { error: 'Tasa de impuesto no encontrada' },
        { status: 404 }
      )
    }

    // Verificar si tiene documentos asociados
    const totalAsociados = 
      tasa._count.ordenVentaItems + 
      tasa._count.cotizacionItems + 
      tasa._count.contratoItems

    if (totalAsociados > 0 && hardDelete) {
      return NextResponse.json(
        { 
          error: 'No se puede eliminar la tasa porque tiene documentos asociados',
          documentos: totalAsociados
        },
        { status: 409 }
      )
    }

    if (hardDelete && totalAsociados === 0) {
      // Eliminación física si no tiene asociaciones
      await prisma.tasaImpuesto.delete({
        where: { id: params.id }
      })
      return NextResponse.json({ message: 'Tasa eliminada permanentemente' })
    } else {
      // Desactivar (eliminación lógica)
      await prisma.tasaImpuesto.update({
        where: { id: params.id },
        data: {
          activo: false,
          fechaFinVigencia: new Date()
        }
      })
      return NextResponse.json({ message: 'Tasa desactivada correctamente' })
    }
  } catch (error) {
    console.error('Error al eliminar tasa:', error)
    return NextResponse.json(
      { error: 'Error al eliminar tasa de impuesto' },
      { status: 500 }
    )
  }
}
