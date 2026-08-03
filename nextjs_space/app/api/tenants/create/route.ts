export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { provisionTenant, TenantProvisioningInput } from '@/lib/provisioning/tenant-provisioner';
import { SUPPORTED_CURRENCIES } from '@/lib/insurance/currency';
import { VERTICALS, type Vertical } from '@/lib/plans';

/**
 * POST /api/tenants/create
 * Crear un nuevo tenant con provisionamiento automático de Nexus.
 *
 * Telegram pasó de OBLIGATORIO a OPCIONAL el 2026-08-09. Brokers que no
 * necesiten el bot pueden crear el tenant sin él y configurarlo después
 * vía `/admin/partner-onboarding` o llamando de nuevo al endpoint con
 * `telegram` poblado.
 *
 * Body:
 * {
 *   empresa: string;
 *   subdomain: string;
 *   email: string;
 *   password: string;
 *   telegram?: {                        // OPCIONAL desde 2026-08-09.
 *     botName: string;      // @mi_empresa_bot
 *     botToken: string;     // 123456:ABCdef...
 *   };
 *   moneda?: string;                    // 'USD' | 'EUR' | 'MXN' | ... OPCIONAL.
 *                                       // Si se omite, defaultea a 'MXN' (la
 *                                       // moneda del portfolio ejecutivo se
 *                                       // puede cambiar después vía
 *                                       // /api/tenant/moneda o scripts/update-tenant-currency.ts).
 *   vertical?: 'insurance' | 'real_estate' | 'accounting' | 'general'; // OPCIONAL.
 *                                       Si viene, el provisioner siembra el "starter
 *                                       pack" de módulos vía tenantFeatures para que
 *                                       el broker arranque con la vertical preconfigurada.
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        
        // Validación básica
        const { empresa, subdomain, email, password, telegram, moneda, vertical } = body;

        // Validar vertical (si viene en el body) — debe ser uno de VERTICALS.
        let verticalNormalizado: Vertical | undefined;
        if (vertical !== undefined && vertical !== null) {
            const v = String(vertical).toLowerCase();
            if (!(VERTICALS as readonly string[]).includes(v)) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'INVALID_VERTICAL',
                            message: `Vertical no soportada: ${vertical}. Soportadas: ${VERTICALS.join(', ')}`,
                        },
                    },
                    { status: 400 }
                );
            }
            verticalNormalizado = v as Vertical;
        }

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

        // Telegram OPCIONAL desde 2026-08-09. Si el broker lo quiere ahora,
        // debe venir completo; si no, lo puede configurar después.
        if (telegram && (!telegram.botName || !telegram.botToken)) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'TELEGRAM_INCOMPLETE',
                        message: 'Si proporcionas Telegram, debes incluir botName Y botToken. Si quieres crear el tenant sin Telegram, omite el campo entero.',
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
            // El spread `...(telegram ? { telegram: {...} } : {})` es necesario
            // porque TypeScript no narrowea `telegram` opcional en presencia
            // de la comprobación previa de parcialidad.
            ...(telegram?.botName && telegram?.botToken
                ? { telegram: { botName: telegram.botName, botToken: telegram.botToken } }
                : {}),
            ...(monedaNormalizada ? { moneda: monedaNormalizada as any } : {}),
            ...(verticalNormalizado ? { vertical: verticalNormalizado } : {}),
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

        const successResult = result as any; // narrow from union; both branches include tenantId
        return NextResponse.json({
            success: true,
            tenantId: successResult.tenantId,
            chatwootAccountId: successResult.chatwootAccountId,
            telegramInboxId: successResult.telegramInboxId,
            telegramSkipped: successResult.telegramSkipped ?? false,
            moneda: monedaNormalizada ?? 'MXN',
            monedaInferenciaSource: monedaNormalizada ? 'EXPLICIT' : 'FALLBACK',
            vertical: verticalNormalizado ?? null,
            message: successResult.telegramSkipped
                ? 'Tenant creado. Telegram quedó pendiente de configuración — puedes añadirlo desde /admin/partner-onboarding.'
                : 'Tenant creado exitosamente con Telegram configurado',
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
