import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { executeImport } from '@/lib/import/import-service'

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const mapping = formData.get('mapping')
    if (!file || !mapping) return NextResponse.json({ error: 'Archivo y mapping requeridos' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const columnMapping = JSON.parse(mapping as string)

    const result = await executeImport(
      auth.tenant!.id,
      auth.user?.id || 'system',
      'catalog',
      'generic_csv',
      buffer,
      file.type,
      columnMapping
    )

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
})
