import { describe, expect, it, afterEach, vi } from 'vitest'

import {
  buildEvolutionWebhookUrl,
  getEvolutionWebhookToken,
  verifyEvolutionWebhookToken,
} from '@/lib/evolution-instances'

const ORIG_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIG_ENV }
})

describe('getEvolutionWebhookToken', () => {
  it('es determinista: mismo secreto + instancia → mismo token', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    const a = getEvolutionWebhookToken('negocio_abc123')
    const b = getEvolutionWebhookToken('negocio_abc123')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('distingue instancias distintas', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    expect(getEvolutionWebhookToken('instancia_a')).not.toBe(getEvolutionWebhookToken('instancia_b'))
  })

  it('cambia si cambia el secreto', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-1'
    const before = getEvolutionWebhookToken('mi-instancia')
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-2'
    const after = getEvolutionWebhookToken('mi-instancia')
    expect(before).not.toBe(after)
  })
})

describe('verifyEvolutionWebhookToken', () => {
  it('acepta el token correcto', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    const token = getEvolutionWebhookToken('instancia_x')
    expect(verifyEvolutionWebhookToken('instancia_x', token)).toBe(true)
  })

  it('rechaza token incorrecto', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    expect(verifyEvolutionWebhookToken('instancia_x', 'token-falso')).toBe(false)
  })

  it('rechaza token de otra instancia', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    const tokenDeOtra = getEvolutionWebhookToken('instancia_y')
    expect(verifyEvolutionWebhookToken('instancia_x', tokenDeOtra)).toBe(false)
  })

  it('rechaza token ausente o vacío', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    expect(verifyEvolutionWebhookToken('instancia_x', null)).toBe(false)
    expect(verifyEvolutionWebhookToken('instancia_x', undefined)).toBe(false)
    expect(verifyEvolutionWebhookToken('instancia_x', '')).toBe(false)
  })

  it('rechaza token con longitud distinta (evita errores de timingSafeEqual)', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    expect(verifyEvolutionWebhookToken('instancia_x', 'abc')).toBe(false)
  })
})

describe('buildEvolutionWebhookUrl', () => {
  it('incluye el token firmado como query param', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    process.env.NEXTAUTH_URL = 'https://volkern.app'
    const url = buildEvolutionWebhookUrl('negocio_abc123')
    expect(url).toMatch(/^https:\/\/volkern\.app\/api\/webhook\/evolution\/negocio_abc123\?token=/)
    const token = url.split('token=')[1]
    expect(verifyEvolutionWebhookToken('negocio_abc123', token)).toBe(true)
  })

  it('escapa caracteres especiales del nombre de instancia', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secreto-compartido-test'
    process.env.NEXTAUTH_URL = 'https://volkern.app'
    const url = buildEvolutionWebhookUrl('instancia con espacios/y')
    expect(url).not.toContain(' ')
    expect(url).not.toContain('/y')
    const token = decodeURIComponent(url.split('token=')[1])
    expect(verifyEvolutionWebhookToken('instancia con espacios/y', token)).toBe(true)
  })
})