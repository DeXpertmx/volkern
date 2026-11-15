// Revalidación del portal al guardar un inmueble.
//
// Lo que importa: que se invalide lo de esa cuenta (y su alias) y que un fallo de
// revalidación no rompa el guardado, porque el dato ya está escrito.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/db', () => ({
  globalPrisma: {
    tenant: { findUnique: mocks.findUnique },
    configuracion: { findFirst: mocks.findFirst },
  },
}))

import { revalidarPortalDeInmueble } from '@/lib/real-estate/portal-revalidate'

const { revalidatePath, findUnique, findFirst } = mocks

beforeEach(() => {
  vi.clearAllMocks()
  findUnique.mockResolvedValue({ slug: 'vre-norte' })
  findFirst.mockResolvedValue({ valor: 'norte' })
})

describe('revalidarPortalDeInmueble', () => {
  it('invalida portada, catálogo, ficha e imagen OG en el slug y el alias', async () => {
    await revalidarPortalDeInmueble('tenant-1', 'inm-1')

    const rutas = revalidatePath.mock.calls.map(([ruta]) => ruta)
    expect(rutas).toEqual([
      '/p/vre-norte',
      '/p/vre-norte/propiedades',
      '/p/vre-norte/propiedades/inm-1',
      '/p/vre-norte/propiedades/inm-1/opengraph-image',
      '/p/norte',
      '/p/norte/propiedades',
      '/p/norte/propiedades/inm-1',
      '/p/norte/propiedades/inm-1/opengraph-image',
    ])
  })

  it('sin inmueble sólo invalida portada y catálogo', async () => {
    findFirst.mockResolvedValue(null)
    await revalidarPortalDeInmueble('tenant-1')

    expect(revalidatePath.mock.calls.map(([ruta]) => ruta)).toEqual([
      '/p/vre-norte',
      '/p/vre-norte/propiedades',
    ])
  })

  it('si el tenant no existe no invalida nada', async () => {
    findUnique.mockResolvedValue(null)
    await revalidarPortalDeInmueble('tenant-x', 'inm-1')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un fallo de base de datos no propaga el error', async () => {
    findUnique.mockRejectedValue(new Error('sin conexión'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(revalidarPortalDeInmueble('tenant-1', 'inm-1')).resolves.toBeUndefined()
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
