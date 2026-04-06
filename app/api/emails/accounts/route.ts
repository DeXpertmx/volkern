export const dynamic = 'force-dynamic';


import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { emailApi } from '@/lib/namecrane-smartermail'
import { PLAN_LIMITS } from '@/lib/plans'

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const domainId = searchParams.get('domainId')

        if (!domainId) {
            return NextResponse.json({ error: 'domainId es requerido' }, { status: 400 })
        }

        const accounts = await prisma.businessEmailAccount.findMany({
            where: { domainId }
        })

        return NextResponse.json(accounts)
    } catch (error: any) {
        console.error('Error fetching email accounts:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { domainId, username, fullName, password } = await req.json()

        if (!domainId || !username || !password) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
        }

        // 1. Verificar dominio y tenant
        const domain = await prisma.businessDomain.findUnique({
            where: { id: domainId },
            include: {
                tenant: true,
                _count: { select: { emailAccounts: true } }
            }
        })

        if (!domain) {
            return NextResponse.json({ error: 'Dominio no encontrado' }, { status: 404 })
        }

        // 2. Verificar límites del plan
        const tenant = domain.tenant
        const planSlug = tenant.plan as any
        const planConfig = await getPlanConfig(planSlug);
        const limits = planConfig.limites as any;

        if (!limits || !limits.business_emails || limits.business_emails === 0) {
            return NextResponse.json({ error: 'Tu plan no incluye correos empresariales' }, { status: 403 })
        }

        if (domain._count.emailAccounts >= (limits.business_emails || 0)) {
            return NextResponse.json({ error: `Has alcanzado el límite de ${limits.business_emails} correos para tu plan` }, { status: 403 })
        }

        // 3. Crear en SmarterMail
        const email = `${username}@${domain.domain}`
        try {
            await emailApi.createEmailAccount({
                username: email,
                fullName,
                password,
                maxSize: limits.business_email_gb * 1024 * 1024 * 1024 // GB a Bytes
            })
        } catch (smError: any) {
            console.error('SmarterMail error:', smError)
            return NextResponse.json({ error: `Error en SmarterMail: ${smError.message}` }, { status: 500 })
        }

        // 4. Guardar en DB
        const newAccount = await prisma.businessEmailAccount.create({
            data: {
                domainId,
                email,
                displayName: fullName || username,
                diskQuota: limits.business_email_gb * 1024 * 1024 * 1024
            }
        })

        return NextResponse.json(newAccount)
    } catch (error: any) {
        console.error('Error creating email account:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: 'Id es requerido' }, { status: 400 })
        }

        const account = await prisma.businessEmailAccount.findUnique({
            where: { id },
            include: { domain: true }
        })

        if (!account) {
            return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
        }

        // 1. Eliminar en SmarterMail
        try {
            await emailApi.deleteEmailAccount(account.email)
        } catch (smError: any) {
            console.error('SmarterMail delete error:', smError)
            // Opcional: ¿fallar o continuar? Continuamos para mantener consistencia en DB
        }

        // 2. Eliminar de DB
        await prisma.businessEmailAccount.delete({
            where: { id }
        })

        return NextResponse.json({ message: 'Cuenta eliminada exitosamente' })
    } catch (error: any) {
        console.error('Error deleting email account:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
