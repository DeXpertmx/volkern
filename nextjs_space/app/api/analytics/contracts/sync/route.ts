import { NextResponse } from 'next/server'
import { ContractHealthService } from '@/lib/finance/contract-health-service'

export async function POST(req: Request) {
  try {
    console.log('[API:Sync] Disparando actualización manual de Health Scores...')
    await ContractHealthService.updateAllHealthScores()
    
    return NextResponse.json({ 
      success: true, 
      message: 'Sincronización del Oráculo completada' 
    })
  } catch (error) {
    console.error('[API:Sync] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
