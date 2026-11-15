// SEO del portal: sitemap, robots, JSON-LD y enlaces con origen.
//
// Lo que se comprueba aquí es lo que los buscadores y WhatsApp leen: URLs
// absolutas, precios numéricos con divisa y, sobre todo, que el enlace
// compartido lleve el `origen` para que el lead diga de dónde vino.
import { describe, it, expect } from 'vitest'
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers'
import {
  baseUrlDePeticion,
  construirDatosEstructuradosFicha,
  entradasSitemap,
  normalizarOrigen,
  sitemapXml,
  textoRobots,
  urlCompartirWhatsapp,
  urlConOrigen,
} from '@/lib/real-estate/portal-seo'

const inmueble = {
  id: 'inm-1',
  nombre: 'Ático con terraza',
  descripcion: 'Ático de obra nueva a 300 m de la playa',
  precioBase: 355000,
  moneda: 'EUR',
  status: 'disponible',
  propertyType: 'casa',
  areaM2: 110,
  bedrooms: 2,
  bathrooms: 2,
  address: 'Carrer de la Reina 88',
  city: 'Valencia',
  lat: 39.47,
  lng: -0.33,
  media: [],
  createdAt: new Date('2026-10-01T10:00:00Z'),
} as unknown as InmuebleParsed

describe('origen del lead', () => {
  it('sólo admite orígenes conocidos', () => {
    expect(normalizarOrigen('whatsapp')).toBe('whatsapp')
    expect(normalizarOrigen('  WhatsApp ')).toBe('whatsapp')
    expect(normalizarOrigen('newsletter-2026')).toBeNull()
    expect(normalizarOrigen(undefined)).toBeNull()
  })

  it('añade el origen a una URL conservando los parámetros previos', () => {
    const url = urlConOrigen('https://volkern.app/p/vre-norte/propiedades/inm-1?vista=mapa', 'whatsapp')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('vista')).toBe('mapa')
    expect(parsed.searchParams.get('origen')).toBe('whatsapp')
  })

  it('el enlace de WhatsApp lleva nombre, precio y la ficha con origen', () => {
    const enlace = urlCompartirWhatsapp({
      url: 'https://volkern.app/p/vre-norte/propiedades/inm-1',
      nombre: 'Ático con terraza',
      precio: '355.000 €',
    })

    expect(enlace.startsWith('https://wa.me/?text=')).toBe(true)
    const texto = decodeURIComponent(enlace.split('text=')[1])
    expect(texto).toContain('Ático con terraza — 355.000 €')
    expect(texto).toContain('https://volkern.app/p/vre-norte/propiedades/inm-1?origen=whatsapp')
  })
})

describe('datos estructurados de la ficha', () => {
  it('publica precio, divisa, dirección y disponibilidad', () => {
    const datos = construirDatosEstructuradosFicha({
      property: inmueble,
      tenant: { nombre: 'VRE Norte' },
      url: 'https://volkern.app/p/vre-norte/propiedades/inm-1',
      imagenes: ['https://cdn.example/foto.jpg'],
      base: 'https://volkern.app',
      tenantSlug: 'vre-norte',
    })

    expect(datos['@type']).toBe('RealEstateListing')
    expect(datos.name).toBe('Ático con terraza')
    expect(datos.image).toEqual(['https://cdn.example/foto.jpg'])

    const oferta = datos.offers as Record<string, unknown>
    expect(oferta.price).toBe(355000)
    expect(oferta.priceCurrency).toBe('EUR')
    expect(oferta.availability).toBe('https://schema.org/InStock')

    const vivienda = datos.about as Record<string, any>
    expect(vivienda['@type']).toBe('House')
    expect(vivienda.numberOfRooms).toBe(2)
    expect(vivienda.floorSize).toEqual({ '@type': 'QuantitativeValue', value: 110, unitCode: 'MTK' })
    expect(vivienda.address.addressLocality).toBe('Valencia')
    expect(vivienda.geo.latitude).toBe(39.47)

    expect((datos.broker as Record<string, unknown>).url).toBe('https://volkern.app/p/vre-norte')
  })

  it('un inmueble vendido se anuncia como no disponible y sin precio no hay oferta', () => {
    const vendido = construirDatosEstructuradosFicha({
      property: { ...inmueble, status: 'vendida' },
      tenant: { nombre: 'VRE Norte' },
      url: 'https://volkern.app/p/vre-norte/propiedades/inm-1',
      imagenes: [],
      base: 'https://volkern.app',
      tenantSlug: 'vre-norte',
    })
    expect((vendido.offers as Record<string, unknown>).availability).toBe('https://schema.org/SoldOut')

    const sinPrecio = construirDatosEstructuradosFicha({
      property: { ...inmueble, precioBase: 0, status: 'disponible' },
      tenant: { nombre: 'VRE Norte' },
      url: 'https://volkern.app/p/vre-norte/propiedades/inm-1',
      imagenes: [],
      base: 'https://volkern.app',
      tenantSlug: 'vre-norte',
    })
    expect(sinPrecio.offers).toBeUndefined()
  })
})

describe('sitemap por cuenta', () => {
  it('incluye portada, catálogo, páginas publicadas e inmuebles', () => {
    const entradas = entradasSitemap({
      base: 'https://volkern.app/',
      tenantSlug: 'vre-norte',
      paginas: [
        { slug: 'equipo', fechaActualizacion: new Date('2026-11-01T00:00:00Z') },
        { slug: 'propiedades', fechaActualizacion: null },
      ],
      inmuebles: [{ id: 'inm-1', fechaActualizacion: new Date('2026-11-10T00:00:00Z') }],
    })

    const urls = entradas.map((entrada) => entrada.url)
    expect(urls).toEqual([
      'https://volkern.app/p/vre-norte',
      'https://volkern.app/p/vre-norte/propiedades',
      'https://volkern.app/p/vre-norte/equipo',
      'https://volkern.app/p/vre-norte/propiedades/inm-1',
    ])
    expect(entradas[3].lastModified?.toISOString()).toBe('2026-11-10T00:00:00.000Z')
  })

  it('genera XML válido con las URLs escapadas', () => {
    const xml = sitemapXml(
      entradasSitemap({
        base: 'https://volkern.app',
        tenantSlug: 'a&b',
        inmuebles: [{ id: 'x' }],
      })
    )
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('/p/a&amp;b')
    expect(xml).not.toContain('<loc>https://volkern.app/p/a&b')
  })
})

describe('robots por cuenta', () => {
  it('declara el sitemap de la cuenta y bloquea /api', () => {
    const texto = textoRobots({ base: 'https://volkern.app', tenantSlug: 'vre-norte', indexable: true })
    expect(texto).toContain('Disallow: /api/')
    expect(texto).toContain('Sitemap: https://volkern.app/p/vre-norte/sitemap.xml')
  })

  it('una cuenta de baja no se rastrea', () => {
    const texto = textoRobots({ base: 'https://volkern.app', tenantSlug: 'vieja', indexable: false })
    expect(texto).toContain('Disallow: /')
    expect(texto).not.toContain('Sitemap:')
  })
})

describe('base pública', () => {
  it('respeta el proxy delante de Next', () => {
    const headers = new Headers({
      'x-forwarded-host': 'portales.volkern.app',
      'x-forwarded-proto': 'https',
    })
    expect(baseUrlDePeticion(headers)).toBe('https://portales.volkern.app')
  })

  it('en local usa http y sin host cae en la URL pública configurada', () => {
    expect(baseUrlDePeticion(new Headers({ host: 'localhost:3010' }))).toBe('http://localhost:3010')
    expect(baseUrlDePeticion(new Headers())).toMatch(/^https?:\/\//)
  })
})
