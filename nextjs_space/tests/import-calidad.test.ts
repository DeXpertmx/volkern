// @vitest-environment node
/**
 * Análisis de calidad de la importación (determinista, sin base de datos).
 *
 * Lo que se fija aquí es la promesa que sostiene todo R2: **nada de esto
 * escribe**, y cada fila sale clasificada con un motivo concreto. Los casos son
 * los que aparecen de verdad en un Excel de cliente: emails mal escritos, NIF
 * que no superan el dígito de control, la misma fila dos veces y el cliente que
 * ya existe pero con otro email.
 */

import { describe, it, expect } from 'vitest'
import {
  analizarImportacion,
  construirCsvCuarentena,
  esNifValido,
  emailValido,
  normalizarNombre,
  similitudNombres,
  type ExistentesImportacion,
} from '@/lib/import/calidad'
import type { ColumnMap, ImportRow } from '@/lib/import/import-types'

const MAPPING_CLIENTES: ColumnMap[] = [
  { sourceField: 'Cliente', targetField: 'nombre' },
  { sourceField: 'E-mail', targetField: 'email' },
  { sourceField: 'CIF', targetField: 'nif' },
  { sourceField: 'Teléfono', targetField: 'telefono' },
  { sourceField: 'País', targetField: 'pais' },
]

const MAPPING_CATALOGO: ColumnMap[] = [
  { sourceField: 'Servicio', targetField: 'nombre' },
  { sourceField: 'Precio', targetField: 'precio' },
  { sourceField: 'Duración', targetField: 'duracion' },
]

const MAPPING_CONTABLE: ColumnMap[] = [
  { sourceField: 'Cuenta', targetField: 'cuenta' },
  { sourceField: 'Saldo', targetField: 'saldo' },
]

function filas(datos: Record<string, string>[]): ImportRow[] {
  return datos.map((data, i) => ({ rowNumber: i + 1, data }))
}

const sinExistentes: ExistentesImportacion = {}

describe('validaciones puras', () => {
  it('reconoce emails válidos y rechaza los que no lo son', () => {
    expect(emailValido('Ana@Empresa.es')).toBe(true)
    expect(emailValido('ana arroba empresa')).toBe(false)
    expect(emailValido('ana@empresa')).toBe(false)
    expect(emailValido('ana@empresa.c')).toBe(false)
  })

  it('valida el dígito de control del NIF español', () => {
    expect(esNifValido('12345678Z')).toBe(true) // DNI
    expect(esNifValido('12345678-A')).toBe(false)
    expect(esNifValido('X1234567L')).toBe(true) // NIE
    expect(esNifValido('A58818501')).toBe(true) // CIF
    expect(esNifValido('B12345678')).toBe(false)
    expect(esNifValido('pasaporte')).toBe(false)
  })

  it('normaliza nombres sin forma jurídica y mide parecido por palabras', () => {
    expect(normalizarNombre('Talleres López, S.L.')).toBe('talleres lopez')
    expect(normalizarNombre('Servicios Informáticos S.A.')).toBe('servicios informaticos')
    expect(similitudNombres('Gestión de redes', 'Gestión de redes sociales')).toBeGreaterThan(0.7)
    expect(similitudNombres('Panadería', 'Fontanería')).toBe(0)
  })
})

