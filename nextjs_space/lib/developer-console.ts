/**
 * Developer Console — orquestador server-side
 *
 * Single source of truth para:
 *  - crear/revocar API keys con config de partner (incl. webhook opt-in en el mismo paso)
 *  - configurar webhook URL + secret + eventos por key
 *  - log fire-and-forget de cada request autenticada con API key
 *  - dispatch de webhook outbound (crea PartnerWebhookDelivery + enqueue)
 *  - retry manual + listado de deliveries
 *
 * Reglas de seguridad:
 *  - webhookSecret es plaintext (partner debe guardar el mismo valor para verificar HMAC)
 *  - key en plaintext se muestra UNA SOLA VEZ al admin en el momento de creación
 *  - después solo `keyHash` (SHA-256) y `prefix` están en la DB
 */

import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { generateApiKey } from '@/lib/api-keys'

// ─── HMAC helpers (stripe-style X-Volkern-Signature) ──────────────────────

export const WEBHOOK_SIGNATURE_HEADER = 'X-Volkern-Signature'
export const WEBHOOK_TIMESTAMP_HEADER = 'X-Volkern-Timestamp'

export function hmacSignPayload(payloadString: string, secret: string, timestamp: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${payloadString}`).digest('hex')
}

/**
 * Verifica una firma entrante desde el lado del partner.
 * Acepta solo formato `sha256=<hex>`.
 */
export function verifyWebhookSignature(
  payloadString: string,
  signature: string,
  secret: string,
): boolean {
  const match = signature.match(/^sha256=([a-f0-9]+)$/)
  if (!match) return false
  const expected = crypto.createHmac('sha256', secret).update(payloadString).digest('hex')
  if (expected.length !== match[1].length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(match[1], 'hex'))
  } catch {
    return false
  }
}

// ─── URL validation (anti-SSRF) ──────────────────────────────────────────

const ALLOWED_WEBHOOK_PROTOCOLS = new Set(['http:', 'https:'])

// RFC1918 / loopback ranges a bloquear; el partner debe usar URL pública.
function isPrivateIp(hostname: string): boolean {
  if (/^127\./.test(hostname)) return true
  if (/^10\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  if (hostname === 'localhost') return true
  if (hostname === '::1') return true
  // Link-local 169.254.0.0/16 (cloud metadata)
  if (/^169\.254\./.test(hostname)) return true
  return false
}

/**
 * Valida que la URL del webhook sea http(s) pública. Rechaza file:, data:, javascript:, IPs privadas.
 * Devuelve null si OK, o un string con el motivo de rechazo.
 */
export function validateWebhookUrl(raw: string | null | undefined): string | null {
  if (!raw) return 'URL no proporcionada'
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return 'URL malformada'
  }
  if (!ALLOWED_WEBHOOK_PROTOCOLS.has(parsed.protocol)) {
    return 'Solo se permiten URLs http(s)'
  }
  if (parsed.username || parsed.password) {
    return 'No se permiten credenciales embebidas en la URL'
  }
  // Bloquear IPs literales privadas (hostname puede ser un dominio, eso está OK).
  if (isPrivateIp(parsed.hostname)) {
    return 'URL apunta a una red privada; debe ser endpoint público'
  }
  return null
}

// ─── API Key creation / listing / revocation ─────────────────────────────

export interface WebhookConfigOptional {
  webhookUrl?: string
  webhookSecret?: string  // si no se da, se genera
  webhookEvents?: string[]
  webhookEnabled?: boolean
}

export interface CreateApiPartnerKeyInput {
  tenantId: string
  userId: string                  // admin que crea la key
  nombre: string
  partnerLabel?: string
  descripcion?: string
  scopes: string[]
  expiraEn?: Date | null
  type?: 'prod' | 'live'
  webhook?: WebhookConfigOptional // opcional; configuración en el mismo paso
}

export interface CreateApiPartnerKeyResult {
  id: string
  /** La key completa — SOLO se retorna UNA VEZ; el caller debe mostrarla antes de descartar. */
  key: string
  prefix: string
  /** Si se configuró un webhook, el secret en plaintext — SOLO una vez. */
  webhookSecret?: string
}

export async function createApiPartnerKey(input: CreateApiPartnerKeyInput): Promise<CreateApiPartnerKeyResult> {
  const { key, keyHash, prefix } = generateApiKey(input.type ?? 'prod')

  // Validación anti-SSRF si se da URL
  if (input.webhook?.webhookUrl) {
    const err = validateWebhookUrl(input.webhook.webhookUrl)
    if (err) throw new Error(`Webhook URL inválida: ${err}`)
  }

  const generatedWebhookSecret = input.webhook?.webhookUrl
    ? (input.webhook.webhookSecret ?? crypto.randomBytes(32).toString('hex'))
    : undefined

  const created = await prisma.apiKey.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      nombre: input.nombre,
      partnerLabel: input.partnerLabel ?? null,
      descripcion: input.descripcion ?? null,
      keyHash,
      prefix,
      scopes: input.scopes,
      expiraEn: input.expiraEn ?? null,
      webhookUrl: input.webhook?.webhookUrl ?? null,
      webhookSecret: generatedWebhookSecret ?? null,
      webhookEvents: input.webhook?.webhookEvents ?? [],
      webhookEnabled: input.webhook?.webhookEnabled ?? false,
    },
    select: { id: true },
  })

  return {
    id: created.id,
    key,
    prefix,
    webhookSecret: generatedWebhookSecret,
  }
}

export async function listApiPartnerKeys(tenantId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nombre: true,
      partnerLabel: true,
      descripcion: true,
      prefix: true,
      scopes: true,
      activo: true,
      expiraEn: true,
      ultimoUso: true,
      totalUsos: true,
      createdAt: true,
      webhookUrl: true,
      webhookEvents: true,
      webhookEnabled: true,
      revokedAt: true,
      revokedReason: true,
      rateLimitPerMin: true,
    },
  })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const requestStats = await prisma.apiRequestLog.groupBy({
    by: ['apiKeyId'],
    where: { tenantId, occurredAt: { gte: since }, apiKeyId: { not: null } },
    _count: true,
  })
  const requestsByKey = new Map(requestStats.map((s) => [s.apiKeyId!, s._count]))

  return keys.map((k) => ({
    ...k,
    requests24h: requestsByKey.get(k.id) ?? 0,
  }))
}

export async function revokeApiPartnerKey(apiKeyId: string, tenantId: string, reason: string): Promise<void> {
  if (!reason || reason.length < 3) throw new Error('Razón de revocación requerida (>=3 chars)')
  await prisma.apiKey.update({
    where: { id: apiKeyId, tenantId },
    data: {
      activo: false,
      revokedAt: new Date(),
      revokedReason: reason,
      webhookEnabled: false,
    },
  })
}

// ─── Webhook config per key ──────────────────────────────────────────────

export interface UpdateWebhookConfigInput {
  apiKeyId: string
  tenantId: string
  webhookUrl?: string | null
  webhookEvents?: string[]
  webhookEnabled?: boolean
  rotateSecret?: boolean
}

export interface UpdateWebhookConfigResult {
  plainSecretReturned?: string
}

export async function updateApiPartnerWebhook(input: UpdateWebhookConfigInput): Promise<UpdateWebhookConfigResult> {
  if (input.webhookUrl) {
    const err = validateWebhookUrl(input.webhookUrl)
    if (err) throw new Error(`Webhook URL inválida: ${err}`)
  }

  let plaintextSecret: string | undefined
  const data: Record<string, unknown> = {}

  if (input.webhookUrl !== undefined) data.webhookUrl = input.webhookUrl
  if (input.webhookEvents !== undefined) data.webhookEvents = input.webhookEvents
  if (input.webhookEnabled !== undefined) data.webhookEnabled = input.webhookEnabled

  if (input.rotateSecret) {
    plaintextSecret = crypto.randomBytes(32).toString('hex')
    data.webhookSecret = plaintextSecret
  }

  await prisma.apiKey.update({
    where: { id: input.apiKeyId, tenantId: input.tenantId },
    data,
  })

  return { plainSecretReturned: plaintextSecret }
}

// ─── Request logging (fire-and-forget) ───────────────────────────────────

export interface LogApiRequestInput {
  tenantId: string
  userId?: string | null
  apiKeyId?: string | null
  requestId?: string
  method: string
  path: string
  statusCode: number
  latencyMs: number
  ipAddress?: string | null
  userAgent?: string | null
  errorMessage?: string | null
}

const REQUEST_LOG_KEEP_DAYS = 7

export function logApiRequest(input: LogApiRequestInput): void {
  let requestId = input.requestId
  if (!requestId) {
    requestId = crypto.randomUUID()
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[DeveloperConsole] logApiRequest auto-generó requestId; el caller debería pasarlo')
    }
  }
  prisma.apiRequestLog
    .create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        requestId,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        latencyMs: input.latencyMs,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    })
    .catch((err) => {
      console.error('[DeveloperConsole] logApiRequest failed:', err?.message ?? err)
    })
}

export interface ListRequestLogsOptions {
  apiKeyId?: string
  statusCode?: number
  method?: string
  search?: string
  limit?: number
}

export async function listApiRequestLogs(tenantId: string, opts: ListRequestLogsOptions = {}) {
  const limit = Math.min(opts.limit ?? 50, 200)
  const where: Record<string, unknown> = {
    tenantId,
    occurredAt: { gte: new Date(Date.now() - REQUEST_LOG_KEEP_DAYS * 24 * 60 * 60 * 1000) },
  }
  if (opts.apiKeyId) where.apiKeyId = opts.apiKeyId
  if (opts.statusCode !== undefined) where.statusCode = opts.statusCode
  if (opts.method) where.method = opts.method
  if (opts.search) where.path = { contains: opts.search }

  return prisma.apiRequestLog.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take: limit,
    select: {
      id: true,
      requestId: true,
      method: true,
      path: true,
      statusCode: true,
      latencyMs: true,
      ipAddress: true,
      occurredAt: true,
      errorMessage: true,
      apiKey: { select: { id: true, nombre: true, partnerLabel: true, prefix: true } },
    },
  })
}

// ─── Webhook dispatch (outbound hacia partners) ─────────────────────────

export interface DispatchPartnerWebhookInput {
  tenantId: string
  apiKeyId: string
  eventType: string
  eventId?: string
  payload: Record<string, unknown>
}

export async function dispatchPartnerWebhook(input: DispatchPartnerWebhookInput): Promise<void> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: input.apiKeyId },
    select: {
      webhookUrl: true,
      webhookEvents: true,
      webhookEnabled: true,
      webhookSecret: true,
      activo: true,
      tenantId: true,
    },
  })

  if (!apiKey?.activo) return
  if (!apiKey.webhookEnabled || !apiKey.webhookUrl || !apiKey.webhookSecret) return
  if (apiKey.webhookEvents.length > 0 && !apiKey.webhookEvents.includes(input.eventType)) return
  if (apiKey.tenantId !== input.tenantId) {
    throw new Error('Cross-tenant webhook dispatch attempt')
  }

  const payloadString = JSON.stringify(input.payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = hmacSignPayload(payloadString, apiKey.webhookSecret, timestamp)

  const delivery = await prisma.partnerWebhookDelivery.create({
    data: {
      tenantId: input.tenantId,
      apiKeyId: input.apiKeyId,
      eventType: input.eventType,
      eventId: input.eventId ?? crypto.randomUUID(),
      payload: input.payload as any,
      signature,
      targetUrl: apiKey.webhookUrl,
      status: 'pending',
      nextAttemptAt: new Date(),
    },
  })

  const { deliverPartnerWebhookNow } = await import('@/lib/queues/partner-webhook-queue')
  await deliverPartnerWebhookNow(delivery.id)
}

// ─── Webhook deliveries / retry ─────────────────────────────────────────

export interface ListDeliveriesOptions {
  apiKeyId?: string
  status?: 'pending' | 'sent' | 'failed' | 'retrying'
  eventType?: string
  limit?: number
}

export async function listWebhookDeliveries(tenantId: string, opts: ListDeliveriesOptions = {}) {
  return prisma.partnerWebhookDelivery.findMany({
    where: {
      tenantId,
      ...(opts.apiKeyId ? { apiKeyId: opts.apiKeyId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.eventType ? { eventType: opts.eventType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 50, 200),
    select: {
      id: true,
      eventType: true,
      eventId: true,
      targetUrl: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      nextAttemptAt: true,
      lastAttemptAt: true,
      responseStatus: true,
      responseBody: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
      apiKey: { select: { id: true, nombre: true, partnerLabel: true } },
    },
  })
}

/**
 * Re-intenta un delivery fallido. Resetea status a pending; enqueue inmediato.
 */
export async function retryWebhookDelivery(deliveryId: string, tenantId: string): Promise<void> {
  const delivery = await prisma.partnerWebhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, tenantId: true, status: true },
  })

  if (!delivery || delivery.tenantId !== tenantId) {
    throw new Error('Delivery no encontrado o no pertenece al tenant')
  }
  if (delivery.status === 'sent') {
    throw new Error('El delivery ya fue entregado exitosamente; no necesita retry')
  }

  await prisma.partnerWebhookDelivery.update({
    where: { id: deliveryId },
    data: { status: 'pending', nextAttemptAt: new Date() },
  })

  const { deliverPartnerWebhookNow } = await import('@/lib/queues/partner-webhook-queue')
  await deliverPartnerWebhookNow(deliveryId)
}
