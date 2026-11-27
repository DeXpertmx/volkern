/**
 * Timeout real del proveedor en el camino de aprobación.
 *
 * `sendWhatsAppMessage` distingue un rechazo del proveedor de un resultado
 * incierto. Un fallo de red o un timeout no permiten afirmar que el mensaje no
 * salió, así que el error viaja tipado y la ejecución de la aprobación lo
 * conserva. No hay reintento automático: se llama al proveedor una sola vez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

vi.mock('@/lib/db', () => ({
  default: {
    // Credenciales suficientes para llegar al fetch sin tocar una base real.
    tenantWhatsAppInstance: {
      findFirst: vi.fn(async () => ({ instanceName: 'instancia-prueba' })),
    },
  },
}))

vi.mock('@/lib/mcp/mcp-handler', () => ({
  handleCallTool: vi.fn(async () => {
    const { enviarWhatsappOFallar } = await import('@/lib/whatsapp')
    await enviarWhatsappOFallar('+5215555555555', 'Hola', 'tenant-a')
  }),
}))

import { ejecutarToolDelCatalogo } from '@/lib/mcp/approval-execution'

describe('timeout del proveedor durante una aprobación', () => {
  beforeEach(() => {
    vi.stubEnv('EVOLUTION_API_KEY', 'clave-de-prueba')
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('deja el resultado incierto y no reenvía el mensaje', async () => {
    const res = await ejecutarToolDelCatalogo({
      id: 'ap-1',
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      requestedById: 'user-1',
      arguments: { leadId: 'lead-1', mensaje: 'Hola' },
    })

    expect(res).toEqual({
      ok: false,
      result: { error: 'fetch failed', desenlace: 'incierto' },
    })
    // Un solo intento: el timeout no dispara un reenvío automático.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
