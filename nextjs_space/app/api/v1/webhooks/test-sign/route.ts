/**
 * POST /api/v1/webhooks/test-sign
 *
 * Endpoint server-side que firma un payload con HMAC-SHA256 y lo envía al
 * endpoint del partner en nombre del usuario. Se usa desde el botón "Vía
 * Volkern (proxy)" en /docs/developers para que integradores puedan
 * validar el contrato sin tener que ejecutar cURL.
 *
 * Seguridad:
 *  - El `secret` llega en el body, se usa SOLO para firmar esa única
 *    request y NO se persiste ni se loggea (ni en texto plano ni hasheado).
 *  - Anti-SSRF: `validateWebhookUrl` rechaza file:/data:/javascript:/IP
 *    privadas (10.0.0.0/8, 192.168/16, 169.254/16, etc.).
 *  - Rate-limit: 20 reqs / hora / IP via Redis (singleton globalThis + Lua
 *    script para INCR+EXPIRE atómico por bucket horario; fail-open si Redis
 *    está caído para no tomar el endpoint completo como punto único de failure).
 *  - Timeout: 10s por request con AbortSignal.
 *  - Cap de response body: 4KB.
 *
 * NO requiere autenticación porque la página /docs/developers es pública
 * para integradores. La política de rate-limit + anti-SSRF mitiga abuso.
 */

import { NextResponse } from 'next/server';
import IORedis, { Redis as IORedisType } from 'ioredis';
import { logger } from '@/lib/logger';
import {
  hmacSignPayload,
  validateWebhookUrl,
} from '@/lib/developer-console';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Rate limit (Redis-backed; globalThis singleton; Lua atomic) ──────────
//
// Usa dedicated client (separado del de partner-webhook-queue.ts) con:
//   - maxRetriesPerRequest: 2  → fail fast (no extender la latency del endpoint)
//   - connectTimeout: 5_000    → corta si Redis está inalcanzable en 5s
//   - commandTimeout: 2_000    → cada comando máximo 2s
//
// Atomicidad INCR+EXPIRE vía Lua script: evita el caso patológico donde INCR
// crea la key y el EXPIRE nunca corre (e.g., crash entre comandos), dejando
// la key sin TTL y un leak permanente en Redis.
const RATE_LIMIT_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;
const WINDOW_SECONDS = Math.ceil(WINDOW_MS / 1000);

const globalForTestSign = globalThis as unknown as {
  testSignRedis?: IORedisType
  lastWarnedRedisDownAt?: number  // throttle del logger.warn cuando Redis está caído
}

function getTestSignRedis(): IORedisType {
  if (globalForTestSign.testSignRedis) return globalForTestSign.testSignRedis
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || 'redis://127.0.0.1:6379'
  const client = new IORedis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    commandTimeout: 2_000,
    enableReadyCheck: true,
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForTestSign.testSignRedis = client
  }
  return client
}

