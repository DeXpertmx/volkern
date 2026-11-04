export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { logAuditAction } from '@/lib/permissions'
import { triggerAutomation } from '@/lib/automation-engine'

// GET /api/leads/[id]/interactions - Obtener todas las interacciones de un lead
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

    const interactions = await prisma.interaction.findMany({
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
      total: interactions.length,
      interactions
    })
  } catch (error) {
    console.error('Error fetching interactions:', error)
    return NextResponse.json(
      { error: 'Error al cargar las interacciones' },
      { status: 500 }
    )
  }
}

// POST /api/leads/[id]/interactions - Crear una nueva interacción
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
    const { tipo, contenido, resultado, metadatos } = data

    // Validar campos requeridos
    if (!tipo || !contenido) {
      return NextResponse.json(
        { error: 'tipo y contenido son requeridos' },
        { status: 400 }
      )
    }

    // Validar tipo
    const tiposValidos = ['llamada', 'email', 'whatsapp', 'reunion', 'nota', 'otro']
    if (!tiposValidos.includes(tipo.toLowerCase())) {
      return NextResponse.json(
        { error: `tipo inválido. Valores permitidos: ${tiposValidos.join(', ')}` },
        { status: 400 }
      )
    }

    // Validar resultado si se proporciona
    const resultadosValidos = ['positivo', 'neutro', 'negativo']
    if (resultado && !resultadosValidos.includes(resultado.toLowerCase())) {
      return NextResponse.json(
        { error: `resultado inválido. Valores permitidos: ${resultadosValidos.join(', ')}` },
        { status: 400 }
      )
    }

    // Crear la interacción
    const interaction = await prisma.interaction.create({
      data: {
        leadId,
        tipo: tipo.toLowerCase(),
        contenido,
        resultado: resultado ? resultado.toLowerCase() : null,
        creadoPor: userId || null,
        metadatos: metadatos || null
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
        'INTERACCION_CREADA',
        'Interaction',
        interaction.id,
        `Interacción ${interaction.tipo} creada para lead ${leadId}`,
        undefined,
        {
          leadId,
          tipo: interaction.tipo,
          resultado: interaction.resultado
        }
      )
    }

    // Disparar automatización
    try {
      await triggerAutomation('interaccion_creada', {
        leadId,
        interactionId: interaction.id,
        tipo: interaction.tipo,
        contenido: interaction.contenido,
        resultado: interaction.resultado,
        tenantId
      })
    } catch (automationError) {
      console.error('Error triggering automation:', automationError)
    }

    return NextResponse.json({
      success: true,
      interaction
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating interaction:', error)
    return NextResponse.json(
      { error: 'Error al crear la interacción' },
      { status: 500 }
    )
  }
}
