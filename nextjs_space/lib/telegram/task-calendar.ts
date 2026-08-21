/**
 * Calendario inline (inline_keyboard) para elegir la nueva fecha de una tarea
 * por Telegram, reemplazando las opciones fijas por una rejilla navegable.
 *
 * Callbacks:
 *   task:cal:<taskId>:<YYYY-MM>      → navegar a ese mes
 *   task:date:<taskId>:<YYYY-MM-DD>  → elegir ese día
 *   task:date:<taskId>:cancel        → cancelar
 *
 * La semana empieza en lunes; las celdas vacías usan un no-op del mismo mes.
 */

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_SEMANA_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export interface CalendarButton {
  text: string
  callback_data: string
}

export function buildTaskCalendarMarkup(taskId: string, year: number, month: number): CalendarButton[][] {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const noop = { text: '·', callback_data: `task:cal:${taskId}:${monthKey}` }

  // Navegación de mes
  const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
  const prevKey = `${prev.year}-${String(prev.month + 1).padStart(2, '0')}`
  const nextKey = `${next.year}-${String(next.month + 1).padStart(2, '0')}`

  const rows: CalendarButton[][] = [
    [
      { text: '◀', callback_data: `task:cal:${taskId}:${prevKey}` },
      { text: `📅 ${MESES_ES[month]} ${year}`, callback_data: `task:cal:${taskId}:${monthKey}` },
      { text: '▶', callback_data: `task:cal:${taskId}:${nextKey}` },
    ],
    DIAS_SEMANA_ES.map((d) => ({ text: d, callback_data: `task:cal:${taskId}:${monthKey}` })),
  ]

  // Rejilla de días (lunes = primer día)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // 0 = lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let week: CalendarButton[] = []
  for (let i = 0; i < firstWeekday; i++) week.push(noop)
  for (let day = 1; day <= daysInMonth; day++) {
    const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    week.push({ text: String(day), callback_data: `task:date:${taskId}:${dayKey}` })
    if (week.length === 7) {
      rows.push(week)
      week = []
    }
  }
  while (week.length > 0 && week.length < 7) week.push(noop)
  if (week.length > 0) rows.push(week)

  rows.push([{ text: '↩️ Cancelar', callback_data: `task:date:${taskId}:cancel` }])
  return rows
}
