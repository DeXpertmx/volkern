export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/canales
 * Lista todos los canales configurados del tenant
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

        const channels = await prisma.channel.findMany({
            where: {
                tenantId: user.tenantId,
            },
            select: {
                id: true,
                type: true,
                name: true,
                isActive: true,
                isDefault: true,
                chatwootInboxId: true,
                createdAt: true,
                updatedAt: true,
                config: true,
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Sanitizar configs (no exponer tokens)
        const sanitizedChannels = channels.map(channel => {
            const config = channel.config as Record<string, any>;
            const sanitizedConfig: Record<string, any> = {};
            
            // Solo exponer campos no sensibles
            if (config?.botName) sanitizedConfig.botName = config.botName;
            if (config?.phoneNumber) sanitizedConfig.phoneNumber = config.phoneNumber;
            
            return {
                ...channel,
                config: sanitizedConfig,
            };
        });

        return NextResponse.json({
            channels: sanitizedChannels,
            total: channels.length,
        });

    } catch (error: any) {
        console.error('[API] Error listing channels:', error);
        
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
