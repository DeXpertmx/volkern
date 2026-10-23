import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { CRM_TIERS, CRM_TRIAL_DAYS } from '@/lib/crm-pricing'

/*
 * El dossier de cliente se genera con `node` a secas (scripts/generar-dossier-crm-ventas.cjs
 * con DOSSIER_CLIENTE=1) y su módulo de páginas no importa puppeteer, así que
 * se puede renderizar aquí sin Chromium.
 *
 * Qué se protege: que la variante que se entrega al cliente no acabe anunciando
 * tarifas por descuido. El precio se negocia en la propuesta; si una edición
 * futura vuelve a meter una cifra, esto falla en vez de llegar a un cliente.
 */
const require = createRequire(import.meta.url)
const { paginasCliente } = require('../scripts/dossier-crm-ventas/cliente.cjs')

const ayudantes = {
  pie: (n: number) => `<!-- pie ${n} -->`,
  shot: (_clave: string, alt: string) => `<figure alt="${alt}"></figure>`,
  lista: (items: string[]) => `<ul>${items.join('')}</ul>`,
  card: (_n: string, titulo: string, texto: string) => `<div>${titulo}${texto}</div>`,
  imagenes: { embudo: 'data:image/jpeg;base64,AA' } as Record<string, string>,
}

const paginas: string[] = paginasCliente(ayudantes)

describe('dossier de cliente de CRM: sin precios ni material interno', () => {
  it('compone las doce páginas de la variante de cliente', () => {
    expect(paginas).toHaveLength(12)
    expect(paginas.join('')).toContain('Documento para el cliente')
  })

  it('no anuncia ninguna tarifa ni nivel de contratación', () => {
    const html = paginas.join('\n')

    for (const tier of CRM_TIERS) {
      expect(html, `nombre de nivel ${tier.name}`).not.toContain(tier.name)
      expect(html, `precio anual ${tier.annualMonthly} €`).not.toContain(`${tier.annualMonthly} €`)
      expect(html, `precio mensual ${tier.monthly} €`).not.toContain(`${tier.monthly} €`)
    }

    expect(html.toLowerCase()).not.toContain('usuario/mes')
    expect(html.toLowerCase()).not.toContain('por usuario')
    expect(html.toLowerCase()).not.toMatch(/€\s*\/\s*usuario/)
  })

  it('conserva la prueba y el contacto, que son la llamada a la acción', () => {
    const html = paginas.join('\n')
    expect(html).toContain(`${CRM_TRIAL_DAYS} días`)
    expect(html).toContain('info@volkern.app')
  })

  it('no incluye el guion de venta: objeciones, demo cronometrada ni qué enseñar', () => {
    const html = paginas.join('\n')
    expect(html).not.toContain('Ocho objeciones')
    expect(html).not.toContain('Quince minutos')
    expect(html).not.toContain('Qué enseñar')
    expect(html).not.toContain('Cómo cerrar el precio')
    expect(html).not.toContain('Antes de cerrar la reunión')
  })
})
