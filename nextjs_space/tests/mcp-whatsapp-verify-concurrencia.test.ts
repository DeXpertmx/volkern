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
 * El doble de Prisma de esta suite serializa `$transaction` como lo haría el
 * bloqueo de fila de Postgres, de modo que la segunda petición ve el estado que
 * dejó la primera. También cubre el desenlace del envío: si la ejecución falla,
 * la solicitud queda en `failed`, nunca en un `approved` ambiguo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fila: null as any,
  handleCallTool: vi.fn(),
  /** Recibos de idempotencia por clave (tabla whatsapp_send_receipts). */
  recibos: new Map<string, any>(),
  /** Simula que la confirmación del recibo falla en base de datos. */
  fallaConfirmacion: false,
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

  const cumpleRecibo = (recibo: any, where: Record<string, any>) =>
    Object.entries(where).every(([campo, condicion]: any) => {
      if (condicion && typeof condicion === 'object' && 'in' in condicion) {
        return (condicion.in as unknown[]).includes(recibo[campo])
      }
      if (condicion && typeof condicion === 'object' && 'lt' in condicion) {
        return (
          recibo[campo] != null &&
          new Date(recibo[campo]).getTime() < new Date(condicion.lt).getTime()
        )
      }
      return recibo[campo] === condicion
    })

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
      whatsappSendReceipt: {
        create: async ({ data }: any) => {
          if (h.recibos.has(data.key)) {
            throw Object.assign(new Error('clave duplicada'), { code: 'P2002' })
          }
          const ahora = new Date()
          const recibo = {
            status: 'en_curso',
            result: null,
            createdAt: ahora,
            updatedAt: ahora,
            ...data,
          }
          h.recibos.set(data.key, recibo)
          return { ...recibo }
        },
        findUnique: async ({ where }: any) => {
          const recibo = h.recibos.get(where.key)
          return recibo ? { ...recibo } : null
        },
        findFirst: async ({ where }: any) => {
          for (const recibo of h.recibos.values()) {
            if (cumpleRecibo(recibo, where)) return { ...recibo }
          }
          return null
        },
        updateMany: async ({ where, data }: any) => {
          if (h.fallaConfirmacion && data?.status === 'enviado') {
            throw new Error('base de datos caída')
          }
          // Con `key` se toca un recibo; sin ella (barrido) se recorren todos.
          const objetivos = where.key
            ? [h.recibos.get(where.key)].filter(Boolean)
            : [...h.recibos.values()]
          let count = 0
          for (const recibo of objetivos as any[]) {
            if (!cumpleRecibo(recibo, where)) continue
            // `@updatedAt` de Prisma: toda escritura refresca la ventana.
            Object.assign(recibo, data, { updatedAt: new Date() })
            count++
          }
          return { count }
        },
        deleteMany: async ({ where }: any) => {
          const objetivos = where.key
            ? [h.recibos.get(where.key)].filter(Boolean)
            : [...h.recibos.values()]
          let count = 0
          for (const recibo of objetivos as any[]) {
            if (!cumpleRecibo(recibo, where)) continue
            h.recibos.delete(recibo.key)
            count++
          }
          return { count }
        },
      },
    },
  }
})

import { hashAuthCode, verifyAndExecuteWhatsappAuthCode } from '@/lib/mcp/whatsapp-auth'
import { reconciliarAprobacionesHuerfanas } from '@/lib/mcp/approval-reconcile'
import {
  claveIdempotenciaEnvio,
  reconciliarRecibosSinConfirmar,
} from '@/lib/mcp/whatsapp-idempotency'

const CODIGO = '123456'
const TOKEN = 'a'.repeat(48)

