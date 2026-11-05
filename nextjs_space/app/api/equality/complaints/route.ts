
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { generateComplaintHash } from '@/lib/equality/security';
import { TelegramService } from '@/lib/telegram';

/**
 * POST /api/equality/complaints - Enviar una nueva denuncia (Inmutable)
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user?.id;
    const body = await request.json();
    const { description, isAnonymous, category, attachments } = body;

    if (!description) {
      return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 });
    }

    const createdAt = new Date();
    
    // Generar hash de integridad (Inmutabilidad tipo Verifactu)
    const hash = generateComplaintHash({
      description,
      tenantId,
      createdAt
    });

    const complaint = await prisma.equalityComplaint.create({
      data: {
        tenantId,
        description,
        isAnonymous: !!isAnonymous,
        userId: isAnonymous ? null : userId,
        category,
        attachments,
        createdAt,
        hash
      }
    });

    // Notificar al responsable vía Telegram si está configurado
    const config = await prisma.equalityConfig.findUnique({
      where: { tenantId }
    });

    if (config?.isActive && config.telegramBotToken && config.telegramChatId) {
      const message = `🚨 <b>Nueva Denuncia (Canal de Igualdad)</b>\n\n` +
                      `<b>Categoría:</b> ${category || 'No especificada'}\n` +
                      `<b>Anónima:</b> ${isAnonymous ? 'Sí' : 'No'}\n` +
                      `<b>Fecha:</b> ${createdAt.toLocaleString()}\n\n` +
                      `<i>Accede al panel para revisar los detalles de forma segura.</i>`;
      
      await TelegramService.sendMessage(config.telegramBotToken, config.telegramChatId, message);
    }

    return NextResponse.json({ 
      success: true, 
      id: complaint.id, 
      hash: complaint.hash 
    });
  } catch (error) {
    console.error('[ComplaintsAPI] Error:', error);
    return NextResponse.json({ error: 'Error al procesar la denuncia' }, { status: 500 });
  }
}, ['compliance:write']);

/**
 * GET /api/equality/complaints - Listar denuncias (Solo para el responsable)
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    // Verificar si el usuario es el responsable configurado
    const config = await prisma.equalityConfig.findUnique({
      where: { tenantId }
    });

    if (config?.responsibleId !== userId && auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'No autorizado para ver este canal' }, { status: 403 });
    }

    const complaints = await prisma.equalityComplaint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    return NextResponse.json(complaints);
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener denuncias' }, { status: 500 });
  }
}, ['compliance:read']);
