// @vitest-environment node
/**
 * Status HTTP de `/api/mcp/approvals/[id]/verify-code`.
 *
 * La ruta elegía el status por subcadena del mensaje: como «Código incorrecto.
 * Te quedan 2 intento(s)» contiene «intento», un código erróneo respondía 429.
 * Ahora la verificación devuelve un `motivo` tipado y la ruta lo traduce, sin
 * mirar el texto.
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ verify: vi.fn() }))

vi.mock('@/lib/mcp/whatsapp-auth', () => ({
  verifyAndExecuteWhatsappAuthCode: h.verify,
}))

import { POST } from '@/app/api/mcp/approvals/[id]/verify-code/route'

const TOKEN = 'a'.repeat(48)

function peticion(code: unknown = '123456') {
  return new NextRequest(`http://localhost/api/mcp/approvals/${TOKEN}/verify-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
}

async function verificar(code: unknown = '123456') {
  const res = await POST(peticion(code), { params: Promise.resolve({ id: TOKEN }) })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.verify.mockResolvedValue({
    ok: true,
    approved: true,
    executed: true,
    approvalId: 'ap-1',
    result: { enviado: true },
  })
})

describe('verify-code — status según el motivo', () => {
  it('código incorrecto responde 400 aunque el mensaje mencione «intento»', async () => {
    h.verify.mockResolvedValueOnce({
      ok: false,
      approved: false,
      executed: false,
      error: 'Código incorrecto. Te quedan 2 intento(s).',
      motivo: 'codigo_incorrecto',
      approvalId: 'ap-1',
    })

    const { status, body } = await verificar('000000')

    expect(status).toBe(400)
    expect(body.motivo).toBe('codigo_incorrecto')
    expect(body.error).toContain('intento')
  })

  it('código caducado responde 410', async () => {
    h.verify.mockResolvedValueOnce({
      ok: false,
      approved: false,
      executed: false,
      error: 'El código de autorización expiró.',
      motivo: 'codigo_caducado',
      approvalId: 'ap-1',
    })

    const { status, body } = await verificar()

    expect(status).toBe(410)
    expect(body.motivo).toBe('codigo_caducado')
  })

  it('intentos agotados responde 429', async () => {
    h.verify.mockResolvedValueOnce({
      ok: false,
      approved: false,
      executed: false,
      error: 'Demasiados intentos fallidos. La solicitud caducó.',
      motivo: 'intentos_agotados',
      approvalId: 'ap-1',
    })

    const { status } = await verificar()

    expect(status).toBe(429)
  })

  it('envío fallido y solicitud ya resuelta responden 400', async () => {
    h.verify.mockResolvedValueOnce({
      ok: false,
      approved: true,
      executed: false,
      error: 'Evolution caída',
      motivo: 'envio_fallido',
      approvalId: 'ap-1',
    })
    expect((await verificar()).status).toBe(400)

    h.verify.mockResolvedValueOnce({
      ok: false,
      approved: false,
      executed: false,
      error: 'La solicitud ya fue approved y no se puede modificar.',
      motivo: 'ya_resuelta',
      approvalId: 'ap-1',
    })
    expect((await verificar()).status).toBe(400)
  })

  it('un resultado sin motivo sigue siendo 400', async () => {
    h.verify.mockResolvedValueOnce({
      ok: false,
      approved: false,
      executed: false,
      error: 'algo raro',
    })

    expect((await verificar()).status).toBe(400)
  })

  it('falta el código: 400 sin llamar a la verificación', async () => {
    const { status } = await verificar('')

    expect(status).toBe(400)
    expect(h.verify).not.toHaveBeenCalled()
  })

  it('verificación correcta responde 200', async () => {
    const { status, body } = await verificar()

    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, executed: true, approvalId: 'ap-1' })
  })
})
