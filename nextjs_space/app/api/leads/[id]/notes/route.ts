export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { logAuditAction } from '@/lib/permissions'
import { triggerAutomation } from '@/lib/automation-engine'

// GET /api/leads/[id]/notes - Obtener todas las notas de un lead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['leads:read'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ 
        error: auth.error || 'No autorizado' 
      }, { status: 401 })
    }

    const leadId = id
    const tenantId = auth.tenant.id

    // Verificar que el lead pertenece al tenant
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    const notes = await prisma.note.findMany({
      where: { leadId },
      orderBy: { fechaCreacion: 'desc' },
      include: {
        creador: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    return NextResponse.json({
      success: true,
      total: notes.length,
      notes
    })
  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json(
      { error: 'Error al cargar las notas' },
      { status: 500 }
    )
  }
}

// POST /api/leads/[id]/notes - Crear una nueva nota
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['leads:write'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ 
        error: auth.error || 'No autorizado' 
      }, { status: 401 })
    }

    const leadId = id
    const tenantId = auth.tenant.id
    const userId = auth.user?.id

    // Verificar que el lead pertenece al tenant
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      )
    }

    const data = await request.json()
    const { contenido, titulo } = data

    // Validar campos requeridos
    if (!contenido) {
      return NextResponse.json(
        { error: 'contenido es requerido' },
        { status: 400 }
      )
    }

    // Crear la nota
    const note = await prisma.note.create({
      data: {
        leadId,
        contenido: titulo ? `**${titulo}**\n\n${contenido}` : contenido,
        creadoPor: userId || null
      },
      include: {
        creador: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    // Actualizar fecha de última actividad del lead
    await prisma.lead.update({
      where: { id: leadId },
      data: { fechaUltimaActividad: new Date() }
    })

    // Registrar en audit log (solo si hay usuario autenticado)
    if (userId) {
      await logAuditAction(
        userId,
        tenantId,
        'NOTA_CREADA',
        'Note',
        note.id,
        `Nota creada para lead ${leadId}`,
        undefined,
        { leadId }
      )
    }

    // Disparar automatización
    try {
      await triggerAutomation('nota_creada', {
        leadId,
        noteId: note.id,
        contenido: note.contenido,
        tenantId
      })
    } catch (automationError) {
      console.error('Error triggering automation:', automationError)
    }

    return NextResponse.json({
      success: true,
      note
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json(
      { error: 'Error al crear la nota' },
      { status: 500 }
    )
  }
}
