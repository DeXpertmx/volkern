import { describe, expect, it } from 'vitest'
import { openApiV1Document } from '@/lib/open-api-v1'

describe('MPP payment discovery en OpenAPI', () => {
  it('publica x-service-info con categorías y documentación', () => {
    const document = openApiV1Document as any

    expect(document['x-service-info']?.categories).toEqual(['commerce', 'invoicing', 'developer-tools'])
    expect(document['x-service-info']?.docs?.apiReference).toBe('https://volkern.app/docs/developers')
    expect(document['x-service-info']?.docs?.llms).toBe('https://volkern.app/auth.md')
  })

  it('anota la operación payable con una oferta MPP dinámica y respuesta 402', () => {
    const operation = (openApiV1Document as any).paths['/v1/invoices'].post
    const paymentInfo = operation['x-payment-info']

    expect(paymentInfo.offers).toHaveLength(1)
    expect(paymentInfo.offers[0]).toEqual({
      intent: 'charge',
      method: 'stripe',
      amount: null,
      currency: 'eur',
      description: 'Importe dinámico según la factura solicitada.',
    })
    expect(operation.responses['402'].description).toBe('Payment Required')
  })

  it('mantiene la forma OpenAPI requerida para descubrimiento', () => {
    const document = openApiV1Document as any

    expect(document.openapi).toMatch(/^3\./)
    expect(typeof document.info?.title).toBe('string')
    expect(typeof document.info?.version).toBe('string')
    expect(Object.keys(document.paths)).toContain('/v1/invoices')
  })
})
