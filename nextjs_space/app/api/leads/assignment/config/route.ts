export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getLeadAssignmentConfig, saveLeadAssignmentConfig } from '@/lib/leads/assignment'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const config = await getLeadAssignmentConfig(auth.tenant!.id)
    return NextResponse.json(config)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }
})

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    await saveLeadAssignmentConfig(auth.tenant!.id, body)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
})
