export const dynamic = 'force-dynamic';


import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { emailApi } from '@/lib/namecrane-smartermail'
import { getPlanConfig } from '@/lib/plans'

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { tenantId: true }
        })

        if (!user?.tenantId) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
        }

        const domains = await prisma.businessDomain.findMany({
            where: { tenantId: user.tenantId },
            include: {
                _count: {
                    select: { emailAccounts: true }
                }
            }
        })

        return NextResponse.json(domains)
    } catch (error: any) {
        console.error('Error fetching domains:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { domain } = await req.json()
        if (!domain) {
            return NextResponse.json({ error: 'Dominio es requerido' }, { status: 400 })
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { tenant: true }
        })

        if (!user?.tenant) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
        }

        const tenant = user.tenant
        const planSlug = tenant.plan as any
        const planConfig = await getPlanConfig(planSlug);
        const limits = planConfig.limites as any;

        if (!limits || !limits.business_emails || limits.business_emails === 0) {
            return NextResponse.json({ error: 'Tu plan no incluye correos empresariales' }, { status: 403 })
        }

        // Verificar si ya tiene un dominio
        const existingDomain = await prisma.businessDomain.findFirst({
            where: { tenantId: tenant.id }
        })

        if (existingDomain) {
            return NextResponse.json({ error: 'Ya tienes un dominio configurado' }, { status: 400 })
        }

        // 1. Crear en NameCrane
        try {
            await emailApi.createDomainInNameCrane(domain, limits.business_email_gb * limits.business_emails, limits.business_emails)
        } catch (ncError: any) {
            console.error('NameCrane error:', ncError)
            return NextResponse.json({ error: `Error al registrar dominio en NameCrane: ${ncError.message}` }, { status: 500 })
        }

        // 2. Guardar en DB
        const newDomain = await prisma.businessDomain.create({
            data: {
                tenantId: tenant.id,
                domain,
                status: 'pending', // Deberá pasar a active tras verificación manual o webhook (simulado por ahora)
                diskLimit: limits.business_email_gb * limits.business_emails,
                userLimit: limits.business_emails
            }
        })

        return NextResponse.json(newDomain)
    } catch (error: any) {
        console.error('Error creating domain:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
