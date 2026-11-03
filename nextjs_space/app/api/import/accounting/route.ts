import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { importarDesdeFormData } from '../_comun'

export const POST = withTenantAuth(async (req, auth) => {
  try {
    // El año fiscal se lee en `_comun` y llega hasta `importOpeningBalances`.
    // Antes la ruta lo leía y lo tiraba: el asiento de apertura iba siempre al
    // 1 de enero del año en curso.
    return await importarDesdeFormData(req, auth, 'accounting')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}, ['accounting:write'])
