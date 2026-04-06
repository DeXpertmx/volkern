export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDownloadUrl } from '@/lib/s3';
import QRCode from 'qrcode';

/**
 * GET /api/tarjetas-digitales
 * Obtiene la tarjeta digital del usuario autenticado
 */
export async function GET(request: NextRequest) {
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
      include: {
        digitalCard: true,
      },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asociado' },
        { status: 400 }
      );
    }

    // Helper para verificar si es una S3 key
    const isS3Key = (valor: string | null) => {
      return valor && !valor.startsWith('http') && !valor.startsWith('/') && valor.includes('tarjetas-digitales/');
    };

    // Convertir S3 keys a URLs firmadas
    let digitalCard = user.digitalCard;
    if (digitalCard) {
      // Convertir logoUrl si es S3 key
      if (digitalCard.logoUrl && isS3Key(digitalCard.logoUrl)) {
        try {
          digitalCard = {
            ...digitalCard,
            logoUrl: await getDownloadUrl(digitalCard.logoUrl, 604800), // 7 días
          };
        } catch (error) {
          console.error('Error al obtener URL del logo:', error);
        }
      }

      // Convertir fotoPerfilUrl si es S3 key
      if (digitalCard.fotoPerfilUrl && isS3Key(digitalCard.fotoPerfilUrl)) {
        try {
          digitalCard = {
            ...digitalCard,
            fotoPerfilUrl: await getDownloadUrl(digitalCard.fotoPerfilUrl, 604800), // 7 días
          };
        } catch (error) {
          console.error('Error al obtener URL de la foto de perfil:', error);
        }
      }

      // Convertir bannerUrl si es S3 key
      if (digitalCard.bannerUrl && isS3Key(digitalCard.bannerUrl)) {
        try {
          digitalCard = {
            ...digitalCard,
            bannerUrl: await getDownloadUrl(digitalCard.bannerUrl, 604800), // 7 días
          };
        } catch (error) {
          console.error('Error al obtener URL del banner:', error);
        }
      }
    }

    return NextResponse.json({
      digitalCard,
    });
  } catch (error) {
    console.error('Error al obtener tarjeta digital:', error);
    return NextResponse.json(
      { error: 'Error al obtener la tarjeta digital' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tarjetas-digitales
 * Crea o actualiza la tarjeta digital del usuario
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
      select: { id: true, tenantId: true, digitalCard: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asociado' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      nombre,
      puesto,
      empresa,
      telefonoMovil,
      telefonoOficina,
      email,
      sitioWeb,
      whatsapp,
      telegram,
      redesSociales,
      template,
      fontFamily,
      layoutStyle,
      colorPrimario,
      colorSecundario,
      colorFondo,
      colorTexto,
      backgroundPattern,
      logoUrl,
      fotoPerfilUrl,
      bannerUrl,
      urlUnica: customUrl,
    } = body;

    // Validar campos requeridos
    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    // Validar y normalizar el alias si se proporcionó
    let urlUnica = user.digitalCard?.urlUnica;
    const normalizedAlias = customUrl?.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');

    if (normalizedAlias && normalizedAlias !== urlUnica) {
      // Verificar si el alias ya existe
      const existingAlias = await prisma.digitalCard.findUnique({
        where: { urlUnica: normalizedAlias }
      });

      if (existingAlias) {
        return NextResponse.json(
          { error: 'Este alias ya está en uso. Por favor elige otro.' },
          { status: 400 }
        );
      }
      urlUnica = normalizedAlias;
    }

    if (!urlUnica) {
      urlUnica = `${user.id.substring(0, 8)}-${Date.now()}`;
    }

    // Generar QR Code
    const qrUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/tarjeta/${urlUnica}`;
    const qrCodeData = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
    });

    // Crear o actualizar la tarjeta
    const digitalCard = await prisma.digitalCard.upsert({
      where: {
        userId: user.id,
      },
      update: {
        nombre,
        puesto,
        empresa,
        telefonoMovil,
        telefonoOficina,
        email,
        sitioWeb,
        whatsapp,
        telegram,
        redesSociales: redesSociales || {},
        template: template || 'modern',
        fontFamily: fontFamily || 'Inter',
        layoutStyle: layoutStyle || 'standard',
        colorPrimario: colorPrimario || '#3B82F6',
        colorSecundario: colorSecundario || '#1E40AF',
        colorFondo: colorFondo || '#FFFFFF',
        colorTexto: colorTexto || '#1F2937',
        backgroundPattern: backgroundPattern || 'none',
        logoUrl: logoUrl || null,
        fotoPerfilUrl: fotoPerfilUrl || null,
        bannerUrl: bannerUrl || null,
        urlUnica,
        qrCodeData,
      },
      create: {
        userId: user.id,
        tenantId: user.tenantId,
        nombre,
        puesto,
        empresa,
        telefonoMovil,
        telefonoOficina,
        email,
        sitioWeb,
        whatsapp,
        telegram,
        redesSociales: redesSociales || {},
        template: template || 'modern',
        fontFamily: fontFamily || 'Inter',
        layoutStyle: layoutStyle || 'standard',
        colorPrimario: colorPrimario || '#3B82F6',
        colorSecundario: colorSecundario || '#1E40AF',
        colorFondo: colorFondo || '#FFFFFF',
        colorTexto: colorTexto || '#1F2937',
        backgroundPattern: backgroundPattern || 'none',
        logoUrl: logoUrl || null,
        fotoPerfilUrl: fotoPerfilUrl || null,
        bannerUrl: bannerUrl || null,
        urlUnica,
        qrCodeData,
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: user.digitalCard ? 'actualizar' : 'crear',
        entidad: 'tarjeta_digital',
        entidadId: digitalCard.id,
        descripcion: `${user.digitalCard ? 'Actualizó' : 'Creó'} su tarjeta digital`,
      },
    });

    return NextResponse.json({
      success: true,
      digitalCard,
      message: 'Tarjeta digital guardada exitosamente',
    });
  } catch (error) {
    console.error('Error al guardar tarjeta digital:', error);
    return NextResponse.json(
      { error: 'Error al guardar la tarjeta digital' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tarjetas-digitales
 * Desactiva la tarjeta digital del usuario
 */
export async function DELETE(request: NextRequest) {
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
      select: { id: true, tenantId: true, digitalCard: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asociado' },
        { status: 400 }
      );
    }

    if (!user.digitalCard) {
      return NextResponse.json(
        { error: 'No tienes una tarjeta digital' },
        { status: 404 }
      );
    }

    // Desactivar la tarjeta
    await prisma.digitalCard.update({
      where: { id: user.digitalCard.id },
      data: { activo: false },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'desactivar',
        entidad: 'tarjeta_digital',
        entidadId: user.digitalCard.id,
        descripcion: 'Desactivó su tarjeta digital',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Tarjeta digital desactivada',
    });
  } catch (error) {
    console.error('Error al desactivar tarjeta digital:', error);
    return NextResponse.json(
      { error: 'Error al desactivar la tarjeta digital' },
      { status: 500 }
    );
  }
}