describe('clientes', () => {
  it('rechaza email inválido sin tocar las demás filas', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([
        { Cliente: 'Ana', 'E-mail': 'ana@empresa.es', CIF: '12345678Z' },
        { Cliente: 'Beto', 'E-mail': 'beto arroba empresa.es' },
        { Cliente: 'Carla', 'E-mail': 'carla@empresa.es' },
      ]),
    })

    expect(informe.total).toBe(3)
    expect(informe.nuevas).toBe(2)
    expect(informe.rechazadas).toBe(1)
    expect(informe.filas[1].codigo).toBe('EMAIL_INVALIDO')
    expect(informe.filas[1].accion).toBe('rechazada')
  })

  it('rechaza un NIF español que no supera el dígito de control', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([{ Cliente: 'Talleres SL', 'E-mail': 'info@talleres.es', CIF: 'B12345678' }]),
    })

    expect(informe.rechazadas).toBe(1)
    expect(informe.filas[0].codigo).toBe('NIF_INVALIDO')
  })

  it('con país no español no valida el dígito: avisa y sigue', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([
        { Cliente: 'Lisboa Lda', 'E-mail': 'geral@lisboa.pt', CIF: 'PT123456789', País: 'Portugal' },
      ]),
    })

    expect(informe.nuevas).toBe(1)
    expect(informe.filas[0].avisos.join(' ')).toMatch(/extranjero/i)
  })

  it('rechaza la segunda fila repetida dentro del fichero', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([
        { Cliente: 'Ana', 'E-mail': 'ana@empresa.es' },
        { Cliente: 'Ana copia', 'E-mail': 'ANA@empresa.es' },
      ]),
    })

    expect(informe.nuevas).toBe(1)
    expect(informe.filas[1].codigo).toBe('DUPLICADO_FICHERO')
    expect(informe.filas[1].motivo).toMatch(/fila 1/)
  })

  it('un cliente que ya existe por email se actualiza, no se duplica', () => {
    const existentes: ExistentesImportacion = {
      porEmail: new Map([['ana@empresa.es', { id: 'lead-1', nombre: 'Ana' }]]),
    }
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes,
      filas: filas([{ Cliente: 'Ana María', 'E-mail': 'ana@empresa.es' }]),
    })

    expect(informe.actualizadas).toBe(1)
    expect(informe.nuevas).toBe(0)
    expect(informe.filas[0].existenteId).toBe('lead-1')
  })

  it('un cliente que ya existe por NIF también se actualiza', () => {
    const existentes: ExistentesImportacion = {
      porEmail: new Map(),
      porNif: new Map([['B12345678', { id: 'lead-9', nombre: 'Ferretería SA' }]]),
    }
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes,
      // B12345678 no supera el control, así que aquí se usa un CIF válido.
      filas: filas([{ Cliente: 'Ferretería SA', CIF: 'B12345678', 'E-mail': 'nuevo@ferreteria.es' }]),
    })
    expect(informe.rechazadas).toBe(1) // el NIF manda: si no es válido, no se busca

    const valido = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: { porEmail: new Map(), porNif: new Map([['A58818501', { id: 'lead-9', nombre: 'Ferretería SA' }]]) },
      filas: filas([{ Cliente: 'Ferretería SA', CIF: 'A58818501', 'E-mail': 'nuevo@ferreteria.es' }]),
    })
    expect(valido.filas[0].existenteId).toBe('lead-9')
    expect(valido.actualizadas).toBe(1)
  })

  it('mismo nombre con otro email: posible duplicado, y no se escribe salvo que se pida', () => {
    const existentes: ExistentesImportacion = {
      porEmail: new Map([['viejo@talleres.es', { id: 'lead-1', nombre: 'Talleres López S.L.' }]]),
    }
    const base = {
      tipo: 'clients' as const,
      mapping: MAPPING_CLIENTES,
      existentes,
      filas: filas([{ Cliente: 'Talleres Lopez SL', 'E-mail': 'nuevo@talleres.es' }]),
    }

    const porDefecto = analizarImportacion(base)
    expect(porDefecto.posiblesDuplicados).toBe(1)
    expect(porDefecto.nuevas).toBe(0)
    expect(porDefecto.aEscribir).toBe(0)
    expect(porDefecto.filas[0].sePareceA).toBe('Talleres López S.L.')

    const incluidos = analizarImportacion({ ...base, incluirPosiblesDuplicados: true })
    expect(incluidos.aEscribir).toBe(1)
  })

  it('sin email ni NIF se rechaza en vez de crear un duplicado ciego', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([{ Cliente: 'Cliente sin datos' }]),
    })

    expect(informe.rechazadas).toBe(1)
    expect(informe.filas[0].codigo).toBe('CAMPO_OBLIGATORIO')
  })
})

