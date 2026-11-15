// @vitest-environment jsdom
//
// La ficha pública sigue la plantilla del portal.
//
// Con «hero de marca» el titular y el precio viven en el bloque de color; con
// «hero con foto» siguen en la tarjeta. En ningún caso puede haber dos `h1`.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

beforeAll(() => {
  if (!global.ResizeObserver) {
    ;(global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

vi.mock('@/components/real-estate/CalculadoraHipotecaria', () => ({
  default: () => React.createElement('div', { 'data-testid': 'calculadora' }),
}))

import PropertyDetailClient from '@/app/p/[tenantSlug]/propiedades/[id]/PropertyDetailClient'

const propiedad = {
  id: 'inmueble-1',
  nombre: 'Piso reformado en Ruzafa',
  operationType: 'venta',
  status: 'disponible',
  precioBase: 289000,
  moneda: 'EUR',
  media: [],
  address: 'Carrer de Cadis 41',
  city: 'Valencia',
  propertyType: 'Piso',
  areaM2: 95,
  featured: true,
  bedrooms: 3,
  bathrooms: 2,
} as any

function renderFicha(plantilla: 'foto' | 'marca') {
  return render(
    <PropertyDetailClient
      property={propiedad}
      tenant={{ id: 't1', nombre: 'VRE Norte', moneda: 'EUR', brandingConfig: null }}
      tenantSlug="vre-norte"
      brandingColor="#b45309"
      plantilla={plantilla}
      images={[]}
      mainImage=""
      formattedPrice="289.000 €"
      relatedProperties={[]}
    />
  )
}

describe('ficha de inmueble y plantilla', () => {
  it('con hero de marca abre con el bloque de color y un solo titular', () => {
    const { container } = renderFicha('marca')

    const titulares = container.querySelectorAll('h1')
    expect(titulares).toHaveLength(1)
    expect(titulares[0].textContent).toBe('Piso reformado en Ruzafa')
    // El precio vive en el bloque, no repetido en la tarjeta de datos.
    expect(container.textContent?.match(/289\.000 €/g)).toHaveLength(1)
    expect(container.innerHTML).toContain('linear-gradient(135deg')
    // Operación y estado ya se leen en el hero: la galería solo conserva lo
    // que el bloque de color no dice (DESTACADA).
    const galeria = container.querySelector('.absolute.top-4.left-4')
    expect(galeria?.children).toHaveLength(1)
    expect(galeria?.textContent).toBe('DESTACADA')
  })

  it('con hero con foto mantiene el titular en la tarjeta y sin bloque de color', () => {
    const { container } = renderFicha('foto')

    const titulares = container.querySelectorAll('h1')
    expect(titulares).toHaveLength(1)
    expect(titulares[0].textContent).toBe('Piso reformado en Ruzafa')
    expect(container.innerHTML).not.toContain('linear-gradient(135deg')
    // Sin hero de marca, la galería conserva sus tres insignias de siempre.
    const galeria = container.querySelector('.absolute.top-4.left-4')
    expect(galeria?.children).toHaveLength(3)
    expect(galeria?.textContent).toContain('En Venta')
  })
})
