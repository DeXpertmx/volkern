/**
 * Servicio de Provisionamiento Automático de Tenants
 * Orquesta la creación de cuenta en Chatwoot + Telegram obligatorio
 */

import { prisma } from '@/lib/db';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { encrypt } from '@/lib/core/crypto';
import { registerDomain, verifyDomain, buildTenantEmailDomain } from '@/lib/resend-domains';
import { getRootZoneId, configureEmailDnsRecords } from '@/lib/cloudflare-dns';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export interface TenantProvisioningInput {
    empresa: string;
    subdomain: string;
    email: string;
    password: string;
    telegram: {
        botName: string;  // @mi_empresa_bot
        botToken: string; // 123456:ABCdef...
    };
}

export interface TenantProvisioningResult {
    success: boolean;
    tenantId?: string;
    chatwootAccountId?: number;
    telegramInboxId?: number;
    error?: {
        code: string;
        message: string;
        step?: string;
    };
}

/**
 * Validar token de bot de Telegram
 */
async function validateTelegramBot(botToken: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const data = await response.json();
        
        if (data.ok && data.result) {
            return {
                valid: true,
                username: data.result.username,
            };
        }
        
        return {
            valid: false,
            error: data.description || 'Token de Telegram inválido',
        };
    } catch (error) {
        return {
            valid: false,
            error: 'Error al validar token de Telegram',
        };
    }
}

/**
 * Generar slug único desde nombre de empresa
 */
function generateSlug(empresa: string): string {
    return empresa
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9]+/g, '-')     // Reemplazar caracteres especiales
        .replace(/^-+|-+$/g, '');        // Quitar guiones al inicio/final
}

/**
 * Provisionar un nuevo tenant con Nexus (Chatwoot) y Telegram
 */
