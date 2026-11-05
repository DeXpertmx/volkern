export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getDownloadUrl } from '@/lib/s3'

export const GET = withTenantAuth(async (req, auth, { params }: { params: { id: string } }) => {
  try {
    const { id } = params

    const expense = await prisma.expense.findUnique({
      where: { id },
      select: { receiptUrl: true, tenantId: true },
    })

    if (!expense || expense.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    }

    if (!expense.receiptUrl) {
      return NextResponse.json({ error: 'Este gasto no tiene comprobante' }, { status: 404 })
    }

    const signedUrl = await getDownloadUrl(expense.receiptUrl, 3600)

    return NextResponse.redirect(signedUrl)
  } catch (error) {
    console.error('[ExpenseReceipt] Error:', error)
    return NextResponse.json({ error: 'Error al obtener el comprobante' }, { status: 500 })
  }
}, ['erp:read'])
