import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import {
  buildX402PaymentRequired,
  decodeX402,
  encodeX402,
  withX402,
} from '@/lib/payments/x402'
import { openApiV1Document } from '@/lib/open-api-v1'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('x402 payment middleware', () => {
  it('does not advertise a payment destination until configured', () => {
    vi.stubEnv('X402_PAY_TO', '')
    expect(buildX402PaymentRequired('https://volkern.app/api/public/paid-search')).toBeNull()
  })

  it('creates a v2 PaymentRequired challenge with the configured wallet', () => {
    vi.stubEnv('X402_PAY_TO', '0x1111111111111111111111111111111111111111')
    const challenge = buildX402PaymentRequired('https://volkern.app/api/public/paid-search')

    expect(challenge).toMatchObject({
      x402Version: 2,
      accepts: [{
        scheme: 'exact',
        network: 'eip155:84532',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        amount: '10000',
        payTo: '0x1111111111111111111111111111111111111111',
      }],
    })
  })

  it('returns HTTP 402 and PAYMENT-REQUIRED when no signature is sent', async () => {
    vi.stubEnv('X402_PAY_TO', '0x1111111111111111111111111111111111111111')
    const handler = withX402(async () => NextResponse.json({ ok: true }))
    const response = await handler(new Request('https://volkern.app/api/public/paid-search?q=crm'))
    const encoded = response.headers.get('PAYMENT-REQUIRED')

    expect(response.status).toBe(402)
    expect(encoded).toBeTruthy()
    expect(decodeX402(encoded!)).toMatchObject({ x402Version: 2, accepts: [{ scheme: 'exact' }] })
  })

  it('verifies and settles through the facilitator before returning data', async () => {
    vi.stubEnv('X402_PAY_TO', '0x1111111111111111111111111111111111111111')
    vi.stubEnv('X402_FACILITATOR_URL', 'https://facilitator.test')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ isValid: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, transaction: '0xabc' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const handler = withX402(async () => NextResponse.json({ ok: true }))
    const request = new Request('https://volkern.app/api/public/paid-search?q=crm', {
      headers: { 'PAYMENT-SIGNATURE': encodeX402({ x402Version: 2, payload: 'signed-payment' }) },
    })
    const response = await handler(request)

    expect(response.status).toBe(200)
    expect(decodeX402(response.headers.get('PAYMENT-RESPONSE')!)).toMatchObject({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://facilitator.test/verify')
    expect(fetchMock.mock.calls[1][0]).toBe('https://facilitator.test/settle')
  })

  it('does not settle or charge when the application handler fails', async () => {
    vi.stubEnv('X402_PAY_TO', '0x1111111111111111111111111111111111111111')
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ isValid: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const handler = withX402(async () => NextResponse.json({ error: 'bad request' }, { status: 400 }))
    const request = new Request('https://volkern.app/api/public/paid-search?q=crm', {
      headers: { 'PAYMENT-SIGNATURE': encodeX402({ x402Version: 2, payload: 'signed-payment' }) },
    })
    const response = await handler(request)

    expect(response.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('x402 OpenAPI discovery', () => {
  it('documents a real payable endpoint and HTTP 402 response', () => {
    const operation = (openApiV1Document as any).paths['/api/public/paid-search'].get
    expect(operation['x-payment-info']).toMatchObject({
      offers: [{ protocol: 'x402', intent: 'charge', amount: '10000' }],
    })
    expect(operation.responses['402']).toBeTruthy()
    expect(operation.responses['402'].headers['PAYMENT-REQUIRED']).toBeTruthy()
  })
})
