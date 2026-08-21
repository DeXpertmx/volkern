import { describe, expect, it } from 'vitest'
import { buildTaskCalendarMarkup } from '@/lib/telegram/task-calendar'

describe('buildTaskCalendarMarkup (calendario para reprogramar tareas)', () => {
  it('construye el encabezado de navegación con el mes actual y flechas', () => {
    const rows = buildTaskCalendarMarkup('t1', 2026, 7) // agosto 2026 (0-indexado)
    const nav = rows[0]
    expect(nav[0]).toEqual({ text: '◀', callback_data: 'task:cal:t1:2026-07' })
    expect(nav[1]).toEqual({ text: '📅 agosto 2026', callback_data: 'task:cal:t1:2026-08' })
    expect(nav[2]).toEqual({ text: '▶', callback_data: 'task:cal:t1:2026-09' })
  })

  it('cruza el cambio de año correctamente en diciembre y enero', () => {
    const dic = buildTaskCalendarMarkup('t1', 2026, 11)
    expect(dic[0][0].callback_data).toBe('task:cal:t1:2026-11')
    expect(dic[0][2].callback_data).toBe('task:cal:t1:2027-01')

    const ene = buildTaskCalendarMarkup('t1', 2027, 0)
    expect(ene[0][0].callback_data).toBe('task:cal:t1:2026-12')
    expect(ene[0][2].callback_data).toBe('task:cal:t1:2027-02')
  })

  it('incluye la cabecera de días de la semana (lunes primero)', () => {
    const rows = buildTaskCalendarMarkup('t1', 2026, 7)
    expect(rows[1].map((b) => b.text)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D'])
  })

  it('agosto 2026 (sábado 1) empieza la rejilla con 5 celdas vacías y 31 días', () => {
    const rows = buildTaskCalendarMarkup('t1', 2026, 7)
    const dayRows = rows.slice(2, rows.length - 1)
    // 1 de agosto de 2026 es sábado → offset lunes = 5
    const dayCells = dayRows.flat()
    const firstNoops = dayCells.slice(0, 5)
    expect(firstNoops.every((b) => b.text === '·')).toBe(true)
    const realDays = dayCells.filter((b) => b.text !== '·')
    expect(realDays).toHaveLength(31)
    expect(realDays[0]).toEqual({ text: '1', callback_data: 'task:date:t1:2026-08-01' })
    expect(realDays[30]).toEqual({ text: '31', callback_data: 'task:date:t1:2026-08-31' })
  })

  it('todos los días generan callback_data task:date con la fecha ISO correcta', () => {
    const rows = buildTaskCalendarMarkup('t1', 2026, 7)
    const dayRows = rows.slice(2, rows.length - 1)
    const dateButtons = dayRows.flat().filter((b) => b.callback_data.startsWith('task:date:'))
    for (const b of dateButtons) {
      expect(b.callback_data).toMatch(/^task:date:t1:2026-08-\d{2}$/)
    }
  })

  it('termina con el botón de cancelar', () => {
    const rows = buildTaskCalendarMarkup('t1', 2026, 7)
    const last = rows[rows.length - 1]
    expect(last).toEqual([{ text: '↩️ Cancelar', callback_data: 'task:date:t1:cancel' }])
  })

  it('cada fila de la rejilla tiene exactamente 7 botones', () => {
    const rows = buildTaskCalendarMarkup('t1', 2026, 7)
    const dayRows = rows.slice(2, rows.length - 1)
    for (const row of dayRows) {
      expect(row).toHaveLength(7)
    }
  })
})
