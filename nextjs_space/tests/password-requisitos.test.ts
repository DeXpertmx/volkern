/**
 * El fallo que vigila este test: el formulario de registro anunciaba «Mínimo 6
 * caracteres» y validaba `password.length < 6`, mientras que el servidor
 * exigía 8 con mayúscula, minúscula y carácter especial. El alta se aceptaba en
 * pantalla y sólo fallaba al enviar, con un mensaje que contradecía al campo.
 *
 * Hay dos cosas que comprobar: que la regla se comporta como está escrita, y
 * que cliente y servidor siguen leyendo la MISMA regla (una copia es un futuro
 * desacuerdo).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PLACEHOLDER,
  passwordValida,
  requisitosPassword,
} from '@/lib/validation/password'

const RAIZ = join(__dirname, '..')

describe('Regla de contraseña (lib/validation/password.ts)', () => {
  it('acepta lo que cumple y rechaza lo que no', () => {
    expect(passwordValida('Abcd1234!')).toBe(true)
    expect(passwordValida('abc123!')).toBe(false) // corta
    expect(passwordValida('Abcdefg12')).toBe(false) // sin carácter especial
    expect(passwordValida('abcdefgh!')).toBe(false) // sin mayúscula
    expect(passwordValida('ABCDEFGH!')).toBe(false) // sin minúscula
    expect(passwordValida('')).toBe(false)
  })

  it('los requisitos listados y la validación total no se contradicen', () => {
    // Un valor es válido por la regex SSI todos sus requisitos están en verde:
    // si divergen, el formulario promete una cosa y el servidor hace otra.
    const muestras = [
      'Abcd1234!',
      'abc123!',
      'Abcdefg12',
      'abcdefgh!',
      'ABCDEFGH!',
      '',
      'Aa1!',
      'Aa1!Aa1!Aa1!',
    ]
    for (const muestra of muestras) {
      const todos = requisitosPassword(muestra).every((r) => r.ok)
      expect(passwordValida(muestra), `«${muestra}»`).toBe(todos)
    }
  })

  it('cada requisito refleja lo que dice evaluar', () => {
    const ok = requisitosPassword('Abcd1234!')
    expect(ok.every((r) => r.ok)).toBe(true)

    const sinMayuscula = requisitosPassword('abcd1234!')
    expect(sinMayuscula.find((r) => r.id === 'mayuscula')!.ok).toBe(false)
    expect(sinMayuscula.filter((r) => r.ok)).toHaveLength(3)
  })

  it('el placeholder nombra TODOS los requisitos, no sólo el primero', () => {
    expect(PASSWORD_PLACEHOLDER).toContain(String(PASSWORD_MIN_LENGTH))
    const minusculas = PASSWORD_PLACEHOLDER.toLowerCase()
    expect(minusculas).toContain('mayúscula')
    expect(minusculas).toContain('minúscula')
    expect(minusculas).toContain('especial')
  })
})

describe('Cliente y servidor leen la misma regla', () => {
  const api = readFileSync(join(RAIZ, 'app', 'api', 'signup', 'route.ts'), 'utf8')
  // Las dos puertas de registro: el alta gratuita y la compra de un plan.
  const paginas = ['app/signup/page.tsx', 'app/checkout/page.tsx'].map((ruta) => ({
    ruta,
    src: readFileSync(join(RAIZ, ruta), 'utf8'),
  }))

  it('el servidor no reimplementa la regex', () => {
    expect(api).toContain('@/lib/validation/password')
    // Cualquier copia literal de la regla fuera del módulo vuelve a desacoplar
    // lo que se enseña de lo que se exige.
    expect(api).not.toMatch(/\(\?=\.\*\[a-z\]/)
    expect(api).not.toMatch(/password\.length\s*<\s*\d/)
  })

  it('los formularios validan con esa misma regla y enseñan los requisitos', () => {
    for (const { ruta, src } of paginas) {
      expect(src, ruta).toContain('@/lib/validation/password')
      expect(src, ruta).toContain('requisitosPassword(')
      // La comprobación vieja del formulario (6 caracteres) no puede volver.
      expect(src, ruta).not.toMatch(/password\.length\s*<\s*6/)
      expect(src, ruta).not.toContain('Mínimo 6 caracteres')
    }
  })
})
