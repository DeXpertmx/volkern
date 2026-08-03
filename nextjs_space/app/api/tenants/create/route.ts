export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { provisionTenant, TenantProvisioningInput } from '@/lib/provisioning/tenant-provisioner';
import { SUPPORTED_CURRENCIES } from '@/lib/insurance/currency';

/**
 * POST /api/tenants/create
 * Crear un nuevo tenant con provisionamiento automático de Nexus
 * 
 * Body:
 * {
 *   empresa: string;
 *   subdomain: string;
 *   email: string;
 *   password: string;
 *   telegram: {
 *     botName: string;      // @mi_empresa_bot
 *     botToken: string;     // 123456:ABCdef...
 *   };
 *   moneda?: string;        // 'USD' | 'EUR' | 'MXN' | ... OPCIONAL. Si se omite,
 *                          // el provisioner defaultea a 'MXN' (la moneda del
 *                          // portfolio ejecutivo se puede cambiar después vía
 *                          // /api/tenant/moneda o scripts/update-tenant-currency.ts).
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        
        // Validación básica
        const { empresa, subdomain, email, password, telegram, moneda } = body;

        // Validar moneda (si viene en el body)
        let monedaNormalizada: string | undefined;
        if (moneda !== undefined && moneda !== null) {
            const m = String(moneda).toUpperCase();
            if (!SUPPORTED_CURRENCIES.includes(m as any)) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'INVALID_MONEDA',
                            message: `Moneda no soportada: ${moneda}. Soportadas: ${SUPPORTED_CURRENCIES.join(', ')}`,
                        },
                    },
                    { status: 400 }
                );
            }
            monedaNormalizada = m;
        }
        
        if (!empresa || !subdomain || !email || !password) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Faltan campos requeridos: empresa, subdomain, email, password'
                    }
                },
                { status: 400 }
            );
        }

        if (!telegram || !telegram.botName || !telegram.botToken) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'TELEGRAM_REQUIRED',
                        message: 'Telegram es obligatorio. Proporciona botName y botToken'
                    }
                },
                { status: 400 }
            );
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'INVALID_EMAIL',
                        message: 'El formato del email es inválido'
                    }
                },
                { status: 400 }
            );
        }

        // Validar longitud de password
        if (password.length < 6) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'WEAK_PASSWORD',
                        message: 'La contraseña debe tener al menos 6 caracteres'
                    }
                },
                { status: 400 }
            );
        }

        // Validar subdomain (solo letras, números y guiones)
        const subdomainRegex = /^[a-z0-9-]+$/;
        if (!subdomainRegex.test(subdomain.toLowerCase())) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: {
                        code: 'INVALID_SUBDOMAIN',
                        message: 'El subdominio solo puede contener letras minúsculas, números y guiones'
                    }
                },
                { status: 400 }
            );
        }

        const input: TenantProvisioningInput = {
            empresa,
            subdomain: subdomain.toLowerCase(),
            email: email.toLowerCase(),
            password,
            telegram: {
                botName: telegram.botName,
                botToken: telegram.botToken,
            },
            ...(monedaNormalizada ? { moneda: monedaNormalizada as any } : {}),
        };

        console.log('[API] Creating tenant:', { empresa, subdomain, email });

        const result = await provisionTenant(input);

        if (!result.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: result.error,
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            tenantId: result.tenantId,
            chatwootAccountId: result.chatwootAccountId,
            telegramInboxId: result.telegramInboxId,
            moneda: monedaNormalizada ?? 'MXN',
            message: 'Tenant creado exitosamente con Telegram configurado',
        });

    } catch (error: any) {
        console.error('[API] Error creating tenant:', error);
        
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