async function filaPendiente(hash: string) {
  return {
    id: 'ap-1',
    tenantId: 'tenant-a',
    toolName: 'volkern_send_whatsapp',
    arguments: { leadId: 'lead-1', message: 'Hola' },
    argumentsHash: 'hash-1',
    operationId: null,
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
  h.recibos.clear()
  h.fallaConfirmacion = false
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

  it('sin operationId, un recibo en curso del mismo contenido bloquea el envío', async () => {
    const claveAjena = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-otra',
    })
    h.recibos.set(claveAjena, {
      key: claveAjena,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-otra',
      argumentsHash: 'hash-1',
      status: 'en_curso',
      result: null,
      updatedAt: new Date(),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).not.toHaveBeenCalled()
    expect(res.executed).toBe(false)
    expect(res.error).toBe('Ya hay un envío en curso para este mismo mensaje; no se reenvió.')
    expect(h.recibos.size).toBe(1)
  })

  it('sin operationId, un recibo incierto del mismo contenido bloquea el envío', async () => {
    const claveAjena = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-otra',
    })
    h.recibos.set(claveAjena, {
      key: claveAjena,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-otra',
      argumentsHash: 'hash-1',
      status: 'incierto',
      result: { error: 'Envío sin confirmación: el proceso no registró el desenlace.' },
      updatedAt: new Date(Date.now() - 20 * 60_000),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).not.toHaveBeenCalled()
    expect(res.executed).toBe(false)
    expect(res.error).toBe(
      'El envío anterior de este mismo mensaje no confirmó su entrega; no se reenvió.'
    )
  })

  it('sin operationId, un recibo enviado del mismo contenido no bloquea la repetición', async () => {
    const claveAjena = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-otra',
    })
    h.recibos.set(claveAjena, {
      key: claveAjena,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-otra',
      argumentsHash: 'hash-1',
      status: 'enviado',
      result: { ok: true, messageId: 'wamid-otro' },
      updatedAt: new Date(Date.now() - 30 * 60_000),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
    expect(res.executed).toBe(true)
  })

  it('con operationId, el mismo contenido en curso de otra operación no bloquea', async () => {
    const claveAjena = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: 'op-vieja',
      approvalId: 'ap-otra',
    })
    h.recibos.set(claveAjena, {
      key: claveAjena,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-otra',
      argumentsHash: 'hash-1',
      status: 'en_curso',
      result: null,
      updatedAt: new Date(),
    })
    h.fila.operationId = 'op-nueva'

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
    expect(res.executed).toBe(true)
  })

  it('el mismo operationId no reenvía aunque sea otra solicitud', async () => {
    h.fila.operationId = 'op-42'
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: 'op-42',
      approvalId: 'ap-1',
    })
    // El envío lo hizo otra solicitud con el mismo operationId.
    h.recibos.set(clave, {
      key: clave,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'enviado',
      result: { ok: true, messageId: 'wamid-42' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).not.toHaveBeenCalled()
    expect(res.executed).toBe(true)
    expect(res.result).toMatchObject({ messageId: 'wamid-42' })
  })

  it('un operationId nuevo permite repetir el mismo mensaje', async () => {
    // Hay un recibo del mismo mensaje, pero de otra operación.
    const claveVieja = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: 'op-vieja',
      approvalId: 'ap-anterior',
    })
    h.recibos.set(claveVieja, {
      key: claveVieja,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'enviado',
      result: { ok: true, messageId: 'wamid-viejo' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    h.fila.operationId = 'op-nueva'

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
    expect(res.executed).toBe(true)
    const claveNueva = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: 'op-nueva',
      approvalId: 'ap-1',
    })
    expect(h.recibos.get(claveNueva)).toMatchObject({ status: 'enviado', approvalId: 'ap-1' })
  })

  it('un envío que quedó en curso no se repite cuando llega una petición nueva', async () => {
    // El recibo de la solicitud anterior sigue en `en_curso`: su proceso murió
    // o el barrido cerró la fila mientras el proveedor seguía trabajando.
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.recibos.set(clave, {
      key: clave,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'en_curso',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    expect(res.error).toContain('envío en curso')
    expect(h.fila.status).toBe('failed')
  })

  it('un envío ya confirmado devuelve su resultado sin reenviar el mensaje', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.recibos.set(clave, {
      key: clave,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'enviado',
      result: { ok: true, messageId: 'wamid-1' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).not.toHaveBeenCalled()
    expect(res.executed).toBe(true)
    expect(res.result).toMatchObject({ messageId: 'wamid-1' })
    expect(h.fila.status).toBe('executed')
  })

  it('el envío correcto deja el recibo en enviado y un rechazo confirmado lo libera', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })

    await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(h.recibos.get(clave)).toMatchObject({ status: 'enviado', approvalId: 'ap-1' })

    // Segundo escenario: el proveedor rechaza (4xx) y la clave queda libre.
    h.recibos.clear()
    h.fila = await filaPendiente(await hashAuthCode(CODIGO))
    h.handleCallTool.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Error 400: número inválido', desenlace: 'no_enviado' }),
        },
      ],
      isError: true,
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.ok).toBe(false)
    expect(h.recibos.size).toBe(0)
  })

  it('sin desenlace tipado, un error que parece rechazo se trata como incierto', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.handleCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ error: 'Error 400: número inválido' }) }],
      isError: true,
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.ok).toBe(false)
    expect(h.recibos.get(clave)).toMatchObject({ status: 'incierto' })
  })

  it('un timeout deja el recibo incierto y bloquea un segundo envío', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    // Sin respuesta del proveedor: el mensaje pudo salir.
    h.handleCallTool.mockRejectedValueOnce(new Error('fetch failed'))

    const primera = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })
    expect(primera.ok).toBe(false)
    expect(h.recibos.get(clave)).toMatchObject({ status: 'incierto' })

    // Otra solicitud con los mismos argumentos no reenvía.
    h.fila = await filaPendiente(await hashAuthCode(CODIGO))
    const segunda = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
    expect(segunda.ok).toBe(false)
    expect(segunda.error).toContain('no confirmó')
  })

  it('si falla la confirmación en base, el envío sigue siendo executed', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.fallaConfirmacion = true

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.ok).toBe(true)
    expect(h.fila.status).toBe('executed')
    // El recibo se queda «en curso»; el barrido lo pasará a incierto sin liberar.
    expect(h.recibos.get(clave)).toMatchObject({ status: 'en_curso' })
  })

  it('el barrido marca incierto un recibo que lleva demasiado sin desenlace', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.recibos.set(clave, {
      key: clave,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-1',
      status: 'en_curso',
      result: null,
      createdAt: new Date(Date.now() - 60 * 60_000),
      updatedAt: new Date(Date.now() - 30 * 60_000),
    })

    const { marcados } = await reconciliarRecibosSinConfirmar()

    expect(marcados).toBe(1)
    expect(h.recibos.get(clave)).toMatchObject({ status: 'incierto' })
  })

  it('un `en_curso` huérfano caducado se puede re-tomar', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.recibos.set(clave, {
      key: clave,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-vieja',
      status: 'en_curso',
      result: null,
      updatedAt: new Date(Date.now() - 25 * 60 * 60_000),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
    expect(res.executed).toBe(true)
    expect(h.recibos.get(clave)).toMatchObject({ status: 'enviado', approvalId: 'ap-1' })
    // El recibo tomado vuelve a estar vigente: un reintento inmediato no vuelve
    // a enviar, porque `updatedAt` refrescó la ventana.
    expect(new Date(h.recibos.get(clave).updatedAt).getTime()).toBeGreaterThan(
      Date.now() - 60_000
    )
  })

  it('un recibo `enviado` caducado no se re-toma: un envío confirmado no se repite', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.recibos.set(clave, {
      key: clave,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'enviado',
      result: { ok: true, messageId: 'wamid-viejo' },
      updatedAt: new Date(Date.now() - 25 * 60 * 60_000),
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(h.handleCallTool).not.toHaveBeenCalled()
    expect(res.executed).toBe(true)
    expect(res.result).toMatchObject({ messageId: 'wamid-viejo' })
    expect(h.recibos.get(clave)).toMatchObject({ status: 'enviado', approvalId: 'ap-anterior' })
  })

  it('un rechazo confirmado libera el recibo aunque el barrido lo marcara incierto', async () => {
    const clave = claveIdempotenciaEnvio({
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      operationId: null,
      approvalId: 'ap-1',
    })
    h.handleCallTool.mockImplementationOnce(async () => {
      // El barrido marca `incierto` mientras la llamada sigue en vuelo; el
      // rechazo que llega después demuestra que el mensaje no salió.
      const recibo = h.recibos.get(clave)
      if (recibo) recibo.status = 'incierto'
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Error 400: número inválido', desenlace: 'no_enviado' }),
          },
        ],
        isError: true,
      }
    })

    const res = await verifyAndExecuteWhatsappAuthCode({ verificationToken: TOKEN, code: CODIGO })

    expect(res.executed).toBe(false)
    expect(h.recibos.has(clave)).toBe(false)
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
