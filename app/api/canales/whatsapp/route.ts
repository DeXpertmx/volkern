export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addWhatsAppChannel } from '@/lib/provisioning/tenant-provisioner';

/**
 * POST /api/canales/whatsapp
 * Configurar WhatsApp (API oficial de Meta) para el tenant
 * 
 * Body:
 * {
 *   nombreBandeja?: string;        // Nombre amigable
 *   numeroTelefono: string;        // +525512345678
 *   phoneId: string;               // ID del número (Meta)
 *   businessAccountId: string;     // Business Account ID
 *   accessToken: string;           // Access Token de Meta
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } },
                { status: 401 }
            );
        }

        // Obtener tenant del usuario
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
        const { nombreBandeja, numeroTelefono, phoneId, businessAccountId, accessToken } = body;

        // Validaciones
        if (!phoneId || !businessAccountId || !accessToken) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Faltan campos requeridos: phoneId, businessAccountId, accessToken'
                    }
                },
                { status: 400 }
            );
        }

        // Verificar que el tenant tiene Nexus habilitado
        const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { nexusEnabled: true, nombre: true }
        });

        if (!tenant?.nexusEnabled) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'NEXUS_DISABLED',
                        message: 'Nexus no está habilitado para este tenant'
                    }
                },
                { status: 400 }
            );
        }

        // Añadir canal de WhatsApp
        const result = await addWhatsAppChannel(user.tenantId, {
            name: nombreBandeja || `WhatsApp - ${numeroTelefono || tenant.nombre}`,
            phoneNumberId: phoneId,
            businessAccountId,
            accessToken,
        });

        if (!result.success) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'WHATSAPP_CONFIG_ERROR',
                        message: result.error || 'Error configurando WhatsApp'
                    }
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            inboxId: result.inboxId,
            message: 'WhatsApp configurado exitosamente',
        });

    } catch (error: any) {
        console.error('[API] Error configuring WhatsApp:', error);
        
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
 * GET /api/canales/whatsapp
 * Obtener estado del canal de WhatsApp
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
                type: 'whatsapp',
            },
            select: {
                id: true,
                name: true,
                isActive: true,
                chatwootInboxId: true,
                createdAt: true,
            }
        });

        if (!channel) {
            return NextResponse.json({
                configured: false,
                message: 'WhatsApp no está configurado',
            });
        }

        return NextResponse.json({
            configured: true,
            channel: {
                id: channel.id,
                name: channel.name,
                isActive: channel.isActive,
                inboxId: channel.chatwootInboxId,
                createdAt: channel.createdAt,
            },
        });

    } catch (error: any) {
        console.error('[API] Error getting WhatsApp status:', error);
        
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
