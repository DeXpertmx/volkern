export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/contacts/[id] - Obtener un contacto específico (Actualizado con historial unificado)
export const GET = withTenantAuth(async (request, auth, { params }) => {
  console.log(`[DEBUG] GET Contact ${params.id} at ${new Date().toISOString()} - Unified History V3`);
  try {
    const tenantId = auth.tenant!.id;

    const contact = await prisma.contact.findFirst({
      where: {
        id: params.id,
        tenantId
      },
      include: {
        company: {
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true
          }
        },
        persons: {
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true,
            cargo: true,
            linkedin: true,
            notas: true
          },
          orderBy: {
            fechaCreacion: 'desc'
          }
        },
        deals: {
          select: {
            id: true,
            titulo: true,
            valor: true,
            moneda: true,
            etapa: true,
            estado: true,
            probabilidad: true,
            fechaCreacion: true,
            contact: {
              select: {
                nombre: true
              }
            }
          },
          orderBy: {
            fechaCreacion: 'desc'
          }
        },
        dealsAsCompany: {
          select: {
            id: true,
            titulo: true,
            valor: true,
            moneda: true,
            etapa: true,
            estado: true,
            probabilidad: true,
            fechaCreacion: true,
            contact: {
              select: {
                nombre: true
              }
            }
          },
          orderBy: {
            fechaCreacion: 'desc'
          }
        },
        convertedFromLeads: {
          select: {
            id: true,
            nombre: true,
            email: true,
            fuente: true,
            fechaCreacion: true
          }
        },
        perfilFiscal: true,
        invoices: {
          orderBy: {
            fechaEmision: 'desc'
          },
          include: {
            ordenVenta: {
              select: {
                numero: true
              }
            }
          }
        },
        Task: {
          orderBy: { fechaVencimiento: 'asc' },
          include: { asignadoUsuario: { select: { name: true, image: true } } }
        },
        Note: {
          orderBy: { fechaCreacion: 'desc' },
          include: { creador: { select: { name: true, image: true } } }
        },
        Interaction: {
          orderBy: { fechaCreacion: 'desc' },
          include: { creador: { select: { name: true, image: true } } }
        },
        Cita: {
          orderBy: { fechaHora: 'desc' },
          include: { servicio: true }
        },
        Conversation: {
          orderBy: { fechaUltimoMensaje: 'desc' }
        },
        lead_attachments: {
          orderBy: { fechaSubida: 'desc' },
          include: { usuario: { select: { name: true } } }
        },
        cotizaciones: {
          orderBy: { fechaCreacion: 'desc' }
        },
        contratos: {
          orderBy: { fechaCreacion: 'desc' }
        }
      }
    });

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    console.error('Error al obtener contacto:', error);
    return NextResponse.json(
      { error: 'Error al obtener contacto' },
      { status: 500 }
    );
  }
}, ['contacts:read']);

// PATCH /api/contacts/[id] - Actualizar un contacto
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user?.id;
    const body = await request.json();

    const { nombre, email, telefono, tipo, companyId, cargo, ubicacion, linkedin, notas, tags, perfilFiscal } = body;

    const contact = await prisma.contact.findFirst({
      where: {
        id: params.id,
        tenantId
      }
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización (solo campos definidos)
    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (email !== undefined) updateData.email = email;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (companyId !== undefined) updateData.companyId = companyId;
    if (cargo !== undefined) updateData.cargo = cargo;
    if (ubicacion !== undefined) updateData.ubicacion = ubicacion;
    if (linkedin !== undefined) updateData.linkedin = linkedin;
    if (notas !== undefined) updateData.notas = notas;
    if (tags !== undefined) updateData.tags = tags;

    // Soporte para Perfil Fiscal
    if (perfilFiscal) {
      updateData.perfilFiscal = {
        upsert: {
          create: {
            ...perfilFiscal,
            tenantId,
            defaultIva: perfilFiscal.defaultIva ? parseFloat(perfilFiscal.defaultIva) : 21.0,
            defaultIrpf: perfilFiscal.defaultIrpf ? parseFloat(perfilFiscal.defaultIrpf) : 0.0
          },
          update: {
            ...perfilFiscal,
            defaultIva: perfilFiscal.defaultIva ? parseFloat(perfilFiscal.defaultIva) : undefined,
            defaultIrpf: perfilFiscal.defaultIrpf ? parseFloat(perfilFiscal.defaultIrpf) : undefined
          }
        }
      };
    }

    const updatedContact = await prisma.contact.update({
      where: { id: params.id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            nombre: true
          }
        },
        perfilFiscal: true
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || 'api',
        accion: 'actualizar',
        entidad: 'contact',
        entidadId: params.id,
        descripcion: `Contacto actualizado`,
        cambiosDespues: updateData
      }
    });

    return NextResponse.json({ success: true, data: updatedContact });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    return NextResponse.json(
      { error: 'Error al actualizar contacto' },
      { status: 500 }
    );
  }
}, ['contacts:write']);

// PUT /api/contacts/[id] - Alias para PATCH
export const PUT = PATCH;

// DELETE /api/contacts/[id] - Eliminar un contacto
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user?.id;

    const contact = await prisma.contact.findFirst({
      where: {
        id: params.id,
        tenantId
      },
      include: {
        _count: {
          select: {
            deals: true
          }
        }
      }
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    // Verificar si tiene deals activos
    if (contact._count.deals > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar un contacto con deals asociados' },
        { status: 400 }
      );
    }

    await prisma.contact.delete({
      where: { id: params.id }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || 'api',
        accion: 'eliminar',
        entidad: 'contact',
        entidadId: params.id,
        descripcion: `Contacto "${contact.nombre}" eliminado`,
        cambiosAntes: { nombre: contact.nombre, email: contact.email }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Contacto eliminado correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar contacto:', error);
    return NextResponse.json(
      { error: 'Error al eliminar contacto' },
      { status: 500 }
    );
  }
}, ['contacts:delete']);
