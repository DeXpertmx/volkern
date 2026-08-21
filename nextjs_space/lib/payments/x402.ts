import { NextResponse } from 'next/server'

export const X402_VERSION = 2 as const
export const X402_PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED'
export const X402_PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE'
export const X402_PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE'

export type X402PaymentRequirements = {
  scheme: 'exact'
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  resource: string
  description: string
  mimeType: string
}

export type X402PaymentRequired = {
  x402Version: typeof X402_VERSION
  accepts: X402PaymentRequirements[]
  error?: string
}

type X402Config = {
  facilitatorUrl: string
  payTo: string
  network: string
  asset: string
  amount: string
  description: string
  maxTimeoutSeconds: number
}

const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator'
const DEFAULT_NETWORK = 'eip155:84532'
const DEFAULT_ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

function readConfig(): X402Config | null {
  const payTo = process.env.X402_PAY_TO?.trim()
  if (!payTo) return null

  return {
    facilitatorUrl: (process.env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR_URL).replace(/\/$/, ''),
    payTo,
    network: process.env.X402_NETWORK || DEFAULT_NETWORK,
    asset: process.env.X402_ASSET || DEFAULT_ASSET,
    amount: process.env.X402_AMOUNT || '10000',
    description: process.env.X402_DESCRIPTION || 'Acceso a búsqueda pública de Volkern',
    maxTimeoutSeconds: Number(process.env.X402_MAX_TIMEOUT_SECONDS || 300),
  }
}

export function isX402Configured(): boolean {
  return readConfig() !== null
}

export function encodeX402(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

export function decodeX402<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T
}

export function buildX402PaymentRequired(resource: string): X402PaymentRequired | null {
  const config = readConfig()
  if (!config) return null

  return {
    x402Version: X402_VERSION,
    accepts: [{
      scheme: 'exact',
      network: config.network,
      asset: config.asset,
      amount: config.amount,
      payTo: config.payTo,
      maxTimeoutSeconds: config.maxTimeoutSeconds,
      resource,
      description: config.description,
      mimeType: 'application/json',
    }],
  }
}

function paymentRequiredResponse(resource: string, error?: string): NextResponse {
  const requirements = buildX402PaymentRequired(resource)
  if (!requirements) {
    return NextResponse.json(
      { error: 'x402 no está configurado para este entorno' },
      { status: 503 },
    )
  }

  if (error) requirements.error = error
  const response = NextResponse.json(requirements, { status: 402 })
  response.headers.set(X402_PAYMENT_REQUIRED_HEADER, encodeX402(requirements))
  response.headers.set('Access-Control-Expose-Headers', X402_PAYMENT_REQUIRED_HEADER)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function facilitatorUrl(base: string, operation: 'verify' | 'settle'): string {
  return `${base}/${operation}`
}

async function facilitatorCall(
  operation: 'verify' | 'settle',
  config: X402Config,
  payload: unknown,
  requirements: X402PaymentRequirements,
): Promise<Record<string, unknown>> {
  const response = await fetch(facilitatorUrl(config.facilitatorUrl, operation), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: X402_VERSION,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }),
    signal: AbortSignal.timeout(5000),
  })

  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(`x402 facilitator ${operation} respondió HTTP ${response.status}`)
  }
  return body
}

/**
 * Wraps an App Router handler with x402 verification and settlement.
 *
 * It deliberately settles only after a successful handler response. This keeps
 * failed application requests from charging the caller.
 */
export function withX402<T = unknown>(
  handler: (request: Request) => Promise<NextResponse<T>>,
  options?: { resource?: string },
): (request: Request) => Promise<NextResponse<T> | NextResponse> {
  return async (request) => {
    const config = readConfig()
    const resource = options?.resource || request.url
    if (!config) return paymentRequiredResponse(resource)

    const required = buildX402PaymentRequired(resource)
    if (!required) return paymentRequiredResponse(resource)
    const requirements = required.accepts[0]
    const signature = request.headers.get(X402_PAYMENT_SIGNATURE_HEADER)
    if (!signature) return paymentRequiredResponse(resource)

    let payload: unknown
    try {
      payload = decodeX402(signature)
    } catch {
      return paymentRequiredResponse(resource, 'PAYMENT-SIGNATURE no es base64 JSON válido')
    }

    try {
      const verification = await facilitatorCall('verify', config, payload, requirements)
      if (verification.isValid !== true) {
        return paymentRequiredResponse(resource, 'El pago no pudo verificarse')
      }

      const response = await handler(request)
      if (response.status >= 400) return response

      const settlement = await facilitatorCall('settle', config, payload, requirements)
      if (settlement.success !== true) {
        return paymentRequiredResponse(resource, 'El pago no pudo liquidarse')
      }
      response.headers.set(X402_PAYMENT_RESPONSE_HEADER, encodeX402(settlement))
      response.headers.set('Access-Control-Expose-Headers', X402_PAYMENT_RESPONSE_HEADER)
      return response
    } catch (error) {
      console.error('[x402] Error procesando pago:', error)
      return paymentRequiredResponse(resource, 'No se pudo procesar el pago')
    }
  }
}
