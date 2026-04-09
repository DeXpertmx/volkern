export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/canales/telegram
 * Obtener estado del canal de Telegram
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { tenantId: true }
        });

        if (!user?.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: 'NO_TENANT', message: 'Usuario sin tenant' } },
                { status: 400 }
            );
        }

        const channel = await prisma.channel.findFirst({
            where: {
                tenantId: user.tenantId,
                type: 'telegram',
            },
            select: {
                id: true,
                name: true,
                isActive: true,
                isDefault: true,
                chatwootInboxId: true,
                createdAt: true,
                config: true,
            }
        });

        if (!channel) {
            return NextResponse.json({
                configured: false,
                message: 'Telegram no está configurado',
            });
        }

        // No exponer el token, solo el nombre del bot
        const config = channel.config as Record<string, any>;
        
        return NextResponse.json({
            configured: true,
            channel: {
                id: channel.id,
                name: channel.name,
                isActive: channel.isActive,
                isDefault: channel.isDefault,
                inboxId: channel.chatwootInboxId,
                botName: config?.botName,
                createdAt: channel.createdAt,
            },
        });

    } catch (error: any) {
        console.error('[API] Error getting Telegram status:', error);
        
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Error interno del servidor',
                },
            },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/canales/telegram
 * Actualizar configuración de Telegram (activar/desactivar)
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { tenantId: true }
        });

        if (!user?.tenantId) {
            return NextResponse.json(
                { success: false, error: { code: 'NO_TENANT', message: 'Usuario sin tenant' } },
                { status: 400 }
            );
        }

        const body = await request.json();
        const { isActive } = body;

        const channel = await prisma.channel.findFirst({
            where: {
                tenantId: user.tenantId,
                type: 'telegram',
            },
        });

        if (!channel) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Canal de Telegram no encontrado'
                    }
                },
                { status: 404 }
            );
        }

        // Actualizar estado
        const updated = await prisma.channel.update({
            where: { id: channel.id },
            data: {
                isActive: isActive ?? channel.isActive,
            },
            select: {
                id: true,
                name: true,
                isActive: true,
            }
        });

        return NextResponse.json({
            success: true,
            channel: updated,
            message: `Telegram ${updated.isActive ? 'activado' : 'desactivado'}`,
        });

    } catch (error: any) {
        console.error('[API] Error updating Telegram:', error);
        
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Error interno del servidor',
                },
            },
            { status: 500 }
        );
    }
}
