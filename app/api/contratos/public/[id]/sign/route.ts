export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withPublicTenant } from '@/lib/api-key-auth';

// POST /api/contratos/public/[id]/sign - Firmar contrato (cliente)
export const POST = withPublicTenant(async (request, tenantId, params) => {
  try {
    const body = await request.json();
    const { nombreFirma } = body;

    if (!nombreFirma) {
      return NextResponse.json({ error: 'Nombre de firma requerido' }, { status: 400 });
    }

    // El proxy de prisma ya tiene el contexto del tenant.
    // Buscamos por tokenPublico dentro de la base de datos física del tenant.
    const contrato = await prisma.contrato.findFirst({
      where: { tokenPublico: params.id, tenantId: tenantId }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    if (contrato.firmadoPorCliente) {
      return NextResponse.json({ error: 'El contrato ya fue firmado' }, { status: 400 });
    }

    if (!['enviado', 'firmado'].includes(contrato.estado)) {
      return NextResponse.json({ error: 'El contrato no está disponible para firma' }, { status: 400 });
    }

    // Obtener IP del cliente
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';

    // Determinar nuevo estado
    const nuevoEstado = contrato.firmadoPorEmpresa ? 'vigente' : 'firmado';

    const updated = await prisma.contrato.update({
      where: { id: contrato.id },
      data: {
        firmadoPorCliente: true,
        nombreFirmaCliente: nombreFirma,
        fechaFirmaCliente: new Date(),
        ipFirmaCliente: ip,
        estado: nuevoEstado
      }
    });

    // Audit log (DB física del Tenant)
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'cliente',
        accion: 'firmar',
        entidad: 'contrato',
        entidadId: contrato.id,
        descripcion: `Cliente firmó el contrato ${contrato.numero} desde IP: ${ip}`,
      },
    })

    // Si el deal existe, actualizar su etapa (DB física del Tenant)
    if (contrato.dealId) {
      const stage = await prisma.pipelineStage.findFirst({
        where: {
          tenantId: tenantId,
          nombre: { contains: 'Cerrado', mode: 'insensitive' }
        }
      });

      if (stage) {
        await prisma.deal.update({
          where: { id: contrato.dealId },
          data: { etapa: stage.nombre }
        });

        await prisma.dealActivity.create({
          data: {
            dealId: contrato.dealId,
            tenantId: tenantId,
            tipo: 'nota',
            titulo: 'Contrato firmado',
            descripcion: `El cliente ${nombreFirma} firmó el contrato ${contrato.numero}`
          }
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      estado: nuevoEstado 
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error) {
    console.error('Error signing contrato:', error);
    return NextResponse.json({ error: 'Error al firmar' }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
})

// Manejar OPTIONS para CORS (Public API)
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
