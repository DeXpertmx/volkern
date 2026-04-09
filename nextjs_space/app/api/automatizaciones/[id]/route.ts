export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/automatizaciones/[id] - Obtener una automatización específica
export const GET = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;

    const automation = await prisma.automation.findFirst({
      where: { 
        id: params.id,
        tenantId: tenantId
      }
    })

    if (!automation) {
      return NextResponse.json(
        { error: 'Automatización no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json(automation)
  } catch (error) {
    console.error('Error al obtener automatización:', error)
    return NextResponse.json(
      { error: 'Error al obtener automatización' },
      { status: 500 }
    )
  }
}, ['automations:read'])

// PUT /api/automatizaciones/[id] - Actualizar una automatización
export const PUT = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json()
    const { nombre, descripcion, trigger, flowData, activo } = body

    // Verificar propiedad antes de actualizar
    const existing = await prisma.automation.findFirst({
        where: { id: params.id, tenantId }
    });

    if (!existing) {
        return NextResponse.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    const automation = await prisma.automation.update({
      where: { id: params.id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(trigger !== undefined && { trigger }),
        ...(flowData !== undefined && { flowData }),
        ...(activo !== undefined && { activo })
      }
    })

    return NextResponse.json(automation)
  } catch (error) {
    console.error('Error al actualizar automatización:', error)
    return NextResponse.json(
      { error: 'Error al actualizar automatización' },
      { status: 500 }
    )
  }
}, ['automations:write'])

// DELETE /api/automatizaciones/[id] - Eliminar una automatización
export const DELETE = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id;

    // Verificar propiedad antes de eliminar
    const existing = await prisma.automation.findFirst({
        where: { id: params.id, tenantId }
    });

    if (!existing) {
        return NextResponse.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    await prisma.automation.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al eliminar automatización:', error)
    return NextResponse.json(
      { error: 'Error al eliminar automatización' },
      { status: 500 }
    )
  }
}, ['automations:delete'])
