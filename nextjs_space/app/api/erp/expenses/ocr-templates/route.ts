import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { OcrTemplateField } from '@/lib/finance/ocr-template'

export const dynamic = 'force-dynamic'

// GET /api/erp/expenses/ocr-templates?supplierName=...&nif=...
// Devuelve la plantilla aprendida para el proveedor (si existe).
export const GET = withTenantAuth(async (req, auth) => {
  const url = new URL(req.url)
  const supplierName = (url.searchParams.get('supplierName') || '').trim()
  const nif = (url.searchParams.get('nif') || '').trim()

  if (!supplierName && !nif) {
    return NextResponse.json({ template: null })
  }

  const tenantId = auth.tenant!.id

  const existing = await prisma.supplierOcrTemplate.findFirst({
    where: {
      tenantId,
      OR: [
        ...(supplierName ? [{ supplierName: { equals: supplierName, mode: 'insensitive' as const } }] : []),
        ...(nif ? [{ nif: { equals: nif, mode: 'insensitive' as const } }] : []),
      ],
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    template: existing
      ? { id: existing.id, supplierName: existing.supplierName, nif: existing.nif, fields: existing.fields as unknown as OcrTemplateField[] }
      : null,
  })
})

// POST /api/erp/expenses/ocr-templates
// { supplierName, nif?, fields: OcrTemplateField[] } — upsert por (tenantId, supplierName)
export const POST = withTenantAuth(async (req, auth) => {
  const body = await req.json().catch(() => null)
  const supplierName = (body?.supplierName || '').trim()
  const fields: OcrTemplateField[] = Array.isArray(body?.fields) ? body.fields : []
  const nif = body?.nif ? String(body.nif).trim() : null

  if (!supplierName) {
    return NextResponse.json({ error: 'supplierName es obligatorio' }, { status: 400 })
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'Debes anotar al menos un campo en la imagen' }, { status: 400 })
  }
  for (const f of fields) {
    if (!f.field || !Array.isArray(f.x) && typeof f.x !== 'number' || !isFinite(f.x) || !isFinite(f.y) || !isFinite(f.w) || !isFinite(f.h)) {
      return NextResponse.json({ error: 'Coordenadas de región inválidas' }, { status: 400 })
    }
  }

  const tenantId = auth.tenant!.id

  // Si el proveedor ya está registrado, guardamos su NIF actual como clave extra
  let resolvedNif = nif
  if (!resolvedNif) {
    const supplier = await prisma.supplier.findFirst({
      where: { tenantId, name: { equals: supplierName, mode: 'insensitive' } },
      select: { taxId: true },
    })
    resolvedNif = supplier?.taxId || null
  }

  const existing = await prisma.supplierOcrTemplate.findFirst({
    where: { tenantId, supplierName: { equals: supplierName, mode: 'insensitive' } },
    select: { id: true },
  })

  const template = existing
    ? await prisma.supplierOcrTemplate.update({
        where: { id: existing.id },
        data: { supplierName, nif: resolvedNif, fields: fields as any },
      })
    : await prisma.supplierOcrTemplate.create({
        data: { tenantId, supplierName, nif: resolvedNif, fields: fields as any },
      })

  return NextResponse.json({ success: true, template })
})
