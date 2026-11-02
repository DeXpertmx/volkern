/**
 * Materializa en la cuenta lo que el cliente eligió al final del alta.
 *
 * Qué se crea y qué no, y por qué:
 *   - Emails de primer contacto y seguimiento → `EmailTemplate` reales, con
 *     texto editable. Es lo que evita que la primera semana se escriba de cero.
 *   - Contrato desde cotización → las plantillas de contrato del sistema, si la
 *     cuenta no tiene ninguna (misma fuente que usa Contratos, sin duplicar el
 *     clausulado).
 *   - Cotización y briefing → **no** hay registro que crear: la primera es
 *     configuración (condiciones y validez) y el segundo es una decisión de
 *     cada persona. Se devuelven como `manual` con el paso exacto.
 *
 * Es idempotente: aplicar dos veces no duplica plantillas. Y no borra nada de
 * lo que el cliente haya escrito: si la plantilla ya existe, no se sobrescribe.
 */

import { prisma } from '@/lib/db'
import { seedDefaultTemplates } from '@/lib/contratos/plantillas-por-defecto'
import { plantillasDe, type SeleccionEntregables } from './entregables'

export type ResultadoAplicacionPlantilla = 'creada' | 'ya_existia' | 'manual'

export interface AplicadaEntregable {
  id: string
  etiqueta: string
  resultado: ResultadoAplicacionPlantilla
  detalle: string
  enlace: string
}

export interface ResultadoAplicacion {
  /** Informes fijados (no se crea registro: se leen de datos reales). */
  informes: number
  plantillas: AplicadaEntregable[]
  creadas: number
  manuales: number
}

interface ContenidoEmail {
  nombre: string
  categoria: string
  descripcion: string
  asunto: string
  texto: string
}

/**
 * Copy de arranque, corto a propósito: una plantilla larga no se lee, se
 * reescribe. Se edita antes del primer envío y así se avisa en el alta.
 */
const EMAILS: Record<string, ContenidoEmail> = {
  email_primer_contacto: {
    nombre: 'Primer contacto',
    categoria: 'ventas',
    descripcion: 'Primer correo tras recibir una consulta. Corto, con una sola pregunta.',
    asunto: '{nombre}, sobre tu consulta',
    texto: [
      'Hola {nombre},',
      '',
      'Gracias por escribirnos. Antes de proponerte nada quiero entender bien qué necesitas:',
      '',
      '1. ¿Qué tenéis que resolver y para cuándo?',
      '2. ¿Quién más participa en la decisión?',
      '',
      'Si me contestas a esto, te digo en el mismo correo si podemos ayudarte y cómo, o si no somos la opción.',
      '',
      'Un saludo,',
      '{empresa}',
    ].join('\n'),
  },
  email_seguimiento: {
    nombre: 'Seguimiento a los 3 días',
    categoria: 'ventas',
    descripcion: 'Para el «no contestó» de los tres días. Una sola vez, sin insistir.',
    asunto: 'Re: {nombre}, ¿lo dejamos cerrado o lo aparcamos?',
    texto: [
      'Hola {nombre},',
      '',
      'Te escribí hace unos días con la propuesta y no quiero insistir sin sentido.',
      '',
      'Dime en una línea en qué punto está:',
      '- Lo estás viendo y te llamo la semana que viene.',
      '- Lo aparcamos hasta más adelante.',
      '- No es para nosotros.',
      '',
      'Cualquiera de las tres me sirve. Las dos últimas también.',
      '',
      'Un saludo,',
      '{empresa}',
    ].join('\n'),
  },
}

function aHtml(texto: string): string {
  const parrafos = texto
    .split('\n')
    .map((linea) => {
      if (linea.trim() === '') return ''
      const escapada = linea
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<p style="margin: 0 0 12px; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1f2937;">${escapada}</p>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 28px;">
${parrafos}
  </div>
</body>
</html>`
}

async function crearEmailSiFalta(
  tenantId: string,
  userId: string,
  contenido: ContenidoEmail,
): Promise<AplicadaEntregable['resultado']> {
  const existente = await prisma.emailTemplate.findFirst({
    where: { tenantId, nombre: contenido.nombre },
    select: { id: true },
  })
  if (existente) return 'ya_existia'

  await prisma.emailTemplate.create({
    data: {
      tenantId,
      nombre: contenido.nombre,
      descripcion: contenido.descripcion,
      categoria: contenido.categoria,
      asuntoPorDefecto: contenido.asunto,
      contenidoHTML: aHtml(contenido.texto),
      contenidoTexto: contenido.texto,
      variablesDisponibles: JSON.stringify(['nombre', 'empresa']),
      creadoPor: userId,
    },
  })
  return 'creada'
}

export async function aplicarEntregables(
  tenantId: string,
  userId: string,
  seleccion: SeleccionEntregables,
): Promise<ResultadoAplicacion> {
  const aplicadas: AplicadaEntregable[] = []

  for (const plantilla of plantillasDe(seleccion)) {
    if (plantilla.id in EMAILS) {
      const resultado = await crearEmailSiFalta(tenantId, userId, EMAILS[plantilla.id])
      aplicadas.push({
        id: plantilla.id,
        etiqueta: plantilla.etiqueta,
        resultado,
        detalle:
          resultado === 'creada'
            ? 'Creada en Emails, lista para editar con tu firma.'
            : 'Ya tenías una plantilla con este nombre: no se ha tocado.',
        enlace: plantilla.enlace,
      })
      continue
    }

    if (plantilla.id === 'contrato_desde_cotizacion') {
      const existentes = await prisma.contratoTemplate.count({ where: { tenantId } })
      if (existentes > 0) {
        aplicadas.push({
          id: plantilla.id,
          etiqueta: plantilla.etiqueta,
          resultado: 'ya_existia',
          detalle: 'Tu cuenta ya tiene plantillas de contrato: se usan esas.',
          enlace: plantilla.enlace,
        })
        continue
      }
      await seedDefaultTemplates(tenantId)
      aplicadas.push({
        id: plantilla.id,
        etiqueta: plantilla.etiqueta,
        resultado: 'creada',
        detalle: 'Sembradas las plantillas de contrato del sistema. Revísalas con tu asesoría.',
        enlace: plantilla.enlace,
      })
      continue
    }

    aplicadas.push({
      id: plantilla.id,
      etiqueta: plantilla.etiqueta,
      resultado: 'manual',
      detalle: plantilla.primerPaso,
      enlace: plantilla.enlace,
    })
  }

  return {
    informes: seleccion.informes.length,
    plantillas: aplicadas,
    creadas: aplicadas.filter((a) => a.resultado === 'creada').length,
    manuales: aplicadas.filter((a) => a.resultado === 'manual').length,
  }
}