export async function provisionTenant(input: TenantProvisioningInput): Promise<TenantProvisioningResult> {
    const { empresa, subdomain, email, password, telegram } = input;
    
    console.log('[Provisioner] Starting provisioning for:', empresa);

    // PASO 1: Validar datos
    try {
        // Verificar email único
        const existingTenant = await prisma.tenant.findFirst({
            where: {
                OR: [
                    { slug: subdomain },
                    { users: { some: { email } } }
                ]
            }
        });

        if (existingTenant) {
            return {
                success: false,
                error: {
                    code: 'DUPLICATE_TENANT',
                    message: 'Ya existe un tenant con ese subdominio o email',
                    step: 'validation',
                },
            };
        }

        // Validar token de Telegram
        const telegramValidation = await validateTelegramBot(telegram.botToken);
        if (!telegramValidation.valid) {
            return {
                success: false,
                error: {
                    code: 'INVALID_TELEGRAM_TOKEN',
                    message: telegramValidation.error || 'Token de Telegram inválido',
                    step: 'telegram_validation',
                },
            };
        }
    } catch (error: any) {
        console.error('[Provisioner] Validation error:', error);
        return {
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: error.message,
                step: 'validation',
            },
        };
    }

    // PASO 2: Crear tenant en Volkern
    let tenantId: string;
    let userId: string;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const slug = generateSlug(subdomain);

        // Crear tenant
        const tenant = await prisma.tenant.create({
            data: {
                nombre: empresa,
                slug,
                plan: 'trial',
                estado: 'trial',
                nexusEnabled: true,
                vaultSeed: crypto.randomBytes(32).toString('hex'),
                fechaTrialInicio: new Date(),
                fechaTrialFin: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 días
            },
        });

        tenantId = tenant.id;

        // Crear usuario admin
        const user = await prisma.user.create({
            data: {
                email,
                name: empresa,
                password: hashedPassword,
                tenantId: tenant.id,
            }
        });

        userId = user.id;
        
        console.log('[Provisioner] Tenant created:', tenantId);
    } catch (error: any) {
        console.error('[Provisioner] Tenant creation error:', error);
        return {
            success: false,
            error: {
                code: 'TENANT_CREATION_ERROR',
                message: error.message,
                step: 'create_tenant',
            },
        };
    }

    // PASO 3: Crear cuenta en Chatwoot
    let chatwootAccountId: number;
    let chatwootApiToken: string;
    
    try {
        const account = await chatwootApi.createAccount(empresa, 'es');
        chatwootAccountId = account.id;
        
        console.log('[Provisioner] Chatwoot account created:', chatwootAccountId);
        
        // Crear usuario admin en Chatwoot
        await chatwootApi.createAccountUser(chatwootAccountId, email, empresa, 'administrator');
        
        // Por ahora usamos el super admin token para operaciones
        // En producción, deberíamos generar un token específico
        chatwootApiToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN || '';
        
    } catch (error: any) {
        console.error('[Provisioner] Chatwoot account error:', error);
        // Rollback: eliminar tenant
        await prisma.tenant.delete({ where: { id: tenantId } });
        
        return {
            success: false,
            error: {
                code: 'CHATWOOT_ACCOUNT_ERROR',
                message: error.message,
                step: 'create_chatwoot_account',
            },
        };
    }

    // PASO 4: Crear inbox de Telegram en Chatwoot
    let telegramInboxId: number;
    
    try {
        const inbox = await chatwootApi.createTelegramInbox(
            chatwootAccountId,
            telegram.botToken,
            telegram.botName,
            chatwootApiToken
        );
        telegramInboxId = inbox.id;
        
        console.log('[Provisioner] Telegram inbox created:', telegramInboxId);
    } catch (error: any) {
        console.error('[Provisioner] Telegram inbox error:', error);
        // Rollback
        await prisma.tenant.delete({ where: { id: tenantId } });
        
        return {
            success: false,
            error: {
                code: 'TELEGRAM_INBOX_ERROR',
                message: error.message,
                step: 'create_telegram_inbox',
            },
        };
    }

    // PASO 5: Guardar configuración de Nexus
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/api/webhooks/nexus-sync`;
    
    try {
        await prisma.messagingHubConfig.create({
            data: {
                tenantId,
                isActive: true,
                hubBaseUrl: process.env.CHATWOOT_BASE_URL || 'https://volkern.dimension.expert',
                hubApiToken: encrypt(chatwootApiToken),
                hubAccountId: String(chatwootAccountId),
                chatwootAccountId,
                telegramInboxId,
                autoProvisioned: true,
                provisionedAt: new Date(),
                webhookSecret,
                webhookUrl,
            }
        });
        
        console.log('[Provisioner] MessagingHubConfig created');
    } catch (error: any) {
        console.error('[Provisioner] MessagingHubConfig error:', error);
        // Continuar aunque falle, no es crítico
    }

    // PASO 6: Guardar canal de Telegram
    try {
        await prisma.channel.create({
            data: {
                tenantId,
                type: 'telegram',
                name: `Telegram - ${telegram.botName}`,
                config: {
                    botToken: encrypt(telegram.botToken),
                    botName: telegram.botName,
                },
                chatwootInboxId: telegramInboxId,
                isActive: true,
                isDefault: true,
            }
        });
        
        console.log('[Provisioner] Channel created');
    } catch (error: any) {
        console.error('[Provisioner] Channel creation error:', error);
        // Continuar aunque falle
    }

    // PASO 7: Configurar webhook en Chatwoot
    try {
        await chatwootApi.configureWebhook(chatwootAccountId, webhookUrl, chatwootApiToken);
        console.log('[Provisioner] Webhook configured');
    } catch (error: any) {
        console.error('[Provisioner] Webhook configuration error:', error);
        // No es crítico, continuar
    }

    // PASO 8: Provisionar dominio de email (Resend + Cloudflare)
    try {
        const emailDomain = buildTenantEmailDomain(subdomain);
        console.log('[Provisioner] Registering email domain:', emailDomain);

        // 8a. Registrar dominio en Resend
        const resendDomain = await registerDomain(emailDomain);
        
        // 8b. Intentar configurar DNS automáticamente vía Cloudflare
        try {
            const zoneId = await getRootZoneId();
            const dnsResult = await configureEmailDnsRecords(
                zoneId,
                subdomain,
                resendDomain.records
            );
            
            if (dnsResult.configured > 0 && dnsResult.failed === 0) {
                // 8c. Verificar dominio si todos los DNS se configuraron
                const verifiedDomain = await verifyDomain(resendDomain.id);
                
                // 8d. Actualizar tenant con la info del dominio
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        resendDomainId: resendDomain.id,
                        emailDomainStatus: verifiedDomain.status,
                        emailDomainConfiguredAt: new Date(),
                    }
                });
                
                console.log('[Provisioner] Email domain verified:', emailDomain);
            } else {
                // DNS parcial o fallido — guardar para configuración manual
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        resendDomainId: resendDomain.id,
                        emailDomainStatus: 'pending_dns',
                    }
                });
                
                console.warn('[Provisioner] Email domain DNS incomplete:', dnsResult.errors);
            }
        } catch (dnsError: any) {
            // Cloudflare no configurado — guardar para configuración manual
            console.warn('[Provisioner] Cloudflare not configured, email domain needs manual DNS setup');
            
            await prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    resendDomainId: resendDomain.id,
                    emailDomainStatus: 'pending_dns',
                }
            });
        }
    } catch (emailError: any) {
        // Error no crítico — el tenant se crea igual, el email se puede configurar después
        console.error('[Provisioner] Email domain provisioning error:', emailError.message);
    }

    console.log('[Provisioner] Provisioning completed successfully');
    
    return {
        success: true,
        tenantId,
        chatwootAccountId,
        telegramInboxId,
    };
}

/**
 * Añadir canal de WhatsApp a un tenant existente
 */
export async function addWhatsAppChannel(
    tenantId: string,
    config: {
        name: string;
        phoneNumberId: string;
        businessAccountId: string;
        accessToken: string;
    }
): Promise<{ success: boolean; inboxId?: number; error?: string }> {
    try {
        // Obtener configuración de Nexus
        const hubConfig = await prisma.messagingHubConfig.findUnique({
            where: { tenantId }
        });

        if (!hubConfig || !hubConfig.chatwootAccountId) {
            return {
                success: false,
                error: 'Tenant no tiene configuración de Nexus',
            };
        }

        // Desencriptar token
        const { decrypt } = await import('@/lib/core/crypto');
        const apiToken = decrypt(hubConfig.hubApiToken);

        // Crear inbox de WhatsApp
        const inbox = await chatwootApi.createWhatsAppInbox(
            hubConfig.chatwootAccountId,
            config.name,
            config.phoneNumberId,
            config.businessAccountId,
            config.accessToken,
            apiToken
        );

        // Actualizar configuración
        await prisma.messagingHubConfig.update({
            where: { tenantId },
            data: {
                whatsappInboxId: inbox.id,
            }
        });

        // Crear canal
        await prisma.channel.create({
            data: {
                tenantId,
                type: 'whatsapp',
                name: config.name,
                config: {
                    phoneNumberId: config.phoneNumberId,
                    businessAccountId: config.businessAccountId,
                    accessToken: encrypt(config.accessToken),
                },
                chatwootInboxId: inbox.id,
                isActive: true,
                isDefault: false,
            }
        });

        return {
            success: true,
            inboxId: inbox.id,
        };
    } catch (error: any) {
        console.error('[Provisioner] WhatsApp channel error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}
