import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClausulasPreview } from '@/components/contratos/ClausulasPreview'

// Usamos renderToStaticMarkup (react-dom/server) para no depender de jsdom,
// cuyo entorno está roto con el vitest instalado (jsdom 29 + @exodus/bytes).

describe('ClausulasPreview', () => {
  it('resuelve los placeholders con los datos del contexto', () => {
    const html = renderToStaticMarkup(
      <ClausulasPreview
        text="El cliente {{cliente.nombre}} de {{cliente.empresa}} pagará {{totales.total}}."
        context={{
          clienteNombre: 'Juan Pérez',
          clienteEmpresa: 'ACME S.L.',
          moneda: 'EUR',
          total: 1210,
        }}
      />
    )
    expect(html).toContain('El cliente Juan Pérez de ACME S.L. pagará €1,210.00.')
  })

  it('resuelve fechas y datos del tenant', () => {
    const html = renderToStaticMarkup(
      <ClausulasPreview
        text="Entre {{empresa.nombre}} y {{cliente.nombre}}, desde {{fecha.inicio}}."
        context={{ clienteNombre: 'Ana', fechaInicio: new Date('2026-09-01T12:00:00') }}
        tenant={{ razonSocial: 'Volkern S.L.' }}
      />
    )
    expect(html).toContain('Entre Volkern S.L. y Ana, desde 1 de septiembre de 2026.')
  })

  it('marca los placeholders sin resolver y no los oculta', () => {
    const html = renderToStaticMarkup(<ClausulasPreview text="Cliente: {{cliente.nombre}}." context={{}} />)
    // El texto queda visible con el placeholder sin dato
    expect(html).toContain('Cliente: .')
    // Se muestra el badge de pendientes con el token
    expect(html).toContain('1 placeholder(s) sin dato')
    expect(html).toContain('{{cliente.nombre}}')
  })

  it('no renderiza nada si no hay texto', () => {
    const html = renderToStaticMarkup(<ClausulasPreview text="   " context={{}} />)
    expect(html).toBe('')
  })
})
