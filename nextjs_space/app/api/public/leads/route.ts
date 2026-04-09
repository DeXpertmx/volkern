export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, globalPrisma } from '@/lib/db'
import { sendNewLeadNotification } from '@/lib/email'
import { triggerAutomation } from '@/lib/automation-engine'
import { ScoringEngine } from '@/lib/scoring-engine'
import { withPublicTenant } from '@/lib/api-key-auth'

/**
 * Endpoint público para crear leads desde embeds
 * Aislamiento físico de base de datos garantizado por withPublicTenant
 */
export const POST = withPublicTenant(async (request, tenantId) => {
  try {
    const body = await request.json()
    const { nombre, email, telefono, notas, empresa, contextoProyecto } = body

    // 1. Verificamos que el tenant realmente existe en el Control Plane
    // (withPublicTenant ya inyectó el cliente, pero esto es una validación extra de seguridad)
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: tenantId }
    })

    if (!tenant || !tenant.dbUrl) {
      return NextResponse.json(
        { error: 'Tenant inválido o sin base de datos dedicada' },
        { status: 404 }
      )
    }

    // 2. Operaciones sobre la base de datos física del tenant
    // Usamos el proxy 'prisma' que ya apunta a la DB correcta gracias al wrapper
    const existingLead = await prisma.lead.findFirst({
      where: {
        email: email.toLowerCase()
      }
    })

    let lead

    if (existingLead) {
      // Actualizar lead existente
      lead = await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          nombre,
          telefono,
          notas,
          empresa,
          contextoProyecto,
          fechaUltimaActividad: new Date()
        }
      })
    } else {
      // Crear nuevo lead
      lead = await prisma.lead.create({
        data: {
          tenantId: tenantId,
          nombre,
          email: email.toLowerCase(),
          telefono: telefono || null,
          notas: notas || null,
          empresa: empresa || null,
          contextoProyecto: contextoProyecto || null,
          fuente: 'Formulario Embed',
          estado: 'nuevo',
          fechaUltimaActividad: new Date()
        }
      })

      // Notificaciones y Automatizaciones (Heredan contexto automáticamente)
      sendNewLeadNotification({
        nombre: lead.nombre,
        email: lead.email,
        telefono: lead.telefono,
        notas: lead.notas,
        tenantId: tenantId
      }).catch(err => console.error('Error notificación lead:', err))

      triggerAutomation('lead_created', {
        tenantId: tenantId,
        leadId: lead.id,
        lead: lead
      }).catch(err => console.error('Error automatización lead:', err))

      ScoringEngine.recalculateLeadScore(lead.id).catch(err => console.error('Error scoring lead:', err))
    }

    return NextResponse.json({
      success: true,
      lead: { id: lead.id, nombre: lead.nombre, email: lead.email }
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })

  } catch (error) {
    console.error('❌ Error creating public lead:', error)
    return NextResponse.json(
      { error: 'Error al crear lead' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    )
  }
})

// Manejar OPTIONS para CORS preflight
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
