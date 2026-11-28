// @vitest-environment node
/**
 * El desenlace de un envío de WhatsApp viaja como tipo, no dentro del mensaje.
 *
 * `lib/whatsapp.ts` distingue un rechazo confirmado del proveedor (`no_enviado`)
 * de un resultado incierto (timeout, red, 5xx) mediante `ErrorDeEnvioWhatsapp`,
 * para que quien reintente no tenga que interpretar el texto del error.
 */
import { describe, expect, it } from 'vitest'

import { ErrorDeEnvioWhatsapp } from '@/lib/whatsapp'

describe('ErrorDeEnvioWhatsapp', () => {
  it('lleva el desenlace y el status del proveedor', () => {
    const error = new ErrorDeEnvioWhatsapp('Error 400: número inválido', 'no_enviado', 400)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ErrorDeEnvioWhatsapp')
    expect(error.message).toBe('Error 400: número inválido')
    expect(error.desenlace).toBe('no_enviado')
    expect(error.status).toBe(400)
  })

  it('puede representar un resultado incierto sin status', () => {
    const error = new ErrorDeEnvioWhatsapp('fetch failed', 'incierto')

    expect(error.desenlace).toBe('incierto')
    expect(error.status).toBeUndefined()
  })
})
