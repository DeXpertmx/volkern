export const dynamic = 'force-dynamic';

/**
 * API para gestionar la integración de Evolution API (WhatsApp)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET - Obtener configuración de Evolution API
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener usuario con tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    // Buscar integración de Evolution API
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'evolution'
      }
    })

    if (!integration) {
      return NextResponse.json({ 
        configured: false,
        message: 'Evolution API no configurado'
      })
    }

    return NextResponse.json({
      configured: true,
      integration: {
        id: integration.id,
        activo: integration.activo,
        conectado: integration.conectado,
        api_key: integration.credenciales ? (integration.credenciales as any).api_key : null,
        instance_name: integration.credenciales ? (integration.credenciales as any).instance_name : null,
        api_url: integration.credenciales ? (integration.credenciales as any).api_url : 'https://evo.abacus.ai',
        ultimaSincronizacion: integration.ultimaSincronizacion,
        fechaCreacion: integration.fechaCreacion
      }
    })

  } catch (error) {
    console.error('Error al obtener integración Evolution API:', error)
    return NextResponse.json({ 
      error: 'Error al obtener configuración',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * POST - Crear o actualizar configuración de Evolution API
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener usuario con tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    const body = await req.json()
    const { api_key, instance_name, api_url } = body

    // Validar campos requeridos
    if (!api_key || !instance_name) {
      return NextResponse.json({ 
        error: 'API Key e Instance Name son requeridos',
        details: 'Debe proporcionar tanto api_key como instance_name'
      }, { status: 400 })
    }

    // Verificar conexión con Evolution API (opcional pero recomendado)
    try {
      const testUrl = api_url || 'https://evo.abacus.ai'
      const statusResponse = await fetch(`${testUrl}/instance/connectionState/${instance_name}`, {
        method: 'GET',
        headers: {
          'apikey': api_key,
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })

      if (!statusResponse.ok) {
        console.warn('⚠️ No se pudo verificar el estado de la instancia, pero se guardará la configuración')
      }
    } catch (verifyError) {
      console.warn('⚠️ Error al verificar Evolution API:', verifyError)
      // Continuamos aunque falle la verificación
    }

    // Buscar integración existente
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'evolution'
      }
    })

    let integration

    if (existingIntegration) {
      // Actualizar integración existente
      integration = await prisma.integration.update({
        where: { id: existingIntegration.id },
        data: {
          credenciales: {
            api_key,
            instance_name,
            api_url: api_url || 'https://evo.abacus.ai'
          },
          activo: true,
          conectado: true,
          ultimaSincronizacion: new Date()
        }
      })

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          accion: 'UPDATE_INTEGRATION',
          entidad: 'Integration',
          entidadId: integration.id,
          descripcion: 'Configuración de Evolution API actualizada'
        }
      })
    } else {
      // Crear nueva integración
      integration = await prisma.integration.create({
        data: {
          tenantId: user.tenantId,
          tipo: 'evolution',
          nombre: 'Evolution API',
          credenciales: {
            api_key,
            instance_name,
            api_url: api_url || 'https://evo.abacus.ai'
          },
          activo: true,
          conectado: true,
          ultimaSincronizacion: new Date()
        }
      })

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          accion: 'CREATE_INTEGRATION',
          entidad: 'Integration',
          entidadId: integration.id,
          descripcion: 'Integración de Evolution API configurada'
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Evolution API configurado exitosamente',
      integration: {
        id: integration.id,
        activo: integration.activo,
        conectado: integration.conectado
      }
    })

  } catch (error) {
    console.error('❌ Error al configurar Evolution API:', error)
    return NextResponse.json({ 
      error: 'Error al configurar Evolution API',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * DELETE - Eliminar integración de Evolution API
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    // Buscar y eliminar integración
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'evolution'
      }
    })

    if (integration) {
      await prisma.integration.delete({
        where: { id: integration.id }
      })

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          accion: 'DELETE_INTEGRATION',
          entidad: 'Integration',
          entidadId: integration.id,
          descripcion: 'Integración de Evolution API eliminada'
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Integración eliminada'
    })

  } catch (error) {
    console.error('Error al eliminar integración:', error)
    return NextResponse.json({ 
      error: 'Error al eliminar integración' 
    }, { status: 500 })
  }
}
