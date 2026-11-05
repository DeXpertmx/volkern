// @vitest-environment jsdom
//
// El fallo que vigila este test: en una cuenta recién creada se abrían a la vez
// el resumen de Gemma y la petición de notificaciones. Dos mensajes compitiendo
// por la atención en el mismo instante. Ahora sólo hay un paso activo: los
// pedidos de permisos esperan a que el briefing del día se resuelva
// (lib/primer-uso.ts), y el briefing avisa en todos sus caminos de salida.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const RAIZ = join(__dirname, '..')

/** Módulo recién cargado: el estado de «ya resuelto» vive en el módulo. */
async function modulo() {
  vi.resetModules()
  return import('@/lib/primer-uso')
}

const fuente = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8')

beforeEach(() => {
  window.localStorage.clear()
})

describe('briefingPendienteHoy / marcarBriefingResuelto', () => {
  it('está pendiente el día que todavía no se ha resuelto', async () => {
    const m = await modulo()
    expect(m.briefingPendienteHoy()).toBe(true)

    window.localStorage.setItem('last_morning_briefing', new Date().toDateString())
    expect(m.briefingPendienteHoy()).toBe(false)
  })

  it('al marcarse resuelto deja de estar pendiente y se avisa por evento', async () => {
    const m = await modulo()
    const oyente = vi.fn()
    window.addEventListener(m.EVENTO_BRIEFING_RESUELTO, oyente)
    expect(m.briefingPendienteHoy()).toBe(true)

    m.marcarBriefingResuelto()

    expect(m.briefingPendienteHoy()).toBe(false)
    expect(oyente).toHaveBeenCalledTimes(1)
    window.removeEventListener(m.EVENTO_BRIEFING_RESUELTO, oyente)
  })

  it('una vez resuelto sigue resuelto aunque cambie el almacenamiento', async () => {
    const m = await modulo()
    m.marcarBriefingResuelto()
    expect(m.briefingPendienteHoy()).toBe(false)

    window.localStorage.removeItem('last_morning_briefing')
    expect(m.briefingPendienteHoy()).toBe(false)
  })
})

describe('Los pasos del primer uso están cableados', () => {
  it('los dos pedidos de notificaciones esperan al briefing', () => {
    for (const fichero of [
      'components/notifications/PushPrompt.tsx',
      'components/providers/PushNotificationInit.tsx',
    ]) {
      const src = fuente(fichero)
      expect(src, `${fichero} debe consultar si el briefing sigue pendiente`)
        .toContain('briefingPendienteHoy()')
      expect(src, `${fichero} debe escuchar la señal de resolución`)
        .toContain('EVENTO_BRIEFING_RESUELTO')
    }
  })

  it('el briefing marca la resolución en su cierre y en sus salidas sin datos', () => {
    const src = fuente('components/dashboard/MorningBriefingModal.tsx')
    // cerrar() + preferencia desactivada + error del servidor + excepción.
    expect(src.match(/marcarBriefingResuelto\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    // Ningún botón del modal puede irse sin pasar por cerrar().
    expect(src).toContain('onClick={cerrar}')
    // Cerrar pasa por la resolución: es el que habilita el paso siguiente.
    expect(src).toMatch(/const cerrar = \(\) => \{\s*marcarBriefingResuelto\(\);/)
  })
})
