// Agregación de la analítica del portal.
//
// Lo que importa: que un evento de plantilla desconocida no caiga fuera del
// desglose, y que el total de la red sea la suma de las filas sin perder el
// reparto por plantilla.
import { describe, it, expect } from 'vitest'
import {
  agregarCierres,
  agregarEventos,
  divisaPredominante,
  metricasVacias,
  origenDeCierre,
  sumarMetricas,
  type MetricasPortal,
} from '@/lib/real-estate/portal-analytics'
import { esEventoPortal } from '@/lib/real-estate/portal-eventos'

function mapaInicial(ids: string[]): Map<string, MetricasPortal> {
  return new Map(ids.map((id) => [id, metricasVacias()]))
}

describe('eventos del portal', () => {
  it('solo acepta los tipos conocidos', () => {
    expect(esEventoPortal('visita_portada')).toBe(true)
    expect(esEventoPortal('clic_contacto')).toBe(true)
    expect(esEventoPortal('compra')).toBe(false)
    expect(esEventoPortal(null)).toBe(false)
  })

  it('suma visitas y clics por cuenta y por plantilla', () => {
    const metricas = mapaInicial(['matriz', 'oficina'])

    agregarEventos(metricas, [
      { tenantId: 'matriz', tipo: 'visita_portada', plantilla: 'foto', total: 10 },
      { tenantId: 'matriz', tipo: 'visita_ficha', plantilla: 'foto', total: 30 },
      { tenantId: 'matriz', tipo: 'clic_contacto', plantilla: 'foto', total: 3 },
      { tenantId: 'oficina', tipo: 'visita_portada', plantilla: 'marca', total: 20 },
      { tenantId: 'oficina', tipo: 'clic_contacto', plantilla: 'marca', total: 5 },
    ])

    const matriz = metricas.get('matriz')!
    expect(matriz.visitasPortada).toBe(10)
    expect(matriz.visitasFichas).toBe(30)
    expect(matriz.clicsContacto).toBe(3)
    expect(matriz.porPlantilla.foto.visitasFichas).toBe(30)
    expect(matriz.porPlantilla.marca.visitasPortada).toBe(0)

    const oficina = metricas.get('oficina')!
    expect(oficina.porPlantilla.marca.clicsContacto).toBe(5)
    expect(oficina.porPlantilla.foto.clicsContacto).toBe(0)
  })

  it('una plantilla desconocida cuenta como la de por defecto', () => {
    const metricas = mapaInicial(['cuenta'])
    agregarEventos(metricas, [
      { tenantId: 'cuenta', tipo: 'visita_portada', plantilla: 'cartelera', total: 7 },
    ])

    const fila = metricas.get('cuenta')!
    expect(fila.visitasPortada).toBe(7)
    expect(fila.porPlantilla.foto.visitasPortada).toBe(7)
  })

  it('el total de la red suma las filas y conserva el reparto por plantilla', () => {
    const a = metricasVacias()
    a.visitasPortada = 10
    a.leads = 2
    a.porPlantilla.foto.visitasPortada = 10
    const b = metricasVacias()
    b.visitasFichas = 5
    b.operaciones = 1
    b.porPlantilla.marca.visitasFichas = 5

    const red = sumarMetricas([a, b])
    expect(red.visitasPortada).toBe(10)
    expect(red.visitasFichas).toBe(5)
    expect(red.leads).toBe(2)
    expect(red.operaciones).toBe(1)
    expect(red.porPlantilla.foto.visitasPortada).toBe(10)
    expect(red.porPlantilla.marca.visitasFichas).toBe(5)
  })
})

