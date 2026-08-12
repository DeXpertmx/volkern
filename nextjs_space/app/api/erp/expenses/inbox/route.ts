export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { uploadFile } from '@/lib/s3'

export const GET = withTenantAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const documents = await prisma.expenseInboxDocument.findMany({
    where: { tenantId: auth.tenant!.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      fileName: true,
      storageKey: true,
      documentType: true,
      status: true,
      pageStart: true,
      pageEnd: true,
      extractedData: true,
      expenseId: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ documents })
}, ['erp:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el documento' }, { status: 400 })

    const pageStart = Math.max(1, Number(formData.get('pageStart') || 1))
    const pageEnd = Math.max(pageStart, Number(formData.get('pageEnd') || pageStart))
    const documentType = String(formData.get('documentType') || 'invoice')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageKey = await uploadFile(Buffer.from(await file.arrayBuffer()), `expense-inbox/${auth.tenant!.id}/${Date.now()}-${safeName}`, file.type || 'application/pdf')
    const rawGroups = formData.get('groups')
    const groups = typeof rawGroups === 'string' ? JSON.parse(rawGroups) : null

    if (Array.isArray(groups) && groups.length > 0) {
      const documents = await prisma.$transaction(
        groups.map((group: any) => prisma.expenseInboxDocument.create({
          data: {
            tenantId: auth.tenant!.id,
            createdById: auth.user!.id,
            fileName: String(group.label || file.name),
            storageKey,
            documentType,
            pageStart: Math.max(1, Number(group.pageStart || 1)),
            pageEnd: Math.max(1, Number(group.pageEnd || group.pageStart || 1)),
          },
        }))
      )
      return NextResponse.json({ documents }, { status: 201 })
    }

    const document = await prisma.expenseInboxDocument.create({
      data: {
        tenantId: auth.tenant!.id,
        createdById: auth.user!.id,
        fileName: file.name,
        storageKey,
        documentType,
        pageStart,
        pageEnd,
      },
    })
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('[ExpenseInbox] Error creando documento:', error)
    return NextResponse.json({ error: 'No se pudo guardar el documento en la bandeja' }, { status: 500 })
  }
}, ['erp:write'])

export const PATCH = withTenantAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'Falta el id del documento' }, { status: 400 })
  const document = await prisma.expenseInboxDocument.updateMany({
    where: { id: body.id, tenantId: auth.tenant!.id },
    data: {
      ...(typeof body.status === 'string' ? { status: body.status } : {}),
      ...(body.expenseId === null || typeof body.expenseId === 'string' ? { expenseId: body.expenseId } : {}),
      ...(body.extractedData !== undefined ? { extractedData: body.extractedData } : {}),
      ...(body.errorMessage === null || typeof body.errorMessage === 'string' ? { errorMessage: body.errorMessage } : {}),
    },
  })
  if (document.count === 0) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}, ['erp:write'])
