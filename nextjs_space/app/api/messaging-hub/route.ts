export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/core/db';
import { getTenantContext } from '@/lib/core/auth';
import { encrypt } from '@/lib/core/crypto';

/**
 * API para CRUD de configuración del Hub de Mensajería
 */

export async function GET(request: NextRequest) {
    try {
        const tenant = await getTenantContext();
        if (!tenant?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const config = await (prisma as any).messagingHubConfig.findUnique({
            where: { tenantId: tenant.tenantId }
        });

        return NextResponse.json(config || { isActive: false });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const tenant = await getTenantContext();
        if (!tenant?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const data = await request.json();

        // Encriptar el token si se proporciona
        const processedData = { ...data };
        if (data.hubApiToken) {
            processedData.hubApiToken = encrypt(data.hubApiToken);
        }

        const config = await (prisma as any).messagingHubConfig.upsert({
            where: { tenantId: tenant.tenantId },
            create: {
                ...processedData,
                tenantId: tenant.tenantId,
                webhookSecret: data.webhookSecret || crypto.randomUUID(),
            },
            update: processedData,
        });

        return NextResponse.json(config);
    } catch (error) {
        console.error('[Hub Config] Update error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