describe('catálogo', () => {
  it('rechaza precios inválidos y negativos', () => {
    const informe = analizarImportacion({
      tipo: 'catalog',
      mapping: MAPPING_CATALOGO,
      existentes: sinExistentes,
      filas: filas([
        { Servicio: 'Auditoría', Precio: 'no aplica' },
        { Servicio: 'Consultoría', Precio: '-30' },
        { Servicio: 'Mantenimiento', Precio: '1.250,50' },
      ]),
    })

    expect(informe.rechazadas).toBe(2)
    expect(informe.filas[0].codigo).toBe('PRECIO_INVALIDO')
    expect(informe.filas[1].codigo).toBe('PRECIO_INVALIDO')
    expect(informe.nuevas).toBe(1)
  })

  it('el mismo servicio con distinta forma jurídica es duplicado en el fichero', () => {
    const informe = analizarImportacion({
      tipo: 'catalog',
      mapping: MAPPING_CATALOGO,
      existentes: sinExistentes,
      filas: filas([
        { Servicio: 'Instalación de aire', Precio: '100' },
        { Servicio: 'Instalacion de aire S.L.', Precio: '120' },
      ]),
    })

    expect(informe.nuevas).toBe(1)
    expect(informe.filas[1].codigo).toBe('DUPLICADO_FICHERO')
  })

  it('un servicio parecido a uno existente se marca, no se funde', () => {
    const existentes: ExistentesImportacion = {
      porNombre: new Map([['gestion de redes', { id: 'srv-1', nombre: 'Gestión de redes' }]]),
    }
    const informe = analizarImportacion({
      tipo: 'catalog',
      mapping: MAPPING_CATALOGO,
      existentes,
      filas: filas([{ Servicio: 'Gestión de redes sociales', Precio: '300' }]),
    })

    expect(informe.posiblesDuplicados).toBe(1)
    expect(informe.filas[0].sePareceA).toBe('Gestión de redes')
    expect(informe.aEscribir).toBe(0)
  })
})

describe('contabilidad', () => {
  const existentes: ExistentesImportacion = { cuentas: new Set(['100', '430']) }

  it('rechaza cuentas sin código, saldos no numéricos y cuentas repetidas', () => {
    const informe = analizarImportacion({
      tipo: 'accounting',
      mapping: MAPPING_CONTABLE,
      existentes,
      filas: filas([
        { Cuenta: '', Saldo: '100' },
        { Cuenta: '100', Saldo: 'mucho' },
        { Cuenta: '430', Saldo: '500' },
        { Cuenta: '430', Saldo: '200' },
      ]),
    })

    expect(informe.rechazadas).toBe(3)
    expect(informe.filas[0].codigo).toBe('CAMPO_OBLIGATORIO')
    expect(informe.filas[1].codigo).toBe('SALDO_INVALIDO')
    expect(informe.filas[3].codigo).toBe('DUPLICADO_FICHERO')
  })

  it('un saldo cero no genera línea y no cuenta como error', () => {
    const informe = analizarImportacion({
      tipo: 'accounting',
      mapping: MAPPING_CONTABLE,
      existentes,
      filas: filas([{ Cuenta: '100', Saldo: '0' }]),
    })

    expect(informe.omitidas).toBe(1)
    expect(informe.rechazadas).toBe(0)
    expect(informe.aEscribir).toBe(0)
  })

  it('una cuenta que no existe en el plan se avisa (se creará al confirmar)', () => {
    const informe = analizarImportacion({
      tipo: 'accounting',
      mapping: MAPPING_CONTABLE,
      existentes,
      filas: filas([{ Cuenta: '629', Saldo: '150' }]),
    })

    expect(informe.nuevas).toBe(1)
    expect(informe.filas[0].avisos.join(' ')).toMatch(/subcuenta/i)
    expect(informe.avisosGenerales.join(' ')).toMatch(/no existen en tu plan contable/i)
  })
})

describe('cuarentena', () => {
  it('exporta las rechazadas con código, motivo y valores originales', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([
        { Cliente: 'Ana', 'E-mail': 'ana@empresa.es' },
        { Cliente: 'Beto, "el del bar"', 'E-mail': 'mal' },
      ]),
    })

    const csv = construirCsvCuarentena(informe)
    const lineas = csv.split('\n')

    expect(lineas[0]).toMatch(/^"fila","codigo","motivo"/)
    expect(lineas).toHaveLength(2)
    expect(lineas[1]).toContain('EMAIL_INVALIDO')
    expect(lineas[1]).toContain('""el del bar""')
  })

  it('sin rechazadas no genera CSV', () => {
    const informe = analizarImportacion({
      tipo: 'clients',
      mapping: MAPPING_CLIENTES,
      existentes: sinExistentes,
      filas: filas([{ Cliente: 'Ana', 'E-mail': 'ana@empresa.es' }]),
    })
    expect(construirCsvCuarentena(informe)).toBe('')
  })
})
