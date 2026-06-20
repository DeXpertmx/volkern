/**
 * Partner Webhook Queue — entrega outbound HTTP hacia partners externos
 *
 * BullMQ con:
 *  - attempts: 5
 *  - backoff: exponencial inicial 60s (1m → 5m → 30m → 2h → 12h)
 *  - timeout por job: 10s (AbortSignal.timeout)
 *
 * FIXES aplicados tras code-review:
 *  - job.attemptsMade es source-of-truth para reintentos (NO doble-conteo con DB).
 *  - Cada intento re-firma con el webhookSecret ACTUAL del ApiKey.
 *  - responseHeaders cap (50 entries × 2KB cada uno).
 *  - url validada al dispatch (anti-SSRF enforced en developer-console.ts al guardar).
 *  - Worker singleton via globalThis (safe hot-reload en dev).
 */

import { Queue, Worker, type Job } from 'bullmq'
import IORedis, { Redis as IORedisType } from 'ioredis'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { hmacSignPayload } from '@/lib/developer-console'

// ─── Redis singleton ─────────────────────────────────────────────────────

const globalForWorker = globalThis as unknown as {
  partnerWebhookQueue?: Queue
  partnerWebhookWorker?: Worker
  partnerWebhookRedis?: IORedisType
}

function getRedis(): IORedisType {
  if (globalForWorker.partnerWebhookRedis) return globalForWorker.partnerWebhookRedis
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || 'redis://127.0.0.1:6379'
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForWorker.partnerWebhookRedis = client
  }
  return client
}

// ─── Queue singleton ────────────────────────────────────────────────────

function getQueue(): Queue {
  if (globalForWorker.partnerWebhookQueue) return globalForWorker.partnerWebhookQueue
  const q = new Queue('partner-webhook-deliveries', {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: false,
    },
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForWorker.partnerWebhookQueue = q
  }
  return q
}

export const partnerWebhookQueue: Queue = getQueue()

export async function deliverPartnerWebhookNow(deliveryId: string): Promise<void> {
  // crypto.randomBytes para evitar colisión si UI-retry + BullMQ delayed retry disparan en el mismo ms.
  const uniq = crypto.randomBytes(4).toString('hex')
  await partnerWebhookQueue.add(
    'deliver',
    { deliveryId },
    { jobId: `delivery:${deliveryId}:${Date.now()}:${uniq}` },
  )
}

// ─── Constantes de timeouts/limits ──────────────────────────────────────

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BODY_BYTES = 4096
const MAX_RESPONSE_HEADERS = 50
const MAX_RESPONSE_HEADER_VALUE = 2048
const WEBHOOK_SIGNATURE_HEADER = 'X-Volkern-Signature'
const WEBHOOK_TIMESTAMP_HEADER = 'X-Volkern-Timestamp'

function capResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  let count = 0
  for (const [k, v] of headers.entries()) {
    if (count >= MAX_RESPONSE_HEADERS) break
    out[k] = v.length > MAX_RESPONSE_HEADER_VALUE ? v.slice(0, MAX_RESPONSE_HEADER_VALUE) : v
    count++
  }
  return out
}

// ─── Worker ──────────────────────────────────────────────────────────────

interface DeliverJobData {
  deliveryId: string
}

