export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/tarjetas-digitales/escanear
 * Registra el escaneo de una tarjeta física y crea un lead
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { digitalCard: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asociado' },
        { status: 400 }
      );
    }

    if (!user.digitalCard) {
      return NextResponse.json(
        { error: 'Primero debes crear tu tarjeta digital' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      imagenUrl,
      nombre,
      empresa,
      puesto,
      telefono,
      email,
      datosAdicionales,
    } = body;

    // Validar que al menos tengamos nombre
    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    // Crear el lead desde la tarjeta escaneada
    let leadId = null;
    if (email || telefono) {
      // Buscar si ya existe un lead con ese email o teléfono
      const existingLead = await prisma.lead.findFirst({
        where: {
          tenantId: user.tenantId,
          OR: [
            email ? { email } : {},
            telefono ? { telefono } : {},
          ].filter(obj => Object.keys(obj).length > 0),
        },
      });

      if (existingLead) {
        leadId = existingLead.id;
        // Actualizar el lead existente
        // Obtener tags actuales y agregar 'tarjeta-escaneada' si no existe
        const currentTags = existingLead.tags ? JSON.parse(existingLead.tags) : [];
        if (!currentTags.includes('tarjeta-escaneada')) {
          currentTags.push('tarjeta-escaneada');
        }
        
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            nombre: nombre || existingLead.nombre,
            empresa: empresa || existingLead.empresa,
            cargo: puesto || existingLead.cargo,
            telefono: telefono || existingLead.telefono,
            email: email || existingLead.email,
            notas: `${existingLead.notas || ''}\n[Tarjeta escaneada el ${new Date().toLocaleDateString()}]`,
            tags: JSON.stringify(currentTags),
            scoreValue: (existingLead.scoreValue || 0) + 10,
            fechaUltimaActividad: new Date(),
          },
        });
      } else {
        // Crear un nuevo lead
        const newLead = await prisma.lead.create({
          data: {
            tenantId: user.tenantId,
            asignadoA: user.id,
            nombre,
            empresa,
            cargo: puesto,
            telefono,
            email: email || `tarjeta-${Date.now()}@temp.volkern.com`,
            fuente: 'tarjeta-fisica',
            estado: 'nuevo',
            scoreValue: 50,
            notas: `Lead creado desde tarjeta física escaneada el ${new Date().toLocaleDateString()}`,
            tags: JSON.stringify(['tarjeta-escaneada']),
          },
        });
        leadId = newLead.id;
      }
    }

    // Registrar el escaneo
    const scannedCard = await prisma.scannedCard.create({
      data: {
        digitalCardId: user.digitalCard.id,
        tenantId: user.tenantId,
        leadId,
        imagenUrl,
        datosExtraidos: {
          nombre,
          empresa,
          puesto,
          telefono,
          email,
          ...datosAdicionales,
        },
        nombreExtraido: nombre,
        empresaExtraida: empresa,
        puestoExtraido: puesto,
        telefonoExtraido: telefono,
        emailExtraido: email,
        estado: 'completado',
      },
    });

    // Actualizar estadísticas de la tarjeta
    await prisma.digitalCard.update({
      where: { id: user.digitalCard.id },
      data: {
        totalEscaneos: {
          increment: 1,
        },
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'escanear',
        entidad: 'tarjeta_fisica',
        entidadId: scannedCard.id,
        descripcion: `Escaneó una tarjeta física: ${nombre}${empresa ? ` de ${empresa}` : ''}`,
      },
    });

    return NextResponse.json({
      success: true,
      scannedCard,
      leadId,
      message: 'Tarjeta escaneada y lead creado exitosamente',
    });
  } catch (error) {
    console.error('Error al escanear tarjeta:', error);
    return NextResponse.json(
      { error: 'Error al procesar la tarjeta escaneada' },
      { status: 500 }
    );
  }
}
