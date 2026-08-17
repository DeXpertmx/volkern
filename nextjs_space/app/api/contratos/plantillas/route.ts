export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

const DEFAULT_TEMPLATES = [
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
];

async function seedDefaultTemplates(tenantId: string) {
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
    });
  } catch (error: any) {
    console.warn('No se pudieron sembrar plantillas por defecto:', error.message);
  }
}

/**
 * Actualiza las plantillas de sistema (esPorDefecto) que quedaron con el
 * clausulado anterior (sin placeholders) para que reciban las cláusulas
 * dinámicas actuales. No toca plantillas personalizadas del tenant.
 */
async function upgradeDefaultTemplates(tenantId: string) {
  try {
    const deSistema = await prisma.contratoTemplate.findMany({
      where: { tenantId, esPorDefecto: true },
    });
    for (const plantilla of deSistema) {
      // Solo actualizar si aún no trae placeholders (es la versión vieja)
      if (plantilla.clausulas && !plantilla.clausulas.includes('{{')) {
        const nueva = DEFAULT_TEMPLATES.find((t) => t.nombre === plantilla.nombre);
        if (nueva) {
          await prisma.contratoTemplate.update({
            where: { id: plantilla.id },
            data: {
              descripcion: nueva.descripcion,
              clausulas: nueva.clausulas,
              condicionesPago: nueva.condicionesPago,
            },
          });
        }
      }
    }
  } catch (error: any) {
    console.warn('No se pudieron actualizar las plantillas por defecto:', error.message);
  }
}

// GET /api/contratos/plantillas - Listar plantillas del tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Primera visita: sembrar las plantillas por defecto del sistema
    const existentes = await prisma.contratoTemplate.count({ where: { tenantId } });
    if (existentes === 0) {
      await seedDefaultTemplates(tenantId);
    } else {
      // Tenants ya existentes: actualizar las de sistema que quedaron viejas
      await upgradeDefaultTemplates(tenantId);
    }

    const plantillas = await prisma.contratoTemplate.findMany({
      where: { tenantId, activo: true },
      orderBy: [{ esPorDefecto: 'desc' }, { nombre: 'asc' }],
    });
    return NextResponse.json({ plantillas });
  } catch (error: any) {
    console.error('Error listando plantillas de contrato:', error.message);
    return NextResponse.json({ error: 'Error al listar plantillas' }, { status: 500 });
  }
});

// POST /api/contratos/plantillas - Crear plantilla
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    const nombre = (body.nombre || '').trim();
    if (!nombre) {
      return NextResponse.json({ error: 'El nombre de la plantilla es requerido' }, { status: 400 });
    }

    const plantilla = await prisma.contratoTemplate.create({
      data: {
        tenantId,
        nombre,
        tipo: body.tipo || 'servicio',
        descripcion: body.descripcion || null,
        clausulas: body.clausulas || null,
        condicionesPago: body.condicionesPago || null,
      },
    });

    return NextResponse.json({ plantilla }, { status: 201 });
  } catch (error: any) {
    console.error('Error creando plantilla de contrato:', error.message);
    return NextResponse.json({ error: 'Error al crear la plantilla' }, { status: 500 });
  }
});
