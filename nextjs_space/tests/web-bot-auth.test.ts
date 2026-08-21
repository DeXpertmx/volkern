import { describe, expect, it } from 'vitest'
import {
  WEB_BOT_AUTH_KEYID,
  webBotAuthJwks,
  signWebBotAuthRequest,
  verifyWebBotAuthPublicKey,
} from '@/lib/seo/web-bot-auth'

describe('/.well-known/http-message-signatures-directory (Web Bot Auth)', () => {
  it('sirve el directorio con HTTP 200 y el Content-Type del draft', async () => {
    const { GET } = await import('@/app/.well-known/http-message-signatures-directory/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect((res.headers.get('content-type') || '')).toContain(
      'application/http-message-signatures-directory+json'
    )
  })

  it('el JWKS contiene al menos una clave pública', async () => {
    const { GET } = await import('@/app/.well-known/http-message-signatures-directory/route')
    const body = await (await GET()).json()
    expect(Array.isArray(body.keys)).toBe(true)
    expect(body.keys.length).toBeGreaterThanOrEqual(1)
    for (const key of body.keys) {
      expect(key.kty).toBeTruthy()
      // Nunca exponer la clave privada
      expect(key.d).toBeUndefined()
    }
  })

  it('la clave es Ed25519 (OKP) con x presente y kid igual al thumbprint', async () => {
    const jwks = webBotAuthJwks()
    const key = jwks.keys[0] as any
    expect(key.kty).toBe('OKP')
    expect(key.crv).toBe('Ed25519')
    expect(typeof key.x).toBe('string')
    expect(key.x.length).toBeGreaterThan(20)
    expect(key.kid).toBe(WEB_BOT_AUTH_KEYID)
  })

  it('la clave pública embebida es verificable (coherencia del par)', () => {
    expect(verifyWebBotAuthPublicKey()).toBe(true)
  })
})

describe('signWebBotAuthRequest (RFC 9421 + Web Bot Auth)', () => {
  it('sin clave privada configurada devuelve null (no firma)', () => {
    const prev = process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
    delete process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
    try {
      const result = signWebBotAuthRequest({
        authority: 'volkern.app',
        signatureAgent: 'https://volkern.app/.well-known/http-message-signatures-directory',
        method: 'GET',
        targetPath: '/',
      })
      expect(result).toBeNull()
    } finally {
      if (prev !== undefined) process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM = prev
    }
  })

  it('con la clave privada genera Signature, Signature-Input y Signature-Agent', () => {
    const privatePem = Buffer.from(
      'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSU55WTFWZTZjVWVJL28vdEo2eEJKTGwvdFZOSUdzdlV1UjJlVEk1RW50eDgKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo=',
      'base64'
    ).toString('utf8')
    const prev = process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
    process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM = Buffer.from(privatePem).toString('base64url')
    try {
      const result = signWebBotAuthRequest({
        authority: 'volkern.app',
        signatureAgent: 'https://volkern.app/.well-known/http-message-signatures-directory',
        method: 'GET',
        targetPath: '/',
        now: 1750000000,
      })
      expect(result).not.toBeNull()
      expect(result!.signature).toMatch(/^sig1=:/)
      expect(result!.signatureInput).toContain('tag="web-bot-auth"')
      expect(result!.signatureInput).toContain('keyid="' + WEB_BOT_AUTH_KEYID + '"')
      expect(result!.signatureInput).toContain('alg="ed25519"')
      expect(result!.signatureInput).toContain('("@authority" "signature-agent")')
      expect(result!.signatureAgent).toBe('"https://volkern.app/.well-known/http-message-signatures-directory"')
    } finally {
      if (prev !== undefined) process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM = prev
      else delete process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
    }
  })
})
