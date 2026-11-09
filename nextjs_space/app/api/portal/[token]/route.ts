export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/portal/[token] - Obtener información pública para el portal del cliente
 */
export async function GET(
    request: NextRequest,
    { params: paramsPromise }: { params: Promise<{ token: string }> }
) {
  const params = await paramsPromise;
    try {
        const { token } = params;

        if (!token) {
            return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
        }

        // 1. Buscar el lead por token directamente
        let lead = await (prisma as any).lead.findUnique({
            where: { tokenPublico: token },
            include: {
                tenant: true,
                cotizaciones: {
                    orderBy: { fechaCreacion: 'desc' }
                },
                contratos: {
                    orderBy: { fechaCreacion: 'desc' }
                },
                deals: {
                    orderBy: { fechaCreacion: 'desc' }
                },
                ordenesVenta: {
                    orderBy: { fechaCreacion: 'desc' }
                }
            }
        });

        // 2. Si no se encuentra, buscar por token de cotización o contrato
        if (!lead) {
            const cotizacion = await prisma.cotizacion.findUnique({
                where: { tokenPublico: token },
                select: { leadId: true }
            });

            if (cotizacion?.leadId) {
                lead = await (prisma as any).lead.findUnique({
                    where: { id: cotizacion.leadId },
                    include: {
                        tenant: true,
                        cotizaciones: { orderBy: { fechaCreacion: 'desc' } },
                        contratos: { orderBy: { fechaCreacion: 'desc' } },
                        deals: { orderBy: { fechaCreacion: 'desc' } },
                        ordenesVenta: { orderBy: { fechaCreacion: 'desc' } }
                    }
                });
            } else {
                const contrato = await prisma.contrato.findUnique({
                    where: { tokenPublico: token },
                    select: { leadId: true }
                });

                if (contrato?.leadId) {
                    lead = await (prisma as any).lead.findUnique({
                        where: { id: contrato.leadId },
                        include: {
                            tenant: true,
                            cotizaciones: { orderBy: { fechaCreacion: 'desc' } },
                            contratos: { orderBy: { fechaCreacion: 'desc' } },
                            deals: { orderBy: { fechaCreacion: 'desc' } },
                            ordenesVenta: { orderBy: { fechaCreacion: 'desc' } }
                        }
                    });
                }
            }
        }

        if (!lead) {
            return NextResponse.json({ error: 'Portal no encontrado o expirado' }, { status: 404 });
        }

        // Obtener configuración de whitelabel
        const whitelabelConfig = await (prisma as any).whitelabelConfig.findFirst({
            orderBy: { fechaCreacion: 'desc' }
        });

        // Actualizar tracking
        await (prisma as any).lead.update({
            where: { id: lead.id },
            data: {
                vecesVista: { increment: 1 },
                ultimaVista: new Date(),
                fechaPrimeraVista: lead.fechaPrimeraVista || new Date()
            }
        });

        return NextResponse.json({
            success: true,
            lead: {
                id: lead.id,
                nombre: lead.nombre,
                empresa: lead.empresa,
                email: lead.email,
                tokenPublico: lead.tokenPublico
            },
            tenant: {
                ...lead.tenant,
                whitelabelConfig: whitelabelConfig
            },
            documents: {
                cotizaciones: lead.cotizaciones,
                contratos: lead.contratos,
                deals: lead.deals,
                ordenesVenta: lead.ordenesVenta
            }
        });

    } catch (error) {
        console.error('Error in Portal API:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
