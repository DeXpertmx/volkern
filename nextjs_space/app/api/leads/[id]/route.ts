export const dynamic = 'force-dynamic';

import crypto from 'crypto'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// GET - Obtener un lead específico
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['leads:read'])
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    let lead = await (prisma as any).lead.findUnique({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        citas: {
          include: {
            servicio: true
          },
          orderBy: {
            fechaHora: 'desc'
          }
        },
        cotizaciones: true,
        contratos: true,
        deals: true,
        attachments: {
          include: {
            usuario: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            fechaSubida: 'desc'
          }
        }
      }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    // Auto-generar token público si no existe
    if (!lead.tokenPublico) {
      lead = await (prisma as any).lead.update({
        where: { id: lead.id },
        data: { tokenPublico: crypto.randomUUID() },
        include: {
          citas: {
            include: { servicio: true },
            orderBy: { fechaHora: 'desc' }
          },
          cotizaciones: true,
          contratos: true,
          deals: true,
          attachments: {
            include: {
              usuario: { select: { name: true } }
            },
            orderBy: { fechaSubida: 'desc' }
          }
        }
      })
    }

    return NextResponse.json(lead)
  } catch (error) {
    console.error('Error fetching lead:', error)
    return NextResponse.json(
      { error: 'Error al obtener lead' },
      { status: 500 }
    )
  }
}

// Función compartida para actualizar leads (usada por PUT y PATCH)
async function updateLeadHandler(
  request: NextRequest,
  params: { id: string }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['leads:write', 'leads:update'])
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { nombre, email, telefono, empresa, contextoProyecto, notas, estado, scoreValue, tags, origen, ciudad, pais, direccion, codigoPostal, metadataExterna } = body

    // Verificar que el lead existe y pertenece al tenant
    const existingLead = await prisma.lead.findUnique({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!existingLead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    // Actualizar lead
    const lead = await prisma.lead.update({
      where: { id: params.id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(email !== undefined && { email }),
        ...(telefono !== undefined && { telefono }),
        ...(empresa !== undefined && { empresa }),
        ...(contextoProyecto !== undefined && { contextoProyecto }),
        ...(notas !== undefined && { notas }),
        ...(estado !== undefined && { estado }),
        ...(scoreValue !== undefined && { scoreValue }),
        ...(tags !== undefined && { tags }),
        ...(origen !== undefined && { origen }),
        ...(ciudad !== undefined && { ciudad }),
        ...(pais !== undefined && { pais }),
        ...(direccion !== undefined && { direccion }),
        ...(codigoPostal !== undefined && { codigoPostal }),
        ...(metadataExterna !== undefined && { metadataExterna }),
        fechaUltimaActividad: new Date(),
      }
    })

    // Audit log
    const { AuditService } = await import('@/lib/audit-service');
    const requestIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    await AuditService.log({
      tenantId: auth.tenant!.id,
      userId: auth.user!.id,
      action: 'UPDATE',
      entity: 'Lead',
      entityId: lead.id,
      description: auth.authMethod === 'apikey'
        ? `Lead actualizado vía API por ${auth.user!.name || auth.user!.email}`
        : `Lead actualizado por ${auth.user!.name || auth.user!.email}`,
      changesAfter: { nombre: lead.nombre, email: lead.email, estado: lead.estado },
      ipAddress: requestIp,
      userAgent
    });

    return NextResponse.json({
      success: true,
      lead
    })

  } catch (error) {
    console.error('Error updating lead:', error)
    return NextResponse.json(
      { error: 'Error al actualizar lead' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar lead (REST estándar)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return updateLeadHandler(request, params)
}

// PATCH - Actualizar lead (compatibilidad)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return updateLeadHandler(request, params)
}

// DELETE - Eliminar lead
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['leads:delete'])
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Verificar que el lead existe y pertenece al tenant
    const existingLead = await prisma.lead.findUnique({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      }
    })

    if (!existingLead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    await prisma.lead.delete({
      where: { id: params.id }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: auth.tenant!.id,
        userId: auth.user!.id,
        accion: 'DELETE',
        entidad: 'Lead',
        entidadId: params.id,
        descripcion: auth.authMethod === 'apikey'
          ? `Lead eliminado vía API por ${auth.user!.name || auth.user!.email}`
          : `Lead eliminado por ${auth.user!.name || auth.user!.email}`,
        cambiosAntes: JSON.stringify({
          nombre: existingLead.nombre,
          email: existingLead.email
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Lead eliminado correctamente'
    })

  } catch (error) {
    console.error('Error deleting lead:', error)
    return NextResponse.json(
      { error: 'Error al eliminar lead' },
      { status: 500 }
    )
  }
}
