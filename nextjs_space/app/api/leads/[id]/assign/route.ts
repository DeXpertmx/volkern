export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAction } from '@/lib/permissions'

// PATCH /api/leads/[id]/assign - Asignar un lead a un usuario
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const data = await request.json()
    const { asignadoA } = data
    
    // Obtener el lead actual para comparar
    const currentLead = await prisma.lead.findUnique({
      where: { id: id },
      include: { 
        asignadoUsuario: { 
          select: { name: true, email: true } 
        } 
      }
    })

    if (!currentLead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    // Actualizar el lead
    const lead = await prisma.lead.update({
      where: { id: id },
      data: {
        asignadoA: asignadoA || null
      },
      include: {
        asignadoUsuario: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    // Registrar en audit log
    const previousUser = currentLead.asignadoUsuario
      ? currentLead.asignadoUsuario.name || currentLead.asignadoUsuario.email
      : 'Sin asignar'
    const newUser = lead.asignadoUsuario
      ? lead.asignadoUsuario.name || lead.asignadoUsuario.email
      : 'Sin asignar'

    await logAction({
      userId: session.user.id,
      action: 'lead.assign',
      entity: 'Lead',
      entityId: id,
      details: {
        previous: previousUser,
        new: newUser
      }
    })

    return NextResponse.json(lead)
  } catch (error) {
    console.error('Error assigning lead:', error)
    return NextResponse.json(
      { error: 'Error al asignar el lead' },
      { status: 500 }
    )
  }
}
