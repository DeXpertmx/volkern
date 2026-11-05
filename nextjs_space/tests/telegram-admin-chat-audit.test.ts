// @vitest-environment node

/**
 * Auditoría del chat de administración de Telegram.
 *
 * Vincular el chat enciende los avisos de la empresa en una cuenta de Telegram
 * y desvincularlo los apaga. Las dos acciones tienen que dejar rastro con su
 * tenant, su actor y su fecha: si no, nadie puede responder después «¿quién
 * cortó los avisos de esta cuenta, y cuándo?». Aquí se comprueba lo que hace
 * útil esa fila y que su fallo no arrastra a la acción que audita.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ auditLogCreate: vi.fn() }))

vi.mock('@/lib/db', () => {
  const prisma = { auditLog: { create: mocks.auditLogCreate } }
  return { prisma, default: prisma }
})

const {
  auditarChatAdmin,
  ENTIDAD_CHAT_ADMIN,
  ACCION_CHAT_ADMIN_VINCULADO,
  ACCION_CHAT_ADMIN_DESVINCULADO,
} = await import('@/lib/telegram/admin-chat-audit')

function filaEscrita(): any {
  return mocks.auditLogCreate.mock.calls[0][0].data
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auditLogCreate.mockResolvedValue({})
})

describe('auditarChatAdmin — vínculo', () => {
  it('deja tenant, solicitante, chat y fecha, y nombra a la cuenta de Telegram', async () => {
    const ok = await auditarChatAdmin({
      accion: 'vinculado',
      tenantId: 't1',
      userId: 'u-admin',
      chatId: '646107192',
      actorTelegram: { id: 555, username: '@ana', nombre: 'Ana García' },
    })

    expect(ok).toBe(true)
    const fila = filaEscrita()
    expect(fila.tenantId).toBe('t1')
    expect(fila.userId).toBe('u-admin')
    expect(fila.accion).toBe(ACCION_CHAT_ADMIN_VINCULADO)
    expect(fila.entidad).toBe(ENTIDAD_CHAT_ADMIN)
    expect(fila.entidadId).toBe('646107192')
    expect(fila.descripcion).toContain('646107192')
    expect(fila.descripcion).toContain('@ana')
    expect(fila.descripcion).toContain('Ana García')
    expect(fila.descripcion).toContain('id 555')
    expect(fila.metadata).toEqual({ origen: 'telegram', fecha: expect.any(String) })
  })

  it('el snapshot lleva la fecha en ISO y no inventa una baja que no existe', async () => {
    await auditarChatAdmin({ accion: 'vinculado', tenantId: 't1', chatId: '555' })

    const fila = filaEscrita()
    expect(fila.cambiosAntes).toBeUndefined()
    expect(Number.isNaN(Date.parse(fila.cambiosDespues.fecha))).toBe(false)
    expect(fila.cambiosDespues).toMatchObject({ tenantId: 't1', chatId: '555', accion: 'vinculado' })
    expect(fila.cambiosDespues).not.toHaveProperty('vinculadoDesde')
  })

  it('sin solicitante la fila queda sin usuario, no con un id vacío', async () => {
    await auditarChatAdmin({ accion: 'vinculado', tenantId: 't1', chatId: '555', userId: null })

    expect(filaEscrita().userId).toBeNull()
    expect(filaEscrita().cambiosDespues.solicitadoPor).toBeNull()
  })

  it('sin cuenta de Telegram en el payload la descripción no acaba en un guion', async () => {
    await auditarChatAdmin({ accion: 'vinculado', tenantId: 't1', chatId: '555' })

    expect(filaEscrita().descripcion).toBe(
      'Chat 555 vinculado como chat de administración de Telegram'
    )
  })
})

describe('auditarChatAdmin — desvinculación', () => {
  it('deja el chat que se quitó y desde cuándo estaba vinculado', async () => {
    const ok = await auditarChatAdmin({
      accion: 'desvinculado',
      tenantId: 't1',
      userId: 'u-admin',
      chatId: '646107192',
      vinculadoDesde: '2026-10-03T09:15:00.000Z',
    })

    expect(ok).toBe(true)
    const fila = filaEscrita()
    expect(fila.userId).toBe('u-admin')
    expect(fila.accion).toBe(ACCION_CHAT_ADMIN_DESVINCULADO)
    expect(fila.entidadId).toBe('646107192')
    expect(fila.descripcion).toContain('desvinculado')
    expect(fila.descripcion).toContain('2026-10-03T09:15:00.000Z')
    expect(fila.cambiosDespues).toBeUndefined()
    expect(fila.cambiosAntes).toMatchObject({
      tenantId: 't1',
      chatId: '646107192',
      accion: 'desvinculado',
      vinculadoDesde: '2026-10-03T09:15:00.000Z',
    })
  })

  it('un vínculo sin fecha registrada no se audita con una fecha inventada', async () => {
    await auditarChatAdmin({ accion: 'desvinculado', tenantId: 't1', chatId: '555' })

    expect(filaEscrita().descripcion).toBe(
      'Chat 555 desvinculado como chat de administración de Telegram'
    )
    expect(filaEscrita().cambiosAntes.vinculadoDesde).toBeNull()
  })

  it('sin chat identificable la entidad cae en el tenant, no en un id vacío', async () => {
    await auditarChatAdmin({ accion: 'desvinculado', tenantId: 't1' })

    expect(filaEscrita().entidadId).toBe('t1')
    expect(filaEscrita().descripcion).toContain('sin identificar')
  })
})

describe('auditarChatAdmin — la auditoría no puede tumbar la acción', () => {
  it('si el audit log falla, no lanza: devuelve false', async () => {
    mocks.auditLogCreate.mockRejectedValue(new Error('connection terminated unexpectedly'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      auditarChatAdmin({ accion: 'vinculado', tenantId: 't1', chatId: '555' })
    ).resolves.toBe(false)

    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
