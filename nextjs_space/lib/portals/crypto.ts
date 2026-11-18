/**
 * Cifrado de credenciales de portal (AES-256-GCM).
 *
 * Por qué no `CryptoService`: aquel usa AES-256-CBC con una clave por defecto
 * embebida cuando falta `FISCAL_ENCRYPTION_KEY`. Aquí el fallo es cerrado: sin
 * `PORTAL_ENCRYPTION_KEY` válida no se cifra ni se descifra nada, y la API
 * responde con un error claro en vez de guardar credenciales con una clave
 * pública conocida.
 *
 * La clave debe ser de 32 bytes, en hex (64 caracteres) o base64 (44). El
 * formato guardado es `v1:<iv hex>:<tag hex>:<cipher hex>`.
 */

import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'
const IV_BYTES = 12

export class PortalCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortalCryptoError'
  }
}

function keyFromEnv(): Buffer {
  const raw = (process.env.PORTAL_ENCRYPTION_KEY || '').trim()
  if (!raw) {
    throw new PortalCryptoError(
      'PORTAL_ENCRYPTION_KEY no está configurada: no se pueden cifrar credenciales de portal.'
    )
  }

  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }

  if (key.length !== 32) {
    throw new PortalCryptoError(
      'PORTAL_ENCRYPTION_KEY debe ser de 32 bytes (64 caracteres hex o 44 en base64).'
    )
  }
  return key
}

/** `true` si hay una clave válida: la API lo usa para no ofrecer guardar credenciales. */
export function isPortalCryptoConfigured(): boolean {
  try {
    keyFromEnv()
    return true
  } catch {
    return false
  }
}

export function encryptPortalCredentials(plain: Record<string, unknown>): string {
  const key = keyFromEnv()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(plain), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decryptPortalCredentials(encryptedText: string): Record<string, string> {
  const key = keyFromEnv()
  const parts = encryptedText.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new PortalCryptoError('Credenciales de portal con formato desconocido.')
  }

  const [, ivHex, tagHex, dataHex] = parts
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))

  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8')
    const parsed = JSON.parse(decrypted)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new PortalCryptoError('Credenciales de portal corruptas.')
    }
    return parsed as Record<string, string>
  } catch (err) {
    if (err instanceof PortalCryptoError) throw err
    // No se propaga el mensaje original: podría incluir fragmentos del secreto.
    throw new PortalCryptoError('No se pudieron descifrar las credenciales de portal.')
  }
}
