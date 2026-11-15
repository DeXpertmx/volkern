// Caché de marca.
//
// getEffectiveBranding guarda 5 minutos en memoria; si el editor no la limpia,
// la oficina guarda su logo y sigue viendo el anterior. Aquí se comprueba que
// `clearBrandingCache(tenantId)` obliga a releer sin afectar a otras cuentas.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  configFindMany: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    configuracion: { findMany: mocks.configFindMany },
  },
}))

import { clearBrandingCache, getEffectiveBranding } from '@/lib/branding'

beforeEach(() => {
  clearBrandingCache()
  vi.clearAllMocks()
  mocks.tenantFindUnique.mockResolvedValue({
    nombre: 'VRE Norte',
    parentId: null,
    brandingConfig: { primaryColor: '#b45309' },
  })
  mocks.configFindMany.mockResolvedValue([
    { clave: 'portal_claim', valor: 'Inmobiliaria de barrio' },
    { clave: 'portal_whatsapp', valor: '34612345678' },
  ])
})

describe('getEffectiveBranding', () => {
  it('expone claim y WhatsApp de Configuracion', async () => {
    const marca = await getEffectiveBranding('tenant-1')
    expect(marca.claim).toBe('Inmobiliaria de barrio')
    expect(marca.telefono).toBe('34612345678')
    expect(marca.primaryColor).toBe('#b45309')
  })

  it('sirve de caché hasta que se invalida esa cuenta', async () => {
    await getEffectiveBranding('tenant-1')
    await getEffectiveBranding('tenant-1')
    expect(mocks.tenantFindUnique).toHaveBeenCalledTimes(1)

    mocks.configFindMany.mockResolvedValue([{ clave: 'portal_claim', valor: 'Nuevo claim' }])
    clearBrandingCache('tenant-1')

    const marca = await getEffectiveBranding('tenant-1')
    expect(mocks.tenantFindUnique).toHaveBeenCalledTimes(2)
    expect(marca.claim).toBe('Nuevo claim')
  })

  it('invalidar una cuenta no toca la caché de otra', async () => {
    mocks.tenantFindUnique.mockResolvedValue({
      nombre: 'Otra',
      parentId: null,
      brandingConfig: { primaryColor: '#111111' },
    })
    await getEffectiveBranding('tenant-2')
    await getEffectiveBranding('tenant-1')

    const llamadas = mocks.tenantFindUnique.mock.calls.length
    clearBrandingCache('tenant-1')
    await getEffectiveBranding('tenant-2')

    expect(mocks.tenantFindUnique.mock.calls.length).toBe(llamadas)
  })
})
