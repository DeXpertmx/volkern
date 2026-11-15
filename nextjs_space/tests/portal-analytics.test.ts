// Agregación de la analítica del portal.
//
// Lo que importa: que un evento de plantilla desconocida no caiga fuera del
// desglose, y que el total de la red sea la suma de las filas sin perder el
// reparto por plantilla.
import { describe, it, expect } from 'vitest'
import {
  agregarEventos,
  metricasVacias,
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
