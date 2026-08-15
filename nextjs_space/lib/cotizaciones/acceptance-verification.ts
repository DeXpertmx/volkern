import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export type AcceptanceChannel = 'email' | 'whatsapp'

export function generateAcceptanceCode(): string {
  return String(randomInt(100000, 1000000))
}

export function generateChallengeToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashAcceptanceSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function matchesAcceptanceSecret(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashAcceptanceSecret(value), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.trim().split('@')
  if (!localPart || !domain) return 'email registrado'
  const visible = localPart.length <= 2 ? localPart[0] : localPart.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(2, localPart.length - visible.length))}@${domain}`
}

export function maskPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, '')
  if (normalized.length < 4) return 'teléfono registrado'
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`
}

export function isValidAcceptanceDestination(channel: AcceptanceChannel, value: string | null | undefined): value is string {
  if (!value?.trim()) return false
  if (channel === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  return value.replace(/\D/g, '').length >= 8
}