const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`.trim()

function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number; remaining: number }> {
  // Bucket horario basado en server time UTC. Limita el peor caso a ~40/h
  // instantáneos en el boundary hour-rollover (teórico, no mitigable sin
  // sorted sets; aceptable para Webhook Tester público).
  const hourBucket = Math.floor(Date.now() / WINDOW_MS)
  const key = `wt-proxy:${ip}:${hourBucket}`

  try {
    const redis = getTestSignRedis()
    const count = (await redis.eval(RATE_LIMIT_LUA, 1, key, WINDOW_SECONDS)) as number

    if (count > RATE_LIMIT_PER_HOUR) {
      const nextBucketStart = (hourBucket + 1) * WINDOW_MS
      const retryAfter = Math.max(1, Math.ceil((nextBucketStart - Date.now()) / 1000))
      // Log spam mitigation: solo warn en el PRIMER hit del cap por IP/hora
      // (count === RATE_LIMIT_PER_HOUR + 1 = la 21ª request). Requests 22, 23...
      // no emiten warn; el header 429 sigue siendo informativo para el cliente.
      if (count === RATE_LIMIT_PER_HOUR + 1) {
        logger.warn(
          { ip, count, limit: RATE_LIMIT_PER_HOUR, retryAfter },
          '[test-sign] rate-limit exceeded (429 de ahora en adelante hasta el próximo bucket)',
        )
      }
      return { allowed: false, retryAfter, remaining: 0 }
    }

    return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - count }
  } catch (err: any) {
    // FAIL-OPEN: si Redis está caído, dejamos pasar la request y solo loggeamos.
    // El endpoint ya tiene anti-SSRF (validateWebhookUrl), payload cap 64KB y
    // AbortSignal.timeout 10s downstream. Tomar Redis como punto único de
    // failure para una página de docs sería desproporcionado.
    //
    // Throttle del logger.warn: Redis caído + 1000 RPS = 1000 líneas/seg en el
    // observability stack (coste Datadog/Logtail + I/O). Cooldown 60s en
    // globalThis (sobrevive HMR, scoped a este lambda instance).
    const WARN_COOLDOWN_MS = 60_000
    const now = Date.now()
    const lastWarned = globalForTestSign.lastWarnedRedisDownAt ?? 0
    if (now - lastWarned > WARN_COOLDOWN_MS) {
      logger.warn(
        { ip, err: err?.message ?? String(err) },
        '[test-sign] Redis inalcanzable, fail-open rate-limit (warning throttled a 1/min)',
      )
      globalForTestSign.lastWarnedRedisDownAt = now
    }
    return { allowed: true, remaining: RATE_LIMIT_PER_HOUR }
  }
}

// ─── Handler ─────────────────────────────────────────────────────────

interface RequestBody {
  url?: string;
  secret?: string;
  eventType?: string;
  payload?: string | Record<string, unknown>;
  timestamp?: string | number;
}

const RESPONSE_BODY_CAP = 4096;
const PAYLOAD_REQUEST_CAP = 64 * 1024; // 64 KB cap en el body que el tester envía.

export async function POST(request: Request) {
  // Rate limit primero —> no procesamos bodies de abusadores.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit excedido', retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      },
    );
  }

  // Parsear body
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: 'Body inválido (esperado JSON)' },
      { status: 400, headers: rateHeaders(rl.remaining) },
    );
  }

  const { url, secret, eventType, payload, timestamp } = body;

  // Validaciones
  if (!url || typeof url !== 'string') {
    return NextResponse.json(
      { error: 'Falta url' },
      { status: 400, headers: rateHeaders(rl.remaining) },
    );
  }
  // 32 chars = 32 bytes = exactamente el tamaño que crypto.subtle.importKey
  // 'raw' espera para HMAC-SHA256. Validamos en server y client por paridad.
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    return NextResponse.json(
      { error: 'Falta secret o es demasiado corto (mínimo 32 chars)' },
      { status: 400, headers: rateHeaders(rl.remaining) },
    );
  }
  if (!eventType || typeof eventType !== 'string') {
    return NextResponse.json(
      { error: 'Falta eventType' },
      { status: 400, headers: rateHeaders(rl.remaining) },
    );
  }
  if (payload === undefined || payload === null) {
    return NextResponse.json(
      { error: 'Falta payload' },
      { status: 400, headers: rateHeaders(rl.remaining) },
    );
  }

  const urlErr = validateWebhookUrl(url);
  if (urlErr) {
    return NextResponse.json(
      { error: `Webhook URL inválida: ${urlErr}` },
      { status: 400, headers: rateHeaders(rl.remaining) },
    );
  }

  // Firmar
  const payloadString =
    typeof payload === 'string' ? payload : JSON.stringify(payload);

  // Cap defensivo: un payload > 64KB saturaría al partner y abre DoS.
  if (payloadString.length > PAYLOAD_REQUEST_CAP) {
    return NextResponse.json(
      {
        error: `Payload demasiado grande (${payloadString.length} bytes; límite ${PAYLOAD_REQUEST_CAP})`,
      },
      { status: 413, headers: rateHeaders(rl.remaining) },
    );
  }

  const ts =
    (timestamp && String(timestamp)) ||
    Math.floor(Date.now() / 1000).toString();
  const signature = hmacSignPayload(payloadString, secret, ts);

  // Enviar al endpoint del partner con timeout duro.
  const startedAt = Date.now();
  let responseStatus = 0;
  let responseBody = '';
  const responseHeaders: Record<string, string> = {};
  let errorMessage: string | null = null;
  let successFlag = false;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Volkern-Signature': signature,
        'X-Volkern-Timestamp': ts,
        'X-Volkern-Event': eventType,
        'User-Agent': 'Volkern-Webhook/1.0 (+docs/developers Tester)',
      },
      body: payloadString,
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    responseStatus = r.status;
    const text = await r.text();
    responseBody = text.slice(0, RESPONSE_BODY_CAP);
    r.headers.forEach((v, k) => {
      if (responseHeaders[k] === undefined) responseHeaders[k] = v;
    });
    successFlag = responseStatus >= 200 && responseStatus < 300;
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      errorMessage = `Timeout (10s) conectando con ${url}`;
    } else {
      errorMessage = e?.message ?? String(e);
    }
  }

  const durationMs = Date.now() - startedAt;

  return NextResponse.json(
    {
      success: successFlag,
      durationMs,
      requestSignature: signature,
      requestTimestamp: ts,
      requestHeaders: {
        'X-Volkern-Signature': signature,
        'X-Volkern-Timestamp': ts,
        'X-Volkern-Event': eventType,
        'Content-Type': 'application/json',
      },
      responseStatus: responseStatus || null,
      responseBody,
      responseHeaders,
      errorMessage,
      responseTruncated: responseBody.length >= RESPONSE_BODY_CAP,
    },
    { headers: rateHeaders(rl.remaining) },
  );
}

function rateHeaders(remaining: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_PER_HOUR),
    'X-RateLimit-Remaining': String(remaining),
  };
}
