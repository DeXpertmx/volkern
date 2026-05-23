export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/academy/verify/[hash]
 * Verifica la autenticidad de un certificado mediante su hash de integridad.
 * Ruta pública (No requiere Auth).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { hash: string } }
) {
  try {
    const hash = params.hash;

    const certificado = await prisma.certificado.findFirst({
      where: { integrityHash: hash },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
            tenant: { select: { nombre: true } }
          }
        },
        curso: {
          select: {
            titulo: true,
            descripcion: true,
            nivel: true,
            duracionEstimadaHoras: true
          }
        }
      }
    });

    if (!certificado) {
      return NextResponse.json({ error: 'Certificado no encontrado o hash inválido' }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      certId: certificado.id,
      codigoUnico: certificado.codigoUnico,
      fechaEmision: certificado.fechaEmision,
      fechaExpiracion: certificado.fechaExpiracion,
      estudiante: {
        nombre: certificado.estudiante.nombre,
        empresa: certificado.estudiante.tenant?.nombre
      },
      curso: certificado.curso
    });
  } catch (error) {
    console.error('Error verifying certificate:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
