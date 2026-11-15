// Marca del portal: saneado de lo que escribe la oficina.
//
// Los valores acaban en HTML público, así que un color mal escrito no puede
// romper el contraste ni un teléfono con letras acabar en un WhatsApp inexistente.
import { describe, it, expect } from 'vitest'
import {
  COLOR_MARCA_POR_DEFECTO,
  mensajeWhatsappPropiedad,
  normalizarClaim,
  normalizarColor,
  normalizarLogo,
  normalizarTelefono,
  urlWhatsapp,
} from '@/lib/real-estate/portal-branding'

describe('color de marca', () => {
  it('acepta hex de 6 y lo normaliza a minúsculas', () => {
    expect(normalizarColor('#B45309')).toBe('#b45309')
  })

  it('expande el hex corto', () => {
    expect(normalizarColor('#ABC')).toBe('#aabbcc')
  })

  it('cae al color por defecto si no es hex', () => {
    expect(normalizarColor('azul')).toBe(COLOR_MARCA_POR_DEFECTO)
    expect(normalizarColor('#12345')).toBe(COLOR_MARCA_POR_DEFECTO)
    expect(normalizarColor(null)).toBe(COLOR_MARCA_POR_DEFECTO)
    expect(normalizarColor('')).toBe(COLOR_MARCA_POR_DEFECTO)
  })
})

describe('claim', () => {
  it('recorta espacios y colapsa saltos de línea', () => {
    expect(normalizarClaim('  Inmobiliaria   de\nbarrio ')).toBe('Inmobiliaria de barrio')
  })

  it('limita la longitud sin cortar a mitad de palabra', () => {
    const claim = normalizarClaim('a'.repeat(200))
    expect(claim.length).toBe(140)
    expect(claim.endsWith('…')).toBe(true)
  })

  it('vacío cuando no es texto', () => {
    expect(normalizarClaim(undefined)).toBe('')
    expect(normalizarClaim(42)).toBe('')
  })
})

describe('WhatsApp', () => {
  it('deja sólo dígitos y quita el 00 internacional', () => {
    expect(normalizarTelefono('+34 612 345 678')).toBe('34612345678')
    expect(normalizarTelefono('0034 612 345 678')).toBe('34612345678')
  })

  it('rechaza números imposibles', () => {
    expect(normalizarTelefono('12345')).toBe('')
    expect(normalizarTelefono('+34 612 345 678 999 000 111')).toBe('')
    expect(normalizarTelefono('llámame')).toBe('')
  })

  it('construye el enlace con mensaje codificado', () => {
    const url = urlWhatsapp('34612345678', 'Hola, me interesa el ático')
    expect(url).toBe('https://wa.me/34612345678?text=Hola%2C%20me%20interesa%20el%20%C3%A1tico')
  })

  it('sin teléfono válido no hay enlace', () => {
    expect(urlWhatsapp('', 'hola')).toBeNull()
    expect(urlWhatsapp('abc')).toBeNull()
  })

  it('el mensaje incluye el nombre y la ficha', () => {
    expect(mensajeWhatsappPropiedad('Ático', 'https://x.app/p/a/propiedades/1')).toBe(
      'Hola, me interesa Ático\nhttps://x.app/p/a/propiedades/1'
    )
  })
})

describe('logo', () => {
  it('acepta URL http(s) y rutas locales', () => {
    expect(normalizarLogo('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png')
    expect(normalizarLogo('/uploads/logo.png')).toBe('/uploads/logo.png')
  })

  it('rechaza esquemas raros y valores vacíos', () => {
    expect(normalizarLogo('javascript:alert(1)')).toBe('')
    expect(normalizarLogo('//evil.example/x.png')).toBe('')
    expect(normalizarLogo('logo.png')).toBe('')
    expect(normalizarLogo('')).toBe('')
    expect(normalizarLogo({})).toBe('')
  })
})
