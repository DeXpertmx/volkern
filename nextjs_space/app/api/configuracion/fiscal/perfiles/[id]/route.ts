export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { validateFiscalId, PAISES_UE } from '@/lib/fiscal-validation'

// GET - Obtener perfil fiscal específico
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:read', 'leads:read', 'contacts:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const perfil = await prisma.perfilFiscalCliente.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        lead: {
          select: { id: true, nombre: true, email: true, empresa: true, telefono: true }
        },
        contact: {
          select: { id: true, nombre: true, email: true, tipo: true, telefono: true }
        }
      }
    })

    if (!perfil) {
      return NextResponse.json(
        { error: 'Perfil fiscal no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(perfil)
  } catch (error) {
    console.error('Error al obtener perfil fiscal:', error)
    return NextResponse.json(
      { error: 'Error al obtener perfil fiscal' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar perfil fiscal
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:write', 'leads:write', 'contacts:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await req.json()

    // Verificar que existe y pertenece al tenant
    const perfilExistente = await prisma.perfilFiscalCliente.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!perfilExistente) {
      return NextResponse.json(
        { error: 'Perfil fiscal no encontrado' },
        { status: 404 }
      )
    }

    const pe = perfilExistente as any;

    // Validar ID fiscal si se está actualizando
    if (body.idFiscal && body.idFiscal !== pe.idFiscal) {
      const pais = body.pais || pe.pais
      const tipoIdFiscal = body.tipoIdFiscal || pe.tipoIdFiscal
      
      const validacion = validateFiscalId(pais, tipoIdFiscal, body.idFiscal)
      if (!validacion.valid) {
        return NextResponse.json(
          { error: `ID Fiscal inválido: ${validacion.error}` },
          { status: 400 }
        )
      }
      body.idFiscal = validacion.formatted || body.idFiscal
      body.idFiscalValidado = true
      body.fechaValidacion = new Date()
    }

    // Validar ID intracomunitario si se actualiza
    if (body.idIntracomunitario) {
      const pais = body.pais || pe.pais
      if (PAISES_UE.includes(pais) && !body.idIntracomunitario.toUpperCase().startsWith(pe.pais)) {
        return NextResponse.json(
          { error: `El ID intracomunitario debe comenzar con ${pais}` },
          { status: 400 }
        )
      }
      body.idIntracomunitario = body.idIntracomunitario.toUpperCase()
    }

    // Preparar datos para actualizar
    const updateData: any = {}
    const camposPermitidos = [
      'razonSocial', 'pais', 'tipoIdFiscal', 'idFiscal', 'regimenFiscal',
      'idIntracomunitario', 'direccionFiscal', 'ciudadFiscal', 'estadoFiscal',
      'codigoPostalFiscal', 'exentoImpuestos', 'motivoExencion', 'aplicaRetencion',
      'idFiscalValidado', 'fechaValidacion'
    ]

    for (const campo of camposPermitidos) {
      if (body[campo] !== undefined) {
        updateData[campo] = body[campo]
      }
    }

    // Si se marca exento, asegurar que tenga motivo
    if (updateData.exentoImpuestos === true && !updateData.motivoExencion && !perfilExistente.motivoExencion) {
      return NextResponse.json(
        { error: 'Se requiere un motivo para la exención de impuestos' },
        { status: 400 }
      )
    }

    const perfil = await prisma.perfilFiscalCliente.update({
      where: { id: params.id },
      data: updateData,
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        contact: { select: { id: true, nombre: true, email: true } }
      }
    })

    return NextResponse.json(perfil)
  } catch (error) {
    console.error('Error al actualizar perfil fiscal:', error)
    return NextResponse.json(
      { error: 'Error al actualizar perfil fiscal' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar perfil fiscal
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['config:write', 'leads:write', 'contacts:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    // Verificar que existe y pertenece al tenant
    const perfil = await prisma.perfilFiscalCliente.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!perfil) {
      return NextResponse.json(
        { error: 'Perfil fiscal no encontrado' },
        { status: 404 }
      )
    }

    await prisma.perfilFiscalCliente.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Perfil fiscal eliminado correctamente' })
  } catch (error) {
    console.error('Error al eliminar perfil fiscal:', error)
    return NextResponse.json(
      { error: 'Error al eliminar perfil fiscal' },
      { status: 500 }
    )
  }
}
