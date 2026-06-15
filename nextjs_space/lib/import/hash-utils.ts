import crypto from 'crypto'

export function createHash(data: any, previousHash: string | null): string {
  const payload = JSON.stringify({
    tenantId: data.tenantId,
    description: data.description,
    date: data.date?.toISOString?.() || data.date,
    previousHash,
  })

  return crypto.createHmac('sha256', 'volkern-import-seed').update(payload).digest('hex')
}