describe('cierres atribuidos al portal', () => {
  it('atribuye cada cierre a su canal y suma su valor', () => {
    const metricas = mapaInicial(['oficina'])

    agregarCierres(metricas, [
      { tenantId: 'oficina', canal: 'whatsapp', valor: 250000, moneda: 'MXN' },
      { tenantId: 'oficina', canal: 'whatsapp', valor: 180000, moneda: 'MXN' },
      { tenantId: 'oficina', canal: 'qr', valor: 90000, moneda: 'MXN' },
    ])

    const fila = metricas.get('oficina')!
    expect(fila.operaciones).toBe(3)
    expect(fila.valorCerrado).toBe(520000)
    expect(fila.porOrigen.whatsapp).toEqual({
      operaciones: 2,
      valorCerrado: 430000,
      operacionesOtrasDivisas: 0,
    })
    expect(fila.porOrigen.qr).toEqual({
      operaciones: 1,
      valorCerrado: 90000,
      operacionesOtrasDivisas: 0,
    })
    expect(fila.porOrigen.email.operaciones).toBe(0)
    expect(fila.monedaPrincipal).toBe('MXN')
    expect(fila.porMoneda).toEqual({
      MXN: { operaciones: 3, valorCerrado: 520000 },
    })
  })

  it('no suma importes de divisas distintas: la fila tiene una sola divisa', () => {
    const metricas = mapaInicial(['oficina'])

    agregarCierres(metricas, [
      { tenantId: 'oficina', canal: 'whatsapp', valor: 100000, moneda: 'MXN' },
      { tenantId: 'oficina', canal: 'whatsapp', valor: 50000, moneda: 'mxn' },
      { tenantId: 'oficina', canal: 'qr', valor: 30000, moneda: 'EUR' },
    ])

    const fila = metricas.get('oficina')!
    expect(fila.operaciones).toBe(3)
    expect(fila.monedaPrincipal).toBe('MXN')
    // El cierre en euros cuenta, pero no se suma a los pesos.
    expect(fila.valorCerrado).toBe(150000)
    expect(fila.operacionesOtrasDivisas).toBe(1)
    expect(fila.porOrigen.whatsapp).toEqual({
      operaciones: 2,
      valorCerrado: 150000,
      operacionesOtrasDivisas: 0,
    })
    expect(fila.porOrigen.qr).toEqual({
      operaciones: 1,
      valorCerrado: 0,
      operacionesOtrasDivisas: 1,
    })
    expect(fila.porMoneda).toEqual({
      MXN: { operaciones: 2, valorCerrado: 150000 },
      EUR: { operaciones: 1, valorCerrado: 30000 },
    })
    // Con los mismos cierres gana la divisa que movió más dinero.
    expect(
      divisaPredominante({
        MXN: { operaciones: 1, valorCerrado: 100 },
        EUR: { operaciones: 1, valorCerrado: 200 },
      })
    ).toBe('EUR')
    expect(divisaPredominante({})).toBeNull()
  })

  it('un lead sin canal o con canal desconocido cuenta como portal', () => {
    expect(origenDeCierre(null)).toBe('portal')
    expect(origenDeCierre('feria')).toBe('portal')
    expect(origenDeCierre('WhatsApp')).toBe('whatsapp')

    const metricas = mapaInicial(['oficina'])
    agregarCierres(metricas, [
      { tenantId: 'oficina', canal: null, valor: 100000, moneda: 'MXN' },
      { tenantId: 'oficina', canal: 'cartel', valor: 50000, moneda: 'MXN' },
    ])

    const fila = metricas.get('oficina')!
    expect(fila.porOrigen.portal).toEqual({
      operaciones: 1,
      valorCerrado: 100000,
      operacionesOtrasDivisas: 0,
    })
    expect(fila.porOrigen.cartel).toEqual({
      operaciones: 1,
      valorCerrado: 50000,
      operacionesOtrasDivisas: 0,
    })
    expect(fila.monedaPrincipal).toBe('MXN')

    // Un cierre sin divisa no se puede sumar a ninguna: se cuenta aparte.
    const sinDivisa = mapaInicial(['otra'])
    agregarCierres(sinDivisa, [{ tenantId: 'otra', canal: null, valor: 70000 }])
    const otra = sinDivisa.get('otra')!
    expect(otra.monedaPrincipal).toBeNull()
    expect(otra.valorCerrado).toBe(0)
    expect(otra.operacionesOtrasDivisas).toBe(1)
  })

  it('el total de la red conserva cierres y valor por origen', () => {
    const a = metricasVacias()
    const b = metricasVacias()
    agregarCierres(
      new Map([
        ['a', a],
        ['b', b],
      ]),
      [
        { tenantId: 'a', canal: 'whatsapp', valor: 100, moneda: 'EUR' },
        { tenantId: 'b', canal: 'whatsapp', valor: 300, moneda: 'EUR' },
        { tenantId: 'b', canal: null, valor: 50, moneda: 'EUR' },
      ]
    )

    const red = sumarMetricas([a, b])
    expect(red.operaciones).toBe(3)
    expect(red.valorCerrado).toBe(450)
    expect(red.porOrigen.whatsapp).toEqual({
      operaciones: 2,
      valorCerrado: 400,
      operacionesOtrasDivisas: 0,
    })
    expect(red.porOrigen.portal).toEqual({
      operaciones: 1,
      valorCerrado: 50,
      operacionesOtrasDivisas: 0,
    })
    expect(red.monedaPrincipal).toBe('EUR')
    expect(red.porMoneda.EUR).toEqual({ operaciones: 3, valorCerrado: 450 })
  })

  it('la red no mezcla divisas: suma sólo la principal y cuenta el resto', () => {
    const pesos = metricasVacias()
    const euros = metricasVacias()
    agregarCierres(
      new Map([
        ['pesos', pesos],
        ['euros', euros],
      ]),
      [
        { tenantId: 'pesos', canal: 'whatsapp', valor: 100000, moneda: 'MXN' },
        { tenantId: 'euros', canal: 'whatsapp', valor: 200000, moneda: 'EUR' },
        { tenantId: 'euros', canal: 'qr', valor: 50000, moneda: 'TOTAL_MENTIRA' },
      ]
    )

    const red = sumarMetricas([pesos, euros])
    expect(red.operaciones).toBe(3)
    expect(red.monedaPrincipal).toBe('EUR')
    expect(red.valorCerrado).toBe(200000)
    expect(red.operacionesOtrasDivisas).toBe(2)
    expect(red.porMoneda.MXN).toEqual({ operaciones: 1, valorCerrado: 100000 })
    expect(red.porOrigen.whatsapp).toEqual({
      operaciones: 2,
      valorCerrado: 200000,
      operacionesOtrasDivisas: 1,
    })
    expect(red.porOrigen.qr).toEqual({
      operaciones: 1,
      valorCerrado: 0,
      operacionesOtrasDivisas: 1,
    })
  })
})
