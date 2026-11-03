import { describe, it, expect } from 'vitest'
import { parseFile } from '@/lib/import/column-mapper'

const utf8 = (texto: string) => Buffer.from(texto, 'utf8')

describe('parseFile: CSV de texto', () => {
  it('conserva los acentos en vez de releer el fichero en cp1252', async () => {
    const csv = 'Nombre,Precio\nGestión redes sociales pro,300\nSesión de fisioterapia,45'

    const { headers, rows } = await parseFile(utf8(csv), 'text/csv')

    expect(headers).toEqual(['Nombre', 'Precio'])
    expect(rows[0].Nombre).toBe('Gestión redes sociales pro')
    expect(rows[1].Nombre).toBe('Sesión de fisioterapia')
  })

  it('parsea el CSV con punto y coma que exporta el Excel en español', async () => {
    const csv = 'Nombre;Email\nGrupo Iberia;iberia@ficticio.test'

    const { headers, rows } = await parseFile(utf8(csv), 'application/vnd.ms-excel')

    expect(headers).toEqual(['Nombre', 'Email'])
    expect(rows[0].Email).toBe('iberia@ficticio.test')
  })

  it('ignora el BOM del CSV', async () => {
    const { headers } = await parseFile(utf8('\uFEFFNombre\nHotel Aurora'), 'text/csv')

    expect(headers).toEqual(['Nombre'])
  })
})
