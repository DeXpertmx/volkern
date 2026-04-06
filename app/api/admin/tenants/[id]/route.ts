export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET /api/admin/tenants/[id] - Get tenant details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (!user || user.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            users: true,
            leads: true,
            citas: true,
            cursos: true,
            estudiantes: true,
            automations: true,
            campaigns: true,
            pages: true
          }
        },
        subscriptions: {
          include: {
            plan: true
          },
          orderBy: { fechaCreacion: 'desc' }
        },
        tenantFeatures: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            estado: true,
            role: {
              select: {
                nombre: true
              }
            },
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(tenant);

  } catch (error: any) {
    console.error('Error fetching tenant:', error);
    return NextResponse.json(
      { error: 'Error al obtener tenant' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/tenants/[id] - Update tenant
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (!user || user.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();
    const {
      nombre,
      slug,
      plan,
      estado,
      dominio,
      billingEmail,
      stripeCustomerId,
      mrr,
      moneda,
      limites,
      configuracion
    } = body;

    // Get current tenant
    const currentTenant = await prisma.tenant.findUnique({
      where: { id: params.id }
    });

    if (!currentTenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404 }
      );
    }

    // Update tenant
    const updatedTenant = await prisma.tenant.update({
      where: { id: params.id },
      data: {
        ...(nombre && { nombre }),
        ...(slug && { slug }),
        ...(plan && { plan }),
        ...(estado && { estado }),
        ...(dominio !== undefined && { dominio }),
        ...(billingEmail !== undefined && { billingEmail }),
        ...(stripeCustomerId !== undefined && { stripeCustomerId }),
        ...(mrr !== undefined && { mrr }),
        ...(moneda && { moneda }),
        ...(limites && { limites }),
        ...(configuracion && { configuracion })
      }
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: 'actualizar',
        entidad: 'tenant',
        entidadId: params.id,
        descripcion: `Tenant actualizado: ${updatedTenant.nombre}`,
        cambiosAntes: currentTenant as any,
        cambiosDespues: updatedTenant as any
      }
    });

    return NextResponse.json(updatedTenant);

  } catch (error: any) {
    console.error('Error updating tenant:', error);
    return NextResponse.json(
      { error: 'Error al actualizar tenant' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/tenants/[id] - Delete tenant
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (!user || user.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id }
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404 }
      );
    }

    // Delete tenant (cascade will handle related records)
    await prisma.tenant.delete({
      where: { id: params.id }
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: 'eliminar',
        entidad: 'tenant',
        entidadId: params.id,
        descripcion: `Tenant eliminado: ${tenant.nombre}`,
        cambiosAntes: tenant as any
      }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error deleting tenant:', error);
    return NextResponse.json(
      { error: 'Error al eliminar tenant' },
      { status: 500 }
    );
  }
}
