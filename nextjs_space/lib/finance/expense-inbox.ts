import { prisma } from '@/lib/db'
import { uploadFile } from '@/lib/s3'

export interface CreateExpenseInboxDocumentInput {
  tenantId: string
  createdById: string
  buffer: Buffer
  fileName: string
  contentType: string
  documentType?: string
  pageStart?: number
  pageEnd?: number
}

export async function createExpenseInboxDocument(input: CreateExpenseInboxDocumentInput) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storageKey = await uploadFile(
    input.buffer,
    `expense-inbox/${input.tenantId}/${Date.now()}-${safeName}`,
    input.contentType
  )

  return prisma.expenseInboxDocument.create({
    data: {
      tenantId: input.tenantId,
      createdById: input.createdById,
      fileName: input.fileName,
      storageKey,
      documentType: input.documentType || 'invoice',
      pageStart: Math.max(1, input.pageStart || 1),
      pageEnd: Math.max(1, input.pageEnd || input.pageStart || 1),
    },
  })
}
