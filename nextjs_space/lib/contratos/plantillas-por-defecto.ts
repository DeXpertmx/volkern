/**
 * Plantillas de contrato que el sistema siembra en cada cuenta.
 *
 * Viven aquí (y no dentro de la ruta) porque hay dos sitios que las necesitan:
 * la lista de plantillas de contratos —que las crea en la primera visita— y la
 * aplicación del alta guiada, que las crea cuando el cliente elige
 * «Contrato desde cotización». Duplicar el clausulado en dos sitios acaba en
 * dos versiones distintas del mismo contrato.
 */

import { prisma } from '@/lib/db'

export const DEFAULT_TEMPLATES = [
  {
    nombre: 'Contrato de servicios',
    tipo: 'servicio',
    descripcion:
      'Prestación de servicios profesionales bajo demanda del cliente, con las condiciones y plazos acordados entre las partes.',
    condicionesPago: 'Pago a 30 días desde la emisión de la factura, salvo acuerdo distinto por escrito.',
    clausulas: [
      'PRIMERA. OBJETO. El prestador se obliga a prestar los servicios descritos en el presente contrato con la diligencia profesional exigible, y {{cliente.nombre}} a pagar el precio pactado en los plazos establecidos.',
      'SEGUNDA. DURACIÓN. El presente contrato tendrá la vigencia pactada ({{fecha.inicio}} al {{fecha.fin}}), prorrogable por acuerdo expreso de ambas partes.',
      'TERCERA. CONFIDENCIALIDAD. Las partes se obligan a mantener en estricta confidencialidad toda la información comercial, técnica o personal que reciban con motivo de este contrato, incluso tras su finalización.',
      'CUARTA. RESCISIÓN. Cualquiera de las partes podrá rescindir este contrato con 30 días de antelación por escrito, quedando liquidadas las obligaciones vencidas.',
      'QUINTA. PROTECCIÓN DE DATOS. El tratamiento de datos personales se realizará conforme a la normativa vigente en materia de protección de datos, siendo el responsable {{empresa.nombre}} con domicilio en {{empresa.direccion}}.',
      'SEXTA. LEGISLACIÓN APLICABLE. El presente contrato se rige por la legislación vigente, y las partes se someten a los juzgados y tribunales de su domicilio.',
    ].join('\n\n'),
  },
  {
    nombre: 'Acuerdo de confidencialidad (NDA)',
    tipo: 'confidencialidad',
    descripcion:
      'Acuerdo para proteger información sensible compartida entre las partes durante negociaciones, evaluación de proyectos o colaboraciones.',
    condicionesPago: 'No aplica condiciones de pago: es un acuerdo sin contraprestación económica.',
    clausulas: [
      'PRIMERA. OBJETO. Este acuerdo tiene por objeto proteger la confidencialidad de la información revelada entre {{empresa.nombre}} y {{cliente.nombre}} con motivo de la relación entre ambas partes.',
      'SEGUNDA. INFORMACIÓN CONFIDENCIAL. Se considera información confidencial toda aquella que, por su naturaleza, contenido o forma, sea razonablemente considerada como tal, incluyendo datos técnicos, comerciales, financieros y de clientes.',
      'TERCERA. OBLIGACIONES. La parte receptora se obliga a no divulgar, copiar, reproducir o utilizar la información confidencial para fines distintos de los previstos, y a protegerla con el mismo grado de diligencia que emplea con su propia información.',
      'CUARTA. VIGENCIA. Las obligaciones de confidencialidad permanecerán en vigor durante la relación y durante un plazo adicional de 3 años tras su finalización.',
      'QUINTA. DEVOLUCIÓN. Al terminar la relación, la parte receptora devolverá o destruirá toda la información confidencial recibida, a elección de la parte reveladora.',
      'SEXTA. LEGISLACIÓN APLICABLE. El presente acuerdo se rige por la legislación vigente, y las partes se someten a los juzgados y tribunales de su domicilio.',
    ].join('\n\n'),
  },
]

/**
 * Siembra las plantillas del sistema si la cuenta no tiene ninguna. Idempotente:
 * si ya hay plantillas propias, no toca nada.
 */
export async function seedDefaultTemplates(tenantId: string) {
  try {
    await prisma.contratoTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({
        tenantId,
        nombre: t.nombre,
        tipo: t.tipo,
        descripcion: t.descripcion,
        clausulas: t.clausulas,
        condicionesPago: t.condicionesPago,
        esPorDefecto: true,
      })),
      skipDuplicates: true,
    })
  } catch (error: any) {
    console.warn('No se pudieron sembrar plantillas por defecto:', error.message)
  }
}