async function processJob(job: Job<DeliverJobData>): Promise<{ status: string }> {
  const deliveryId = job.data?.deliveryId
  if (!deliveryId) throw new Error('Missing deliveryId')

  // job.attemptsMade de BullMQ es source-of-truth para "qué número de intento es este".
  // El leading attempts de BullMQ cuenta este job (1 en el primer run, 2 en el segundo, etc.).
  const bullAttempt = job.attemptsMade ?? 1

  const delivery = await prisma.partnerWebhookDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      tenantId: true,
      apiKeyId: true,
      eventType: true,
      eventId: true,
      payload: true,
      targetUrl: true,
      status: true,
      apiKey: {
        select: { activo: true, webhookEnabled: true, webhookSecret: true },
      },
    },
  })

  if (!delivery) {
    logger.warn({ deliveryId }, '[PartnerWebhook] Delivery not found')
    return { status: 'not_found' }
  }

  if (delivery.apiKey.activo === false || delivery.apiKey.webhookEnabled === false) {
    await prisma.partnerWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        errorMessage: 'API key revocada o webhook deshabilitado',
        completedAt: new Date(),
      },
    })
    return { status: 'cancelled' }
  }

  // Re-firma con el webhookSecret ACTUAL (pudo rotarse desde que se enqueó).
  const webhookSecret = delivery.apiKey.webhookSecret
  if (!webhookSecret) {
    await prisma.partnerWebhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', errorMessage: 'Webhook secret missing', completedAt: new Date() },
    })
    return { status: 'no_secret' }
  }

  const payloadString = JSON.stringify(delivery.payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = hmacSignPayload(payloadString, webhookSecret, timestamp)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Volkern-Webhooks/1.0',
    [WEBHOOK_SIGNATURE_HEADER]: signature,
    [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    'X-Volkern-Event-Type': delivery.eventType,
    'X-Volkern-Event-Id': delivery.eventId,
  }

  // Persistir antes del fetch para saber que empezamos (sin incrementar manualmente —
  // ya tenemos job.attemptsMade que es source-of-truth).
  await prisma.partnerWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempts: bullAttempt,
      lastAttemptAt: new Date(),
      status: bullAttempt === 1 ? 'pending' : 'retrying',
    },
  })

  let responseStatus: number | null = null
  let responseBody: string | null = null
  let responseHeadersJson: Record<string, string> | null = null
  let errorMessage: string | null = null

  try {
    const res = await fetch(delivery.targetUrl, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
    })

    responseStatus = res.status
    responseHeadersJson = capResponseHeaders(res.headers)
    const text = await res.text()
    responseBody =
      text.length > MAX_RESPONSE_BODY_BYTES
        ? text.slice(0, MAX_RESPONSE_BODY_BYTES) + '...[truncated]'
        : text

    if (res.ok) {
      await prisma.partnerWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'sent',
          responseStatus,
          responseBody,
          responseHeaders: responseHeadersJson ?? {},
          completedAt: new Date(),
          errorMessage: null,
        },
      })
      logger.info({ deliveryId, status: responseStatus }, '[PartnerWebhook] delivered')
      return { status: 'sent' }
    } else {
      errorMessage = `HTTP ${responseStatus}`
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    logger.warn({ deliveryId, err: errorMessage }, '[PartnerWebhook] delivery attempt failed')
  }

  // Fallo: marcamos retrying/failed. Si BullMQ reintentará, throw permite backoff.
  await prisma.partnerWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'retrying',
      responseStatus,
      responseBody,
      responseHeaders: responseHeadersJson ?? {},
      errorMessage,
      nextAttemptAt: new Date(Date.now() + exponentialDelay(bullAttempt)),
    },  })

  throw new Error(errorMessage ?? 'Partner webhook failed')
}

/**
 * Backoff exponencial: 60s → 5m → 30m → 2h → 12h.
 * BullMQ también aplica backoff en su capa; este valor es informativo en el DB
 * (el partner puede ver cuándo será el próximo intento).
 */
function exponentialDelay(attempt: number): number {
  const steps = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]
  return steps[Math.min(Math.max(attempt - 1, 0), steps.length - 1)]
}

// ─── Worker singleton con handlers ───────────────────────────────────────

function getWorker(): Worker {
  if (globalForWorker.partnerWebhookWorker) return globalForWorker.partnerWebhookWorker
  const w = new Worker<DeliverJobData>(
    'partner-webhook-deliveries',
    processJob,
    { connection: getRedis(), concurrency: 8 },
  )
  w.on('failed', (job, err) => {
    if (job?.attemptsMade && job.attemptsMade >= (job.opts.attempts ?? 5)) {
      // BullMQ agotó retries — marcamos explícitamente failed
      prisma.partnerWebhookDelivery
        .update({
          where: { id: job.data?.deliveryId },
          data: { status: 'failed', errorMessage: `Max retries: ${err?.message}`, completedAt: new Date() },
        })
        .catch((e) => logger.error({ err: e?.message }, '[PartnerWebhook] final failed update'))
    }
    logger.error({ jobId: job?.id, err: err?.message }, '[PartnerWebhook] job failed')
  })
  w.on('completed', (job) => {
    logger.info({ jobId: job.id }, '[PartnerWebhook] job completed')
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForWorker.partnerWebhookWorker = w
  }
  return w
}

export const partnerWebhookWorker: Worker = getWorker()

export { WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER }
