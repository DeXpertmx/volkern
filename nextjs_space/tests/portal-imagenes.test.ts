// Imágenes responsive del portal: variantes, anchos válidos y allowlist de hosts.
import { describe, it, expect } from 'vitest'
import {
  ANCHOS_TARJETA,
  anchoImagenPortal,
  esHostDeImagenPermitido,
  hostsDeImagenPermitidos,
  srcSetImagenPortal,
  urlImagenPortal,
  urlPortadaInmueble,
} from '@/lib/real-estate/portal-imagenes'

const IMAGEN = 'https://images.unsplash.com/photo-1?w=800&fit=crop'

describe('imágenes del portal', () => {
  it('genera la variante con ancho y URL codificada', () => {
    expect(urlImagenPortal(IMAGEN, 640)).toBe(
      `/api/public/portal/imagen?w=640&url=${encodeURIComponent(IMAGEN)}`
    )
    expect(urlImagenPortal('', 640)).toBe('')
    // Una ruta relativa se sirve tal cual: el optimizador no puede con ella.
    expect(urlImagenPortal('/uploads/foto.jpg', 640)).toBe('/uploads/foto.jpg')
    expect(srcSetImagenPortal('/uploads/foto.jpg', ANCHOS_TARJETA)).toBe('')
  })

  it('compone el srcset con un descriptor por ancho', () => {
    const srcSet = srcSetImagenPortal(IMAGEN, ANCHOS_TARJETA)
    expect(srcSet.split(', ')).toHaveLength(ANCHOS_TARJETA.length)
    expect(srcSet).toContain(' 320w')
    expect(srcSet).toContain(' 960w')
    expect(srcSetImagenPortal('', ANCHOS_TARJETA)).toBe('')
  })

  it('acota el ancho que acepta el redimensionador', () => {
    expect(anchoImagenPortal('640')).toBe(640)
    expect(anchoImagenPortal(480)).toBe(480)
    expect(anchoImagenPortal('100')).toBeNull()
    expect(anchoImagenPortal('4000')).toBeNull()
    expect(anchoImagenPortal('abc')).toBeNull()
    expect(anchoImagenPortal(null)).toBeNull()
  })

  it('sólo acepta el host permitido o sus subdominios', () => {
    const permitidos = ['images.unsplash.com', 'amazonaws.com']
    expect(esHostDeImagenPermitido('images.unsplash.com', permitidos)).toBe(true)
    expect(esHostDeImagenPermitido('bucket.s3.eu-west-1.amazonaws.com', permitidos)).toBe(true)
    expect(esHostDeImagenPermitido('169.254.169.254', permitidos)).toBe(false)
    expect(esHostDeImagenPermitido('localhost', permitidos)).toBe(false)
    // Termina en «amazonaws.com» pero no es un subdominio suyo.
    expect(esHostDeImagenPermitido('evilamazonaws.com', permitidos)).toBe(false)
    expect(esHostDeImagenPermitido('', permitidos)).toBe(false)
  })

  it('añade el propio origen y los CDN conocidos', () => {
    const hosts = hostsDeImagenPermitidos('localhost:3010')
    expect(hosts).toContain('localhost:3010')
    expect(hosts).toContain('images.unsplash.com')
    expect(hosts).toContain('cloudfront.net')
  })

  it('extrae la portada venga como string o como objeto', () => {
    expect(urlPortadaInmueble([{ url: 'https://x/a.jpg' }])).toBe('https://x/a.jpg')
    expect(urlPortadaInmueble(['https://x/b.jpg'])).toBe('https://x/b.jpg')
    expect(urlPortadaInmueble([])).toBe('')
    expect(urlPortadaInmueble(null)).toBe('')
    expect(urlPortadaInmueble([{ alt: 'sin url' }])).toBe('')
  })
})
