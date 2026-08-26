export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// GET /api/estudiantes - Obtener todos los estudiantes
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    const estudiantes = await prisma.estudiante.findMany({
      where: {
        tenantId: currentUser?.tenantId || undefined,
      },
      include: {
        inscripciones: {
          include: {
            curso: true,
          },
        },
        certificados: {
          include: {
            curso: true,
          },
        },
        _count: {
          select: {
            inscripciones: true,
            certificados: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return NextResponse.json(estudiantes);
  } catch (error) {
    console.error('Error al obtener estudiantes:', error);
    return NextResponse.json({ error: 'Error al obtener estudiantes' }, { status: 500 });
  }
}

// POST /api/estudiantes - Crear un nuevo estudiante
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const body = await request.json();
    console.log('Creando estudiante con data:', body);
    const { 
      nombre, 
      email, 
      telefono,
      primerNombre,
      apellidoPaterno,
      apellidoMaterno,
      pais,
      region,
      zonaHoraria,
      tipoAcceso,
      metodoPagoToken,
      fechaRenovacion,
      tags,
      consentimientoGDPR,
      metadataTecnica
    } = body;

    // Verificar si el estudiante ya existe en este tenant
    const estudianteExistente = await prisma.estudiante.findFirst({
      where: {
        email,
        tenantId: currentUser.tenantId,
      },
    });

    if (estudianteExistente) {
      return NextResponse.json(
        { error: 'Ya existe un estudiante con este email' },
        { status: 400 }
      );
    }

    // Generar la contraseña temporal de acceso al portal (portal /academy)
    const passwordTemporal = randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 9);
    const hashedPassword = await bcrypt.hash(passwordTemporal, 12);
    const emailLower = email.toLowerCase();

    // Buscar o crear la cuenta de acceso (erp_academy_users) vinculada al tenant
    let cuentaAcceso = await prisma.erp_academy_users.findFirst({
      where: { tenantId: currentUser.tenantId, email: emailLower },
    });

    if (!cuentaAcceso) {
      cuentaAcceso = await prisma.erp_academy_users.create({
        data: {
          tenantId: currentUser.tenantId,
          email: emailLower,
          passwordHash: hashedPassword,
          firstName: primerNombre || nombre?.split(' ')[0],
          lastName: apellidoPaterno || apellidoMaterno,
          role: 'LEARNER',
          status: 'ACTIVE',
        } as any,
      });
    }

    const estudiante = await prisma.estudiante.create({
      data: {
        nombre,
        email,
        telefono,
        primerNombre,
        apellidoPaterno,
        apellidoMaterno,
        pais,
        region,
        zonaHoraria,
        tipoAcceso: tipoAcceso || 'free',
        metodoPagoToken,
        fechaRenovacion: fechaRenovacion ? new Date(fechaRenovacion) : null,
        tags: tags || [],
        consentimientoGDPR: consentimientoGDPR || false,
        fechaConsentimiento: consentimientoGDPR ? new Date() : null,
        metadataTecnica,
        tenantId: currentUser.tenantId,
        academyUserId: cuentaAcceso.id,
      },
    });

    return NextResponse.json(
      {
        ...estudiante,
        accesoCreado: !!cuentaAcceso,
        tieneAcceso: true,
        passwordTemporal: cuentaAcceso ? passwordTemporal : null,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error detail al crear estudiante:', error);
    return NextResponse.json({ 
      error: 'Error al crear estudiante',
      details: error?.message || String(error),
      code: error?.code,
    }, { status: 500 });
  }
}
