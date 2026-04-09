export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPlaudernBots, getPlaudernBot } from '@/lib/plaudern';

/**
 * GET - Obtener configuración de Plaudern
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 400 }
      );
    }

    // Buscar integración existente
    const integration = await prisma.plaudernIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!integration) {
      return NextResponse.json({
        activo: false,
        message: 'Integración no configurada',
      });
    }

    // Si hay integración, obtener información del bot
    let botInfo = null;
    let botInfoError = null;
    if (integration.botId) {
      try {
        botInfo = await getPlaudernBot(integration.apiKey, integration.botId);
      } catch (error: any) {
        console.error('Error fetching bot info:', error);
        botInfoError = error.message;
      }
    }

    return NextResponse.json({
      activo: integration.activo,
      integration: {
        id: integration.id,
        apiKey: integration.apiKey.substring(0, 8) + '...',  // Ocultar API key parcialmente
        botId: integration.botId,
        botName: integration.botName || botInfo?.name,
        webhookSecret: integration.webhookSecret ? '********' : null,
        sincronizarConversaciones: integration.sincronizarConversaciones,
        sincronizarMensajes: integration.sincronizarMensajes,
        crearLeadsAutomatico: integration.crearLeadsAutomatico,
        fuenteLeads: integration.fuenteLeads,
        estadoLeadsNuevos: integration.estadoLeadsNuevos,
        asignacionAutomatica: integration.asignacionAutomatica,
        usuarioAsignadoId: integration.usuarioAsignadoId,
        knowledgeBaseActiva: integration.knowledgeBaseActiva,
        knowledgeBaseDocumentos: integration.knowledgeBaseDocumentos,
        totalMensajesSincronizados: integration.totalMensajesSincronizados,
        totalConversaciones: integration.totalConversaciones,
        ultimaSincronizacion: integration.ultimaSincronizacion,
        fechaCreacion: integration.fechaCreacion,
      },
      botInfo,
      botInfoError,  // Incluir el error si hubo uno
    });
  } catch (error: any) {
    console.error('Error fetching Plaudern integration:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración de Plaudern', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Crear o actualizar configuración de Plaudern
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      apiKey,
      botId,
      integrationId,
      activo,
      webhookSecret,
      sincronizarConversaciones,
      sincronizarMensajes,
      crearLeadsAutomatico,
      fuenteLeads,
      estadoLeadsNuevos,
      asignacionAutomatica,
      usuarioAsignadoId,
      knowledgeBaseActiva,
    } = body;

    // Validar API key
    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json(
        { error: 'API Key de Plaudern requerida' },
        { status: 400 }
      );
    }

    // Verificar conexión con Plaudern
    console.log('Verificando conexión con Plaudern...');
    const finalIntegrationId = integrationId || 'volkern-prod';
    console.log(`Using Integration ID: ${finalIntegrationId}`);
    
    let botInfo = null;
    let noBots = false;
    try {
      const bots = await getPlaudernBots(apiKey, finalIntegrationId);
      console.log(`✓ Conexión exitosa. Bots encontrados: ${bots.length}`);

      if (bots.length === 0) {
        console.log('⚠️ No se encontraron bots. El usuario deberá crear uno.');
        noBots = true;
      } else if (botId) {
        // Verificar que el bot existe
        botInfo = await getPlaudernBot(apiKey, botId, finalIntegrationId);
        console.log(`✓ Bot verificado: ${botInfo.name}`);
      } else {
        // Usar el primer bot disponible si no se especifica uno
        botInfo = bots[0];
        console.log(`✓ Usando primer bot disponible: ${botInfo.name}`);
      }
    } catch (error: any) {
      console.error('✗ Error de conexión con Plaudern:', error);
      
      // Si el error es específicamente "No bots found", permitir continuar con advertencia
      if (error.message && error.message.includes('No bots found')) {
        console.log('⚠️ API Key válida pero sin bots. Permitiendo guardar integración.');
        noBots = true;
      } else {
        return NextResponse.json(
          {
            error: 'No se pudo conectar con Plaudern',
            details: error.message,
            hint: 'Verifica que tu API Key (JWT Token) sea correcta y tenga los permisos necesarios. Si acabas de obtener el token, asegúrate de que sea un JWT válido que empiece con "eyJ..."',
          },
          { status: 400 }
        );
      }
    }

    // Buscar integración existente
    const existingIntegration = await prisma.plaudernIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    let integration;
    if (existingIntegration) {
      // Actualizar integración existente
      integration = await prisma.plaudernIntegration.update({
        where: { tenantId: user.tenantId },
        data: {
          apiKey,
          botId: botInfo?.id || botId,
          botName: botInfo?.name,
          activo: activo !== undefined ? activo : true,
          webhookSecret,
          sincronizarConversaciones: sincronizarConversaciones !== undefined ? sincronizarConversaciones : true,
          sincronizarMensajes: sincronizarMensajes !== undefined ? sincronizarMensajes : true,
          crearLeadsAutomatico: crearLeadsAutomatico !== undefined ? crearLeadsAutomatico : true,
          fuenteLeads: fuenteLeads || 'Plaudern Chatbot',
          estadoLeadsNuevos: estadoLeadsNuevos || 'nuevo',
          asignacionAutomatica: asignacionAutomatica || false,
          usuarioAsignadoId: usuarioAsignadoId || null,
          knowledgeBaseActiva: knowledgeBaseActiva || false,
          fechaEdicion: new Date(),
        },
        include: {
          usuarioAsignado: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          accion: 'integracion_actualizada',
          entidad: 'PlaudernIntegration',
          entidadId: integration.id,
          descripcion: `Integración de Plaudern actualizada: ${botInfo?.name || 'Bot'}`,
          cambiosDespues: {
            botId: botInfo?.id,
            botName: botInfo?.name,
            configuracion: {
              sincronizarConversaciones,
              sincronizarMensajes,
              crearLeadsAutomatico,
            },
          },
        },
      });

      return NextResponse.json({
        message: noBots 
          ? 'Integración de Plaudern guardada con éxito. ⚠️ No se encontraron bots. Deberás crear un bot en Plaudern para poder usar la integración.' 
          : 'Integración de Plaudern actualizada exitosamente',
        integration: {
          ...integration,
          apiKey: integration.apiKey.substring(0, 8) + '...',
        },
        botInfo,
        warning: noBots ? 'No se encontraron bots. Crea un bot en Plaudern Dashboard para comenzar.' : null,
      });
    } else {
      // Crear nueva integración
      integration = await prisma.plaudernIntegration.create({
        data: {
          tenantId: user.tenantId,
          apiKey,
          botId: botInfo?.id || botId,
          botName: botInfo?.name,
          activo: activo !== undefined ? activo : true,
          webhookSecret,
          sincronizarConversaciones: sincronizarConversaciones !== undefined ? sincronizarConversaciones : true,
          sincronizarMensajes: sincronizarMensajes !== undefined ? sincronizarMensajes : true,
          crearLeadsAutomatico: crearLeadsAutomatico !== undefined ? crearLeadsAutomatico : true,
          fuenteLeads: fuenteLeads || 'Plaudern Chatbot',
          estadoLeadsNuevos: estadoLeadsNuevos || 'nuevo',
          asignacionAutomatica: asignacionAutomatica || false,
          usuarioAsignadoId: usuarioAsignadoId || null,
          knowledgeBaseActiva: knowledgeBaseActiva || false,
        },
        include: {
          usuarioAsignado: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          accion: 'integracion_creada',
          entidad: 'PlaudernIntegration',
          entidadId: integration.id,
          descripcion: `Integración de Plaudern creada: ${botInfo?.name || 'Bot'}`,
          cambiosDespues: {
            botId: botInfo?.id,
            botName: botInfo?.name,
            configuracion: {
              sincronizarConversaciones,
              sincronizarMensajes,
              crearLeadsAutomatico,
            },
          },
        },
      });

      return NextResponse.json({
        message: noBots 
          ? 'Integración de Plaudern creada con éxito. ⚠️ No se encontraron bots. Deberás crear un bot en Plaudern para poder usar la integración.' 
          : 'Integración de Plaudern creada exitosamente',
        integration: {
          ...integration,
          apiKey: integration.apiKey.substring(0, 8) + '...',
        },
        botInfo,
        warning: noBots ? 'No se encontraron bots. Crea un bot en Plaudern Dashboard para comenzar.' : null,
      }, { status: 201 });
    }
  } catch (error: any) {
    console.error('Error saving Plaudern integration:', error);
    return NextResponse.json(
      { error: 'Error al guardar integración de Plaudern', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Eliminar configuración de Plaudern
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 400 }
      );
    }

    // Buscar integración existente
    const integration = await prisma.plaudernIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Integración no encontrada' },
        { status: 404 }
      );
    }

    // Eliminar integración
    await prisma.plaudernIntegration.delete({
      where: { tenantId: user.tenantId },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        accion: 'integracion_eliminada',
        entidad: 'PlaudernIntegration',
        entidadId: integration.id,
        descripcion: `Integración de Plaudern eliminada: ${integration.botName || 'Bot'}`,
      },
    });

    return NextResponse.json({
      message: 'Integración de Plaudern eliminada exitosamente',
    });
  } catch (error: any) {
    console.error('Error deleting Plaudern integration:', error);
    return NextResponse.json(
      { error: 'Error al eliminar integración de Plaudern', details: error.message },
      { status: 500 }
    );
  }
}
