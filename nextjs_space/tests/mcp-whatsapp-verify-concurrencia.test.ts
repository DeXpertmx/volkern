// @vitest-environment node
/**
 * Verificación del código de WhatsApp bajo concurrencia.
 *
 * `verifyAndExecuteWhatsappAuthCode` reclama la solicitud con `SELECT … FOR
 * UPDATE` y valida el código dentro de la misma transacción. Antes, dos
 * peticiones simultáneas con el código correcto leían la fila como pendiente,
 * ambas comparaban el código y ambas ejecutaban `volkern_send_whatsapp`: el
 * mismo mensaje salía dos veces.
 *
 * La solicitud reclamada es el recibo: el paso a `approved` solo puede ganarlo
 * una petición y el envío ocurre después, una única vez. El doble de Prisma
 * serializa `$transaction` como lo haría el bloqueo de fila de Postgres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fila: null as any,
  handleCallTool: vi.fn(),
  /** Cola que emula el `FOR UPDATE`: una transacción cada vez. */
  colaLock: Promise.resolve() as Promise<unknown>,
}))

vi.mock('@/lib/evolution-instances', () => ({ sendMessageWithUserInstance: vi.fn() }))
vi.mock('@/lib/mcp/mcp-handler', () => ({
  handleCallTool: h.handleCallTool,
  resolveSkillName: (name: string) => name,
}))

vi.mock('@/lib/db', () => {
  const aplicar = (data: Record<string, any>) => {
    for (const [clave, valor] of Object.entries(data)) {
      if (valor && typeof valor === 'object' && 'increment' in valor) {
        h.fila[clave] = (h.fila[clave] ?? 0) + valor.increment
      } else {
        h.fila[clave] = valor
      }
    }
    return { ...h.fila }
  }

  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, token: string) =>
      h.fila.whatsappVerificationToken === token ? [{ ...h.fila }] : [],
    mcpApprovalRequest: { update: async ({ data }: any) => aplicar(data) },
  }

  const $transaction = async (cb: any) => {
    const anterior = h.colaLock
    let liberar!: () => void
    h.colaLock = new Promise<void>((resolve) => (liberar = resolve))
    await anterior
    try {
      return await cb(tx)
    } finally {
      liberar()
    }
  }

  const cumple = (where: Record<string, any>) =>
    Object.entries(where).every(([clave, condicion]) => {
      const valor = h.fila[clave] ?? null
      if (condicion && typeof condicion === 'object' && 'lt' in condicion) {
        return valor !== null && new Date(valor).getTime() < new Date(condicion.lt).getTime()
      }
      return valor === condicion
    })

  return {
    prisma: {
      $transaction,
      mcpApprovalRequest: {
        update: async ({ data }: any) => aplicar(data),
        // El barrido de huérfanas usa updateMany; el filtro se evalúa contra la
        // fila única de este doble.
        updateMany: async ({ where, data }: any) => {
          if (!cumple(where)) return { count: 0 }
          aplicar(data)
          return { count: 1 }
        },
      },
    },
  }
})

import { hashAuthCode, verifyAndExecuteWhatsappAuthCode } from '@/lib/mcp/whatsapp-auth'
import { reconciliarAprobacionesHuerfanas } from '@/lib/mcp/approval-reconcile'

const CODIGO = '123456'
const TOKEN = 'a'.repeat(48)

async function filaPendiente(hash: string) {
  return {
    id: 'ap-1',
    tenantId: 'tenant-a',
    toolName: 'volkern_send_whatsapp',
    arguments: { leadId: 'lead-1', message: 'Hola' },
    argumentsHash: 'hash-1',
    requestedById: 'user-solicita',
    status: 'pending',
    whatsappCodeHash: hash,
    whatsappCodeExpiresAt: new Date(Date.now() + 10 * 60_000),
    whatsappCodeAttempts: 0,
    whatsappVerificationToken: TOKEN,
  }
}

function envioOk() {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: true, enviado: true }) }],
    isError: false,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  h.colaLock = Promise.resolve()
  h.fila = await filaPendiente(await hashAuthCode(CODIGO))
  h.handleCallTool.mockResolvedValue(envioOk())
})

