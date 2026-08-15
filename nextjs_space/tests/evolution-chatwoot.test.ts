import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createAccountWithAccess: vi.fn(),
  ensureBotUserInAccount: vi.fn(),
  createApiInbox: vi.fn(),
  configureWebhook: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  default: {
    userWhatsAppInstance: { findFirst: mocks.findFirst },
    channel: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update },
    messagingHubConfig: { findUnique: mocks.findFirst, create: mocks.create, update: mocks.update },
    tenant: { update: mocks.update },
  },
}))
vi.mock('@/lib/nexus/chatwoot-api', () => ({
  chatwootApi: {
    createAccountWithAccess: mocks.createAccountWithAccess,
    ensureBotUserInAccount: mocks.ensureBotUserInAccount,
    createApiInbox: mocks.createApiInbox,
    configureWebhook: mocks.configureWebhook,
  },
}))

import { ensureChatwootInboxForInstance } from '@/lib/evolution-instances'

describe('conexión automática de instancia Evolution a Chatwoot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://chatwoot.example.test')
    vi.stubEnv('CHATWOOT_SUPER_ADMIN_TOKEN', 'super-token')
    vi.stubEnv('EVOLUTION_API_KEY', 'evo-key')
    vi.stubEnv('EVOLUTION_API_URL', 'https://api.dimension.expert')
    vi.stubEnv('NEXTAUTH_URL', 'https://volkern.app')

    mocks.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.instanceName) {
        return {
          id: 'inst-1',
          userId: 'user-1',
          tenantId: 'tenant-1',
          instanceName: 'volkern_test',
          phoneNumber: null,
          tenant: { nombre: 'Dimension eXpert' },
        }
      }
      if (where?.tenantId) return null // sin canal ni hub config aún
      return null
    })
    mocks.create.mockImplementation(async ({ data }: any) => ({
      id: data?.id || 'ch-1',
      ...data,
    }))
    mocks.update.mockImplementation(async ({ data }: any) => ({ id: 'x', ...data }))
    mocks.createAccountWithAccess.mockResolvedValue({
      account: { id: 42, name: 'Dimension eXpert' },
      accessToken: 'account-token',
    })
    mocks.ensureBotUserInAccount.mockResolvedValue('account-token')
    mocks.createApiInbox.mockResolvedValue({ id: 99, name: 'WhatsApp - Dimension eXpert' })
    mocks.configureWebhook.mockResolvedValue({
      id: 7,
      url: 'https://volkern.app/api/integrations/webhook/chatwoot',
      secret: 'test-secret',
    })
  })

  it('crea cuenta, usa el número del perfil y crea el inbox Evolution en Chatwoot', async () => {
    // El número ya está sincronizado en la instancia (como tras conectarse)
    mocks.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.instanceName) {
        return {
          id: 'inst-1',
          userId: 'user-1',
          tenantId: 'tenant-1',
          instanceName: 'volkern_test',
          phoneNumber: '34600111222',
          tenant: { nombre: 'Dimension eXpert' },
        }
      }
      return null
    })

    const result = await ensureChatwootInboxForInstance('volkern_test')

    expect(result.success).toBe(true)
    expect(result.inboxId).toBe(99)
    expect(mocks.createAccountWithAccess).toHaveBeenCalledWith('Dimension eXpert', 'es')
    expect(mocks.createApiInbox).toHaveBeenCalledWith(
      42,
      'WhatsApp - Dimension eXpert',
      '',
      'account-token',
    )
    expect(mocks.configureWebhook).toHaveBeenCalled()
    // Se guardó el canal con el inbox y se activó Nexus
    expect(mocks.create).toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalled()
  })

  it('reutiliza el inbox existente del canal WhatsApp sin duplicar', async () => {
    mocks.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.instanceName) {
        return { id: 'inst-1', tenantId: 'tenant-1', instanceName: 'volkern_test', tenant: { nombre: 'Empresa' } }
      }
      if (where?.tenantId) {
        return { id: 'ch-1', tenantId: 'tenant-1', type: 'whatsapp', chatwootInboxId: 88 }
      }
      return null
    })

    // El chatwootAccountId ya existe en el hub config, no debe crearse de nuevo
    mocks.findFirst.mockResolvedValueOnce({
      id: 'inst-1',
      tenantId: 'tenant-1',
      instanceName: 'volkern_test',
      tenant: { nombre: 'Empresa' },
    })

    const result = await ensureChatwootInboxForInstance('volkern_test')

    expect(result.success).toBe(true)
    expect(result.inboxId).toBe(88)
    expect(mocks.createAccountWithAccess).not.toHaveBeenCalled()
    expect(mocks.createApiInbox).not.toHaveBeenCalled()
  })

  it('falla limpio si Chatwoot no está configurado', async () => {
    vi.stubEnv('CHATWOOT_BASE_URL', '')
    vi.stubEnv('CHATWOOT_SUPER_ADMIN_TOKEN', '')

    const result = await ensureChatwootInboxForInstance('volkern_test')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Chatwoot')
    expect(mocks.createApiInbox).not.toHaveBeenCalled()
  })
})
