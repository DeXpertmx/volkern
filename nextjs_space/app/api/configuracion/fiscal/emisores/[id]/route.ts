export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { validateFiscalId } from '@/lib/fiscal-validation'

// GET - Obtener emisor específico
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const emisor = await prisma.configuracionFiscalEmisor.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        _count: {
          select: {
            ordenesVenta: true,
            cotizaciones: true,
            contratos: true
          }
        }
      }
    })

    if (!emisor) {
      return NextResponse.json(
        { error: 'Configuración de emisor no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json(emisor)
  } catch (error) {
    console.error('Error al obtener emisor:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuración de emisor' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar emisor
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()

    // Verificar que existe y pertenece al tenant
    const emisorExistente = await prisma.configuracionFiscalEmisor.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!emisorExistente) {
      return NextResponse.json(
        { error: 'Configuración de emisor no encontrada' },
        { status: 404 }
      )
    }

    // Validar ID fiscal si se está actualizando
    if (body.idFiscal && body.idFiscal !== emisorExistente.idFiscal) {
      const pais = body.pais || emisorExistente.pais
      const tipoIdFiscal = body.tipoIdFiscal || emisorExistente.tipoIdFiscal
      
      const validacion = validateFiscalId(pais, tipoIdFiscal, body.idFiscal)
      if (!validacion.valid) {
        return NextResponse.json(
          { error: `ID Fiscal inválido: ${validacion.error}` },
          { status: 400 }
        )
      }
      body.idFiscal = validacion.formatted || body.idFiscal
    }

    // Si se está marcando como principal, desmarcar los demás
    if (body.esPrincipal === true && !emisorExistente.esPrincipal) {
      await prisma.configuracionFiscalEmisor.updateMany({
        where: { tenantId: auth.tenant!.id, esPrincipal: true },
        data: { esPrincipal: false }
      })
    }

    // Preparar datos para actualizar
    const updateData: any = {}
    const camposPermitidos = [
      'razonSocial', 'nombreComercial', 'pais', 'tipoIdFiscal', 'idFiscal',
      'regimenFiscal', 'direccion', 'ciudad', 'estadoProvincia', 'codigoPostal',
      'telefono', 'email', 'sitioWeb', 'monedaPredeterminada', 'serieFactura',
      'siguienteNumero', 'logoUrl', 'colorPrimario', 'esPrincipal', 'verifactuEnabled', 'activo'
    ]

    for (const campo of camposPermitidos) {
      if (body[campo] !== undefined) {
        updateData[campo] = body[campo]
      }
    }

    const emisor = await prisma.configuracionFiscalEmisor.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json(emisor)
  } catch (error) {
    console.error('Error al actualizar emisor:', error)
    return NextResponse.json(
      { error: 'Error al actualizar configuración de emisor' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar o desactivar emisor
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    // Verificar que existe y pertenece al tenant
    const emisor = await prisma.configuracionFiscalEmisor.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        _count: {
          select: {
            ordenesVenta: true,
            cotizaciones: true,
            contratos: true
          }
        }
      }
    })

    if (!emisor) {
      return NextResponse.json(
        { error: 'Configuración de emisor no encontrada' },
        { status: 404 }
      )
    }

    // No permitir eliminar el único emisor activo
    const emisoresActivos = await prisma.configuracionFiscalEmisor.count({
      where: { tenantId: auth.tenant!.id, activo: true }
    })

    if (emisoresActivos === 1 && emisor.activo) {
      return NextResponse.json(
        { error: 'No se puede eliminar el único emisor activo' },
        { status: 409 }
      )
    }

    // Verificar si tiene documentos asociados
    const totalAsociados = 
      emisor._count.ordenesVenta + 
      emisor._count.cotizaciones + 
      emisor._count.contratos

    if (totalAsociados > 0) {
      // Desactivar en lugar de eliminar
      await prisma.configuracionFiscalEmisor.update({
        where: { id: params.id },
        data: { activo: false }
      })
      return NextResponse.json({ 
        message: 'Emisor desactivado (tiene documentos asociados)',
        documentos: totalAsociados
      })
    } else {
      // Eliminar físicamente
      await prisma.configuracionFiscalEmisor.delete({
        where: { id: params.id }
      })
      return NextResponse.json({ message: 'Emisor eliminado permanentemente' })
    }
  } catch (error) {
    console.error('Error al eliminar emisor:', error)
    return NextResponse.json(
      { error: 'Error al eliminar configuración de emisor' },
      { status: 500 }
    )
  }
}
