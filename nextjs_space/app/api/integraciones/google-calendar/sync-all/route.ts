export const dynamic = 'force-dynamic';

// 📅 SINCRONIZACIÓN BIDIRECCIONAL PARA TODOS LOS TENANTS
// - Volkern → Google: Solo sincroniza citas originadas en Volkern, evita duplicados
// - Google → Volkern: Trae cambios desde Google Calendar usando syncToken
// Endpoint protegido - solo para uso interno/cron

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncAllFutureCitas, syncFromGoogleToVolkern } from '@/lib/google-calendar'

// Clave secreta para autorizar llamadas internas (cron jobs)
const SYNC_SECRET = process.env.GCAL_SYNC_SECRET || 'volkern-gcal-sync-2024'

export async function POST(request: NextRequest) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${SYNC_SECRET}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    console.log('📅 Iniciando sincronización automática para todos los tenants...')

    // Obtener todos los usuarios con Google Calendar activo
    const integraciones = await prisma.googleCalendarIntegration.findMany({
      where: { activo: true },
      select: { userId: true, tenantId: true }
    })

    console.log(`📊 Encontrados ${integraciones.length} usuarios con Google Calendar activo`)

    const resultados: { userId: string; tenantId: string; success: boolean; resultado?: any; error?: string }[] = []

    for (const integracion of integraciones) {
      try {
        console.log(`🔄 Sincronizando usuario ${integracion.userId} (tenant ${integracion.tenantId})...`)
        
        // PASO 1: Volkern → Google
        console.log('  📤 Volkern → Google Calendar...')
        const resultado = await syncAllFutureCitas(integracion.userId)
        
        // PASO 2: Google → Volkern
        console.log('  📥 Google Calendar → Volkern...')
        await syncFromGoogleToVolkern(integracion.userId, false)
        resultados.push({
          userId: integracion.userId,
          tenantId: integracion.tenantId,
          success: true,
          resultado
        })
      } catch (error: any) {
        console.error(`❌ Error sincronizando usuario ${integracion.userId}:`, error.message)
        resultados.push({
          userId: integracion.userId,
          tenantId: integracion.tenantId,
          success: false,
          error: error.message
        })
      }
    }

    const exitosos = resultados.filter(r => r.success).length
    const fallidos = resultados.filter(r => !r.success).length

    console.log(`✅ Sincronización completada: ${exitosos} exitosos, ${fallidos} fallidos`)

    return NextResponse.json({
      success: true,
      message: `Sincronización completada para ${integraciones.length} usuarios`,
      resumen: {
        total: integraciones.length,
        exitosos,
        fallidos
      },
      resultados
    })
  } catch (error: any) {
    console.error('❌ Error en sincronización global:', error.message)
    return NextResponse.json({
      error: 'Error en sincronización',
      message: error.message
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Solo para verificar estado
  return NextResponse.json({
    status: 'enabled',
    message: 'Sincronización Volkern ⇄ Google Calendar habilitada',
    mode: 'bidirectional'
  })
}
