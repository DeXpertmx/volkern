export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/core/crypto';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { tenantId: true }
        });

        if (!user?.tenantId) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
        }

        const config = await prisma.messagingHubConfig.findUnique({
            where: { tenantId: user.tenantId }
        });

        if (!config) {
            return NextResponse.json({});
        }

        return NextResponse.json({
            id: config.id,
            isActive: config.isActive,
            hubBaseUrl: config.hubBaseUrl,
            hubApiToken: '••••••••••••••••',
            hubAccountId: config.hubAccountId || '',
            defaultEndpointId: config.defaultEndpointId || '',
            webhookSecret: config.webhookSecret,
            lastHealthCheck: config.lastHealthCheck
        });
    } catch (error: any) {
        console.error('Error fetching messaging hub config:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { tenantId: true }
        });

        if (!user?.tenantId) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
        }

        const body = await req.json();
        const { isActive, hubBaseUrl, hubApiToken, hubAccountId, defaultEndpointId } = body;

        const existing = await prisma.messagingHubConfig.findUnique({
            where: { tenantId: user.tenantId }
        });

        const webhookSecret = existing?.webhookSecret || crypto.randomBytes(32).toString('hex');

        const tokenToStore = hubApiToken && !hubApiToken.includes('•') 
            ? encrypt(hubApiToken) 
            : existing?.hubApiToken || '';

        const data = {
            isActive: isActive ?? false,
            hubBaseUrl: hubBaseUrl || '',
            hubApiToken: tokenToStore,
            hubAccountId: hubAccountId || null,
            defaultEndpointId: defaultEndpointId || null,
            webhookSecret,
        };

        let config;
        if (existing) {
            config = await prisma.messagingHubConfig.update({
                where: { tenantId: user.tenantId },
                data
            });
        } else {
            config = await prisma.messagingHubConfig.create({
                data: {
                    tenantId: user.tenantId,
                    ...data
                }
            });
        }

        return NextResponse.json({ 
            success: true, 
            id: config.id,
            webhookSecret: config.webhookSecret 
        });
    } catch (error: any) {
        console.error('Error saving messaging hub config:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
