import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { detectFileFormat } from '@/lib/import/import-service'

export const POST = withTenantAuth(async (req: Request, auth) => {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await detectFileFormat(buffer, file.type)

    return NextResponse.json({
      headers: result.headers,
      preview: result.preview,
      detectedSource: result.detectedSource,
      detectedType: result.detectedType,
      template: result.template ? { name: result.template.name } : null,
      suggestedMapping: result.suggestedMapping,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}, ['import:write'])
