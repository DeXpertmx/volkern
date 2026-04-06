import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Función de encriptación simple
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'volkern-nexus-default-32-chars-key';
function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function main() {
    // Buscar el usuario principal
    const user = await prisma.user.findFirst({
        where: { email: 'bruno.hess@dimensionexpert.com' },
        select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
        console.log('Usuario no encontrado');
        return;
    }

    console.log('TenantId encontrado:', user.tenantId);

    // Datos de Chatwoot
    const hubBaseUrl = 'https://volkern.dimension.expert';
    const hubAccountId = '1';
    const hubApiToken = 'fQuQiCzK1mViDuz6KrX6LtX7';

    // Verificar si ya existe configuración
    const existing = await prisma.messagingHubConfig.findUnique({
        where: { tenantId: user.tenantId }
    });

    const webhookSecret = existing?.webhookSecret || crypto.randomBytes(32).toString('hex');
    const encryptedToken = encrypt(hubApiToken);

    if (existing) {
        // Actualizar
        await prisma.messagingHubConfig.update({
            where: { tenantId: user.tenantId },
            data: {
                isActive: true,
                hubBaseUrl,
                hubApiToken: encryptedToken,
                hubAccountId,
                webhookSecret
            }
        });
        console.log('Configuración actualizada');
    } else {
        // Crear
        await prisma.messagingHubConfig.create({
            data: {
                tenantId: user.tenantId,
                isActive: true,
                hubBaseUrl,
                hubApiToken: encryptedToken,
                hubAccountId,
                webhookSecret
            }
        });
        console.log('Configuración creada');
    }

    console.log('Webhook URL: https://volkern.app/api/webhooks/nexus-sync');
    console.log('Webhook Secret:', webhookSecret);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
