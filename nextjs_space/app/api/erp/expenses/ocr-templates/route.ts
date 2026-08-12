import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { OcrTemplateField, VatRowTemplate } from '@/lib/finance/ocr-template'

export const dynamic = 'force-dynamic'

interface TemplateRow {
  id: string
  supplierName: string
  nif: string | null
  name: string
  fields: unknown
  vatRows: unknown
  updatedAt: Date
}

function serializeTemplate(t: TemplateRow) {
  return {
    id: t.id,
    supplierName: t.supplierName,
    nif: t.nif,
    name: t.name,
    fields: t.fields as unknown as OcrTemplateField[],
    vatRows: t.vatRows as unknown as VatRowTemplate[],
    updatedAt: t.updatedAt,
  }
}

// GET /api/erp/expenses/ocr-templates?supplierName=...&nif=...
// Devuelve TODAS las plantillas del proveedor (puede tener varios formatos).
export const GET = withTenantAuth(async (req, auth) => {
  const url = new URL(req.url)
  const supplierName = (url.searchParams.get('supplierName') || '').trim()
  const nif = (url.searchParams.get('nif') || '').trim()

  if (!supplierName && !nif) {
    return NextResponse.json({ templates: [], template: null })
  }

  const tenantId = auth.tenant!.id

  const rows = await prisma.supplierOcrTemplate.findMany({
    where: {
      tenantId,
      OR: [
        ...(supplierName ? [{ supplierName: { equals: supplierName, mode: 'insensitive' as const } }] : []),
        ...(nif ? [{ nif: { equals: nif, mode: 'insensitive' as const } }] : []),
      ],
    },
    orderBy: { updatedAt: 'desc' },
  })

  const templates = rows.map(serializeTemplate)
  return NextResponse.json({ templates, template: templates[0] || null })
})

// POST /api/erp/expenses/ocr-templates
// { supplierName, nif?, name?, fields?, vatRows?, templateId? }
//  - Con templateId: actualiza esa plantilla (nombre, campos, tramos, nif).
//  - Sin templateId: crea una plantilla nueva con `name` (default "Formato N").
//  - `vatRows` (opcional) guarda las posiciones de las filas de IVA aprendidas
//    al confirmar los tramos; puede enviarse solo, sin `fields`.
export const POST = withTenantAuth(async (req, auth) => {
  const body = await req.json().catch(() => null)
  const supplierName = (body?.supplierName || '').trim()
  const fields: OcrTemplateField[] = Array.isArray(body?.fields) ? body.fields : []
  const vatRows: VatRowTemplate[] = Array.isArray(body?.vatRows) ? body.vatRows : []
  const nif = body?.nif ? String(body.nif).trim() : null
  const templateId = body?.templateId ? String(body.templateId) : null
  const requestedName = body?.name ? String(body.name).trim() : ''

  if (!supplierName) {
    return NextResponse.json({ error: 'supplierName es obligatorio' }, { status: 400 })
  }
  if (fields.length === 0 && vatRows.length === 0) {
    return NextResponse.json({ error: 'Debes anotar al menos un campo o un tramo de IVA en la imagen' }, { status: 400 })
  }
  for (const f of fields) {
    if (!f.field || !isFinite(f.x) || !isFinite(f.y) || !isFinite(f.w) || !isFinite(f.h)) {
      return NextResponse.json({ error: 'Coordenadas de región inválidas' }, { status: 400 })
    }
  }
  for (const v of vatRows) {
    if (!v.rate || !v.base || !v.cuota ||
      !isFinite(v.rate.x) || !isFinite(v.rate.y) || !isFinite(v.rate.w) || !isFinite(v.rate.h) ||
      !isFinite(v.base.x) || !isFinite(v.base.y) || !isFinite(v.base.w) || !isFinite(v.base.h) ||
      !isFinite(v.cuota.x) || !isFinite(v.cuota.y) || !isFinite(v.cuota.w) || !isFinite(v.cuota.h)) {
      return NextResponse.json({ error: 'Coordenadas de fila de IVA inválidas' }, { status: 400 })
    }
  }

  const tenantId = auth.tenant!.id

  // Si el proveedor ya está registrado, usamos su NIF como clave extra
  let resolvedNif = nif
  if (!resolvedNif) {
    const supplier = await prisma.supplier.findFirst({
      where: { tenantId, name: { equals: supplierName, mode: 'insensitive' } },
      select: { taxId: true },
    })
    resolvedNif = supplier?.taxId || null
  }

  // Actualizar plantilla existente por id
  if (templateId) {
    const existing = await prisma.supplierOcrTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }
    const template = await prisma.supplierOcrTemplate.update({
      where: { id: existing.id },
      data: {
        supplierName,
        nif: resolvedNif,
        name: requestedName || undefined,
        // Solo se tocan los campos enviados: guardar tramos no borra las
        // regiones de texto aprendidas y viceversa.
        ...(fields.length > 0 ? { fields: fields as any } : {}),
        ...(vatRows.length > 0 ? { vatRows: vatRows as any } : {}),
      },
    })
    return NextResponse.json({ success: true, template: serializeTemplate(template as TemplateRow) })
  }

  // Crear nueva: nombre auto "Formato N" si no se indica
  let name = requestedName
  if (!name) {
    const count = await prisma.supplierOcrTemplate.count({
      where: { tenantId, supplierName: { equals: supplierName, mode: 'insensitive' } },
    })
    name = `Formato ${count + 1}`
  }

  try {
    const template = await prisma.supplierOcrTemplate.create({
      data: { tenantId, supplierName, nif: resolvedNif, name, fields: fields as any, vatRows: vatRows as any },
    })
    return NextResponse.json({ success: true, template: serializeTemplate(template as TemplateRow) })
  } catch (err: any) {
    // P2002: ya existe una plantilla con ese nombre para el proveedor
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: `Ya existe una plantilla llamada «${name}» para este proveedor. Usa otro nombre o edita la existente.` },
        { status: 409 }
      )
    }
    throw err
  }
})

// DELETE /api/erp/expenses/ocr-templates?id=...
export const DELETE = withTenantAuth(async (req, auth) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 })
  }
  const existing = await prisma.supplierOcrTemplate.findFirst({
    where: { id, tenantId: auth.tenant!.id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
  }
  await prisma.supplierOcrTemplate.delete({ where: { id: existing.id } })
  return NextResponse.json({ success: true })
})
