/**
 * Servicio de Provisionamiento Automático de Tenants
 * Orquesta la creación de cuenta en Chatwoot + Telegram obligatorio
 */

import { prisma } from '@/lib/db';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { encrypt } from '@/lib/core/crypto';
import { registerDomain, verifyDomain, buildTenantEmailDomain } from '@/lib/resend-domains';
import { getRootZoneId, configureEmailDnsRecords } from '@/lib/cloudflare-dns';
import { SUPPORTED_CURRENCIES, type Currency } from '@/lib/insurance/currency';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export interface TenantProvisioningInput {
    empresa: string;
    subdomain: string;
    email: string;
    password: string;
    /**
     * Credenciales del bot de Telegram (opcional desde 2026-08-09).
     *
     * ANTES: era obligatorio. El flujo `/api/tenants/create` rechazaba
     * cualquier creación sin `telegram`. Eso bloqueó a brokers que querían
     * usar Volkern sin Telegram (e.g. sólo email corporativo + webchat).
     *
     * AHORA: opcional. Si se omite, el provisioner salta los pasos 3-7
     * (creación de inbox + canal + webhook en Chatwoot) y sólo crea el
     * tenant + usuario + dominio. El broker puede conectar Telegram
     * después vía `/admin/partner-onboarding` o `addWhatsAppChannel` análogo.
     *
     * IMPORTANTE: para preservar compat con integraciones existentes que
     * sí mandan Telegram, los pasos condicionales no son opcionales si
     * la propiedad viene — sólo si NO viene.
     */
    telegram?: {
        botName: string;  // @mi_empresa_bot
        botToken: string; // 123456:ABCdef...
    };
    /**
     * Moneda preferida del tenant (la `Tenant.moneda` que usa el portfolio ejecutivo).
     * Si se omite, defaultea a 'MXN' (la regla ESLint
     * `eslint-rules/no-hardcoded-currency-fallback` se asegura de que ningún
     * literal `'MXN'` quede en posiciones de fallback dentro de los archivos
     * del vertical; aquí el default se aplica sólo al crear el tenant vía API).
     */
    moneda?: Currency;
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
 * Variantes de respuesta cuando el input NO incluye Telegram.
 *
 * Antes: Telegram era obligatorio y el provisioner fallaba con
 *   INVALID_TELEGRAM_TOKEN. Ahora puede proceder sin Telegram y devolver
 *   `telegramSkipped: true` para que el caller sepa que el broker necesita
 *   configurar el bot después.
 */
export interface TenantProvisioningSuccess {
    success: true;
    tenantId: string;
    chatwootAccountId?: number;
    telegramInboxId?: number;
    /** true cuando se omitó Telegram en el input. */
    telegramSkipped: boolean;
}

export type ProvisioningResult = TenantProvisioningSuccess | TenantProvisioningResult;

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
    const { empresa, subdomain, email, password, telegram, moneda } = input;
    
    console.log('[Provisioner] Starting provisioning for:', empresa);

    // ── Validar moneda (si vino en el payload) ───────────────────────────
    // El default 'MXN' es el del schema y NO es un literal en una posición de
    // fallback dentro de un componente/route insurance, así que la regla
    // `eslint-rules/no-hardcoded-currency-fallback` no lo bloquea. Se aplica
    // aquí como default del provisioner, no como decision de UI.
    const monedaFinal: Currency =
      (moneda && SUPPORTED_CURRENCIES.includes(moneda as Currency)
        ? (moneda as Currency)
        : 'MXN');

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

        // Validar token de Telegram (sólo si se proporcionó). Si falta, ok — el
        // broker puede configurarlo después via /admin/partner-onboarding.
        if (telegram && (telegram.botName || telegram.botToken)) {
            if (!telegram.botName || !telegram.botToken) {
                return {
                    success: false,
                    error: {
                        code: 'TELEGRAM_INCOMPLETE',
                        message: 'Si proporcionas Telegram, debes incluir botName Y botToken.',
                        step: 'telegram_validation',
                    },
                };
            }
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

    // Indica si el flujo de Telegram se saltó (broker admin sin bot).
    const telegramProvided = !!(telegram && telegram.botName && telegram.botToken);

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
                moneda: monedaFinal,
                // Trazabilidad de la fuente: si vino moneda explícita en el body
                // del endpoint, marcamos EXPLICIT; si cayó al default MXN porque
                // no se envió, marcamos FALLBACK. Esto da al superadmin una
                // queries programática para distinguir tenants bien configurados
                // de los que heredaron el default sin pasar por el onboarding.
                monedaInferida: monedaFinal,
                monedaInferenciaSource: moneda ? 'EXPLICIT' : 'FALLBACK',
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

    // PASO 4: Crear inbox de Telegram en Chatwoot (sólo si se proporcionó).
    let telegramInboxId: number | undefined;
    if (telegramProvided) {
        try {
            const inbox = await chatwootApi.createTelegramInbox(
                chatwootAccountId,
                telegram!.botToken,
                telegram!.botName,
                chatwootApiToken
            );
            telegramInboxId = inbox.id;
            console.log('[Provisioner] Telegram inbox created:', telegramInboxId);
        } catch (error: any) {
            console.error('[Provisioner] Telegram inbox error:', error);
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
    } else {
        // Sin Telegram: saltamos este paso. El hermano `addTelegramChannel`
        // (no implementado aún, ver follow-ups) puede crearlo después.
        console.log('[Provisioner] Telegram skipped (no bot en input). Broker puede configurar después.');
        telegramInboxId = undefined;
    }

    // PASO 5: Guardar configuración de Nexus (sólo si se creó Chatwoot).
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/api/webhooks/nexus-sync`;
    if (telegramProvided) {
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
        }
    } else {
        console.log('[Provisioner] MessagingHubConfig skipped (no Telegram en input).');
    }

    // PASO 6: Guardar canal de Telegram (sólo si se proporcionó).
    if (telegramProvided) {
        try {
            await prisma.channel.create({
                data: {
                    tenantId,
                    type: 'telegram',
                    name: `Telegram - ${telegram!.botName}`,
                    config: {
                        botToken: encrypt(telegram!.botToken),
                        botName: telegram!.botName,
                    },
                    chatwootInboxId: telegramInboxId!,
                    isActive: true,
                    isDefault: true,
                }
            });
            console.log('[Provisioner] Channel created');
        } catch (error: any) {
            console.error('[Provisioner] Channel creation error:', error);
        }
    } else {
        console.log('[Provisioner] Channel skipped (no Telegram en input).');
    }

    // PASO 7: Configurar webhook en Chatwoot (sólo si se creó la config de Nexus).
    if (telegramProvided) {
        try {
            await chatwootApi.configureWebhook(chatwootAccountId, webhookUrl, chatwootApiToken);
            console.log('[Provisioner] Webhook configured');
        } catch (error: any) {
            console.error('[Provisioner] Webhook configuration error:', error);
        }
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
        telegramSkipped: !telegramProvided,
        // Discriminación TypeScript-narrow-friendly: si telegramInboxId está
        // definido el broker lo configuró, si no, fue skipped. Lo dejamos
        // como opcional aunque TS no narrowe desde el union — los callers
        // usan `telegramSkipped` para ramificar.
    } as TenantProvisioningSuccess;
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
