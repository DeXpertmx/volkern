export const dynamic = 'force-dynamic';


import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

        const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { configuracion: true }
        })

        const config = (tenant?.configuracion as any) || {}
        const emailConfig = config.businessEmails || { enabled: false }

        return NextResponse.json(emailConfig)
    } catch (error: any) {
        console.error('Error fetching email config:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { enabled } = await req.json()

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { tenantId: true }
        })

        if (!user?.tenantId) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId }
        })

        const config = (tenant?.configuracion as any) || {}
        config.businessEmails = {
            enabled,
            lastUpdated: new Date().toISOString()
        }

        const updatedTenant = await prisma.tenant.update({
            where: { id: user.tenantId },
            data: { configuracion: config }
        })

        return NextResponse.json(config.businessEmails)
    } catch (error: any) {
        console.error('Error updating email config:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
