import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { importarDesdeFormData } from '../_comun'

export const POST = withTenantAuth(async (req, auth) => {
  try {
    return await importarDesdeFormData(req, auth, 'clients')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}, ['contacts:write'])