describe('verifyAndExecuteWhatsappAuthCode — reclamo, desenlace y reconciliación', () => {
  it('dos verificaciones simultáneas del mismo código envían el WhatsApp UNA vez', async () => {
    const [primera, segunda] = await Promise.all([
      verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO }),
      verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO }),
    ])

    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
    expect([primera, segunda].filter((r) => r.ok)).toHaveLength(1)
    // La perdedora sale antes de contar intento: no gasta el cupo del código.
    expect(h.fila.whatsappCodeAttempts).toBe(1)

    const perdedora = [primera, segunda].find((r) => !r.ok)!
    expect(perdedora.error).toContain('ya fue approved')
    expect(perdedora.motivo).toBe('ya_resuelta')
    expect(perdedora.executed).toBe(false)
    expect(h.fila.status).toBe('executed')
  })

  it('un código incorrecto cuenta el intento y no ejecuta', async () => {
    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: '000000' })

    expect(res.ok).toBe(false)
    expect(res.error).toContain('Código incorrecto')
    expect(res.motivo).toBe('codigo_incorrecto')
    expect(h.fila.whatsappCodeAttempts).toBe(1)
    expect(h.fila.status).toBe('pending')
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('si el envío lanza, la solicitud queda en failed y no se reintenta sola', async () => {
    h.handleCallTool.mockRejectedValueOnce(new Error('Evolution caída'))

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.ok).toBe(false)
    expect(res.executed).toBe(false)
    expect(res.motivo).toBe('envio_fallido')
    expect(h.fila.status).toBe('failed')
    expect(h.fila.result).toMatchObject({ error: 'Evolution caída' })

    // El derecho de ejecución ya se gastó: otro intento no vuelve a enviar.
    const segundo = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(segundo.ok).toBe(false)
    expect(segundo.error).toContain('ya fue failed')
    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
  })

  it('tras una caída entre la reclamación y el desenlace, la reconciliación la cierra como failed', async () => {
    // Estado que deja la transacción si el proceso muere antes de escribir el
    // desenlace: `approved`, sin `executedAt` y reclamada hace rato.
    h.fila.status = 'approved'
    h.fila.resolvedAt = new Date(Date.now() - 30 * 60_000)
    h.fila.executedAt = null

    // Mientras tanto el cliente recibe «ya fue approved» y no se reenvía nada.
    const antes = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(antes.ok).toBe(false)
    expect(antes.error).toContain('ya fue approved')
    expect(h.handleCallTool).not.toHaveBeenCalled()

    const { cerradas } = await reconciliarAprobacionesHuerfanas()

    expect(cerradas).toBe(1)
    expect(h.fila.status).toBe('failed')
    expect(h.fila.executedAt).toBeInstanceOf(Date)
    expect(h.fila.result).toMatchObject({
      error: expect.stringContaining('Desenlace no registrado'),
    })

    // Ya con estado terminal, el siguiente intento lo dice y sigue sin enviar.
    const despues = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(despues.ok).toBe(false)
    expect(despues.error).toContain('ya fue failed')
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('código caducado e intentos agotados devuelven su motivo tipado', async () => {
    h.fila.whatsappCodeExpiresAt = new Date(Date.now() - 60_000)
    const caducada = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(caducada.ok).toBe(false)
    expect(caducada.motivo).toBe('codigo_caducado')
    expect(h.fila.status).toBe('expired')
    expect(h.handleCallTool).not.toHaveBeenCalled()

    h.fila = await filaPendiente(await hashAuthCode(CODIGO))
    h.fila.whatsappCodeAttempts = 3
    const agotada = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(agotada.ok).toBe(false)
    expect(agotada.motivo).toBe('intentos_agotados')
    expect(h.fila.status).toBe('expired')
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('un token desconocido no envía y devuelve el motivo tipado', async () => {
    h.fila.whatsappVerificationToken = 'b'.repeat(48)

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.ok).toBe(false)
    expect(res.motivo).toBe('solicitud_no_encontrada')
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('un desenlace tardío corrige la fila que el barrido ya cerró como fallida', async () => {
    h.handleCallTool.mockImplementationOnce(async () => {
      // El barrido cierra la fila mientras la llamada externa sigue abierta.
      h.fila.status = 'failed'
      h.fila.executedAt = new Date()
      h.fila.result = { error: 'Desenlace no registrado' }
      return envioOk()
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    // El mensaje salió después de que el barrido se rindiera: la fila debe
    // decir la verdad (ejecutada), no quedarse en el `failed` provisional.
    expect(res.executed).toBe(true)
    expect(h.fila.status).toBe('executed')
    expect(h.fila.result).toMatchObject({ ok: true })
  })

  it('la reconciliación no toca una reclamación reciente (el envío puede seguir en curso)', async () => {
    h.fila.status = 'approved'
    h.fila.resolvedAt = new Date(Date.now() - 60_000)
    h.fila.executedAt = null

    const { cerradas } = await reconciliarAprobacionesHuerfanas()

    expect(cerradas).toBe(0)
    expect(h.fila.status).toBe('approved')
    expect(h.fila.executedAt).toBeNull()
  })

  it('la reconciliación no toca solicitudes pendientes ni ya resueltas', async () => {
    h.fila.status = 'pending'
    h.fila.resolvedAt = new Date(Date.now() - 60 * 60_000)
    expect((await reconciliarAprobacionesHuerfanas()).cerradas).toBe(0)

    h.fila.status = 'executed'
    h.fila.executedAt = new Date(Date.now() - 60 * 60_000)
    expect((await reconciliarAprobacionesHuerfanas()).cerradas).toBe(0)
    expect(h.fila.status).toBe('executed')
  })

  it('si la herramienta responde isError, queda failed con el motivo', async () => {
    h.handleCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ error: 'sin instancia' }) }],
      isError: true,
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.ok).toBe(false)
    expect(res.error).toBe('sin instancia')
    expect(res.motivo).toBe('envio_fallido')
    expect(h.fila.status).toBe('failed')
  })
})
