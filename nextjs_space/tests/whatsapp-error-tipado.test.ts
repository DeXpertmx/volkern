// @vitest-environment node
/**
 * El desenlace de un envío de WhatsApp viaja como tipo, no dentro del mensaje.
 *
 * Antes, `clasificarFalloDeEnvio` deducía del texto si el proveedor había
 * rechazado o si el resultado era incierto («Error NNN: …»). Ahora
 * `lib/whatsapp.ts` produce `ErrorDeEnvioWhatsapp` con `desenlace`, y el
 * clasificador solo lee ese campo: un texto que antes parecía un rechazo ya no
 * libera la clave.
 */
import { describe, expect, it } from 'vitest'

import { ErrorDeEnvioWhatsapp } from '@/lib/whatsapp'
import { clasificarFalloDeEnvio } from '@/lib/mcp/whatsapp-idempotency'

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

describe('clasificarFalloDeEnvio', () => {
  it('respeta el desenlace tipado', () => {
    expect(clasificarFalloDeEnvio({ error: 'lo que sea', desenlace: 'no_enviado' })).toBe(
      'no_enviado'
    )
    expect(clasificarFalloDeEnvio({ error: 'Error 400: x', desenlace: 'incierto' })).toBe(
      'incierto'
    )
  })

  it('ya no deduce nada del texto: sin desenlace todo es incierto', () => {
    // Este texto, con la heurística anterior, se clasificaba como rechazo.
    expect(clasificarFalloDeEnvio({ error: 'Error 400: número inválido' })).toBe('incierto')
    expect(clasificarFalloDeEnvio({ error: 'Lead no encontrado' })).toBe('incierto')
    expect(clasificarFalloDeEnvio(undefined)).toBe('incierto')
    expect(clasificarFalloDeEnvio('fetch failed')).toBe('incierto')
  })
})
