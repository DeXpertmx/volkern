export const dynamic = 'force-dynamic';

/**
 * Anytimebot Integration Configuration API
 * Manages Anytimebot integration settings for each tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnytimebotConfig } from '@/lib/anytimebot';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Get integration configuration
    const integration = await prisma.anytimebotIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!integration) {
      return NextResponse.json({ configured: false, integration: null });
    }

    // Fetch bot configuration from Anytimebot to verify it's working
    let botConfig = null;
    try {
      botConfig = await getAnytimebotConfig(integration.username);
    } catch (error) {
      console.error('Error fetching Anytimebot config:', error);
    }

    return NextResponse.json({
      configured: true,
      integration: {
        id: integration.id,
        username: integration.username,
        activo: integration.activo,
        webhookSecret: integration.webhookSecret,
        sincronizarLeads: integration.sincronizarLeads,
        sincronizarCitas: integration.sincronizarCitas,
        sincronizarMensajes: integration.sincronizarMensajes,
        fuenteLeads: integration.fuenteLeads,
        estadoLeadsNuevos: integration.estadoLeadsNuevos,
        asignacionAutomatica: integration.asignacionAutomatica,
        usuarioAsignadoId: integration.usuarioAsignadoId,
        whatsappIntegrado: integration.whatsappIntegrado,
        numeroWhatsApp: integration.numeroWhatsApp,
        totalLeadsCapturados: integration.totalLeadsCapturados,
        totalCitasSincronizadas: integration.totalCitasSincronizadas,
        totalMensajesSincronizados: integration.totalMensajesSincronizados,
        ultimaSincronizacion: integration.ultimaSincronizacion,
        fechaCreacion: integration.fechaCreacion,
        botConfig: botConfig, // Include bot info if available
      },
    });

  } catch (error) {
    console.error('Error fetching Anytimebot integration:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración de Anytimebot' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    let {
      username,
      activo,
      webhookSecret,
      sincronizarLeads,
      sincronizarCitas,
      sincronizarMensajes,
      fuenteLeads,
      estadoLeadsNuevos,
      asignacionAutomatica,
      usuarioAsignadoId,
      whatsappIntegrado,
      numeroWhatsApp,
    } = body;

    // Validate required fields
    if (!username) {
      return NextResponse.json(
        { error: 'Username de Anytimebot requerido' },
        { status: 400 }
      );
    }

    // Clean username from URL if provided
    username = username.trim();
    if (username.includes('anytimebot.app')) {
      const match = username.match(/anytimebot\.app\/(?:username\/)?([^\/\?]+)/i);
      if (match) {
        username = match[1];
      }
    }

    // Verify that the Anytimebot username exists and is accessible
    console.log(`[Anytimebot] Verifying username: ${username}`);
    const botConfig = await getAnytimebotConfig(username, 20000); // 20 second timeout
    
    if (!botConfig) {
      console.error(`[Anytimebot] Failed to verify username: ${username}`);
      return NextResponse.json(
        { 
          error: `No se pudo verificar el username "${username}" en Anytimebot`,
          details: 'Verifica que:\n1. El username sea correcto\n2. El bot esté publicado y activo en Anytimebot\n3. La conexión a internet esté funcionando correctamente',
          hint: 'El username aparece en la URL de tu bot: anytimebot.app/USERNAME'
        },
        { status: 400 }
      );
    }
    
    console.log(`[Anytimebot] Successfully verified bot: ${botConfig.name}`);

    // Check if integration already exists
    const existingIntegration = await prisma.anytimebotIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (existingIntegration) {
      // Update existing integration
      const updated = await prisma.anytimebotIntegration.update({
        where: { tenantId: user.tenantId },
        data: {
          username,
          activo: activo !== undefined ? activo : true,
          webhookSecret: webhookSecret || null,
          sincronizarLeads: sincronizarLeads !== undefined ? sincronizarLeads : true,
          sincronizarCitas: sincronizarCitas !== undefined ? sincronizarCitas : true,
          sincronizarMensajes: sincronizarMensajes !== undefined ? sincronizarMensajes : true,
          fuenteLeads: fuenteLeads || 'Anytimebot Chatbot',
          estadoLeadsNuevos: estadoLeadsNuevos || 'nuevo',
          asignacionAutomatica: asignacionAutomatica || false,
          usuarioAsignadoId: usuarioAsignadoId || null,
          whatsappIntegrado: whatsappIntegrado || false,
          numeroWhatsApp: numeroWhatsApp || null,
        },
      });

      // Log audit event
      await prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          accion: 'integracion_actualizada',
          entidad: 'AnytimebotIntegration',
          entidadId: updated.id,
          descripcion: `Integración de Anytimebot actualizada - Username: ${username}`,
          cambiosDespues: { username, botName: botConfig.name },
        },
      });

      return NextResponse.json({
        success: true,
        integration: updated,
        message: 'Integración actualizada exitosamente',
      });
    }

    // Create new integration
    const integration = await prisma.anytimebotIntegration.create({
      data: {
        tenantId: user.tenantId,
        username,
        activo: activo !== undefined ? activo : true,
        webhookSecret: webhookSecret || null,
        sincronizarLeads: sincronizarLeads !== undefined ? sincronizarLeads : true,
        sincronizarCitas: sincronizarCitas !== undefined ? sincronizarCitas : true,
        sincronizarMensajes: sincronizarMensajes !== undefined ? sincronizarMensajes : true,
        fuenteLeads: fuenteLeads || 'Anytimebot Chatbot',
        estadoLeadsNuevos: estadoLeadsNuevos || 'nuevo',
        asignacionAutomatica: asignacionAutomatica || false,
        usuarioAsignadoId: usuarioAsignadoId || null,
        whatsappIntegrado: whatsappIntegrado || false,
        numeroWhatsApp: numeroWhatsApp || null,
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'integracion_creada',
        entidad: 'AnytimebotIntegration',
        entidadId: integration.id,
        descripcion: `Integración de Anytimebot configurada - Username: ${username}`,
        cambiosDespues: { username, botName: botConfig.name },
      },
    });

    return NextResponse.json({
      success: true,
      integration,
      message: 'Integración creada exitosamente',
    });

  } catch (error) {
    console.error('Error creating/updating Anytimebot integration:', error);
    return NextResponse.json(
      {
        error: 'Error al configurar integración de Anytimebot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Delete integration
    const deleted = await prisma.anytimebotIntegration.delete({
      where: { tenantId: user.tenantId },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'integracion_eliminada',
        entidad: 'AnytimebotIntegration',
        entidadId: deleted.id,
        descripcion: `Integración de Anytimebot eliminada`,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Integración eliminada exitosamente',
    });

  } catch (error) {
    console.error('Error deleting Anytimebot integration:', error);
    return NextResponse.json(
      { error: 'Error al eliminar integración de Anytimebot' },
      { status: 500 }
    );
  }
}
