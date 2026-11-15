// @vitest-environment jsdom
//
// CTA del hero de marca.
//
// El catálogo no tiene sección de contacto: si el hero pinta siempre
// `#contacto`, el botón no lleva a ninguna parte. Por eso el destino es
// opcional y la portada es quien lo pasa.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

import PortalHeroMarca from '@/components/real-estate/PortalHeroMarca'
import { tokensPortal } from '@/lib/real-estate/portal-templates'

describe('hero de marca', () => {
  const tokens = tokensPortal('marca');

  it('sin destino no pinta el botón', () => {
    render(
      <PortalHeroMarca
        companyName="VRE Norte"
        brandingColor="#b45309"
        tokens={tokens}
      />
    )

    expect(screen.queryByRole('link', { name: /Hablar con la oficina/i })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('VRE Norte')
  })

  it('con destino enlaza ahí', () => {
    render(
      <PortalHeroMarca
        companyName="VRE Norte"
        brandingColor="#b45309"
        tokens={tokens}
        ctaHref="#contacto"
      />
    )

    expect(
      screen.getByRole('link', { name: 'Hablar con la oficina' }).getAttribute('href')
    ).toBe('#contacto')
  })

  it('usa el color primario de la plantilla cuando no hay branding', () => {
    render(
      <PortalHeroMarca
        companyName="VRE Norte"
        tokens={tokens}
      />
    )

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('VRE Norte')
  })
})
