import { createHash, createPublicKey, createPrivateKey, generateKeyPairSync, sign } from 'crypto'

/**
 * Web Bot Auth (IETF WebBotAuth WG) — identidad criptográfica de Volkern
 * como bot/agente.
 *
 * - El directorio de claves se sirve en /.well-known/http-message-signatures-directory
 *   con el JWKS de la clave pública Ed25519 de Volkern.
 * - Las requests salientes de bots/agentes se firman con HTTP Message
 *   Signatures (RFC 9421) y los headers Signature-Agent / Signature-Input.
 *
 * La clave privada NO está en el repo: se inyecta en el VPS por env
 * (WEB_BOT_AUTH_PRIVATE_KEY_PEM, PEM base64url). La pública embebida
 * corresponde al par generado para producción.
 */
export const WEB_BOT_AUTH_KEYID = 'g-iXdr60e-pXKRo-HrqpaiSBVNoRqrqnGTfwmQVve_M'
export const WEB_BOT_AUTH_PUBLIC_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'EJXU2PtCI8WPCmRAaMFtUV0mxtKexJUGQ22XOfmBT3Y',
}

/** JWKS servido en el directorio */
export function webBotAuthJwks(): { keys: unknown[] } {
  return { keys: [{ ...WEB_BOT_AUTH_PUBLIC_JWK, kid: WEB_BOT_AUTH_KEYID }] }
}

/** Carga la clave privada del env (PEM en base64url) o null si no está configurada */
export function getWebBotAuthPrivateKey(): string | null {
  const b64 = process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
  if (!b64) return null
  try {
    return Buffer.from(b64, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

/**
 * Firma un mensaje HTTP con HTTP Message Signatures (RFC 9421) en el
 * formato Web Bot Auth (tag=web-bot-auth). Devuelve los headers
 * Signature, Signature-Input y Signature-Agent listos para añadir.
 *
 * Componentes firmados: "@authority" y "signature-agent" (los que exige
 * Cloudflare). La validez es corta (60s) para reducir replay.
 */
export function signWebBotAuthRequest(opts: {
  authority: string
  signatureAgent: string
  method: string
  targetPath: string
  now?: number
}): {
  signature: string
  signatureInput: string
  signatureAgent: string
  keyId: string
} | null {
  const pem = getWebBotAuthPrivateKey()
  if (!pem) return null

  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const expires = now + 60
  const nonce = createHash('sha256').update(`${now}:${opts.authority}:${Math.random()}`).digest('base64url')

  // Componentes a firmar según RFC 9421 (solo ASCII)
  const signatureAgentValue = `"${opts.signatureAgent}"`
  const authorityLine = `"@authority": ${JSON.stringify(opts.authority)}`
  const sigAgentLine = `"signature-agent": ${JSON.stringify(signatureAgentValue)}`

  const signatureBase = `"@authority": ${JSON.stringify(opts.authority)}\n"signature-agent": ${JSON.stringify(signatureAgentValue)}`

  const sigInput = `sig1=("${'@authority'}" "${'signature-agent'}")\n;created=${now}\n;expires=${expires}\n;keyid="${WEB_BOT_AUTH_KEYID}"\n;alg="ed25519"\n;nonce="${nonce}"\n;tag="web-bot-auth"`

  const sigInputHeader = `sig1=("@authority" "signature-agent");created=${now};expires=${expires};keyid="${WEB_BOT_AUTH_KEYID}";alg="ed25519";nonce="${nonce}";tag="web-bot-auth"`

  // Base del mensaje: componentes en orden de aparición en signature-params
  const signingInput = `"@authority": ${JSON.stringify(opts.authority)}\n"signature-agent": ${JSON.stringify(signatureAgentValue)}\n"@signature-params": ${JSON.stringify(`sig1=("@authority" "signature-agent");created=${now};expires=${expires};keyid="${WEB_BOT_AUTH_KEYID}";alg="ed25519";nonce="${nonce}";tag="web-bot-auth"`)}`

  try {
    const key = createPrivateKey(pem)
    const sig = sign(null, Buffer.from(signingInput, 'utf8'), key)
    return {
      signature: `sig1=:${sig.toString('base64url')}:`,
      signatureInput: sigInputHeader,
      signatureAgent: signatureAgentValue,
      keyId: WEB_BOT_AUTH_KEYID,
    }
  } catch (e) {
    console.error('[web-bot-auth] Error firmando request:', e)
    return null
  }
}

/** Genera un par de claves Ed25519 (útil para rotación/dev) */
export function generateWebBotAuthKeyPair(): { privatePem: string; publicJwk: unknown } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const exported = privateKey.export({ type: 'pkcs8', format: 'pem' })
  return {
    privatePem: typeof exported === 'string' ? exported : exported.toString('utf8'),
    publicJwk: publicKey.export({ format: 'jwk' }),
  }
}

/** Verifica la clave pública contra el JWKS publicado (test de coherencia) */
export function verifyWebBotAuthPublicKey(): boolean {
  try {
    const key = createPublicKey({ key: WEB_BOT_AUTH_PUBLIC_JWK, format: 'jwk' })
    return key.type === 'public'
  } catch {
    return false
  }
}
