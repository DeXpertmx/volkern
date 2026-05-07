export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'


export async function GET(
    request: NextRequest,
    { params }: { params: { slug: string } }
) {
    try {
        const selectFields = {
            id: true,
            name: true,
            image: true,
            bookingTitle: true,
            bookingBio: true,
            bookingEnabled: true,
            tenantId: true,
            tenant: {
                select: {
                    id: true,
                    nombre: true,
                }
            }
        };

        // Intentar buscar por bookingSlug primero, luego por ID
        let user = await prisma.user.findUnique({
            where: { bookingSlug: params.slug },
            select: selectFields
        });

        if (!user) {
            // Fallback: buscar por ID del usuario
            user = await prisma.user.findUnique({
                where: { id: params.slug },
                select: selectFields
            });
        }

        if (!user || !user.bookingEnabled) {
            return NextResponse.json({ error: 'Perfil de agendamiento no encontrado o inactivo' }, { status: 404 })
        }

        // Obtener servicios del tenant del usuario
        const servicios = await prisma.servicio.findMany({
            where: {
                tenantId: user.tenantId,
                activo: true
            },
            orderBy: { nombre: 'asc' }
        })

        return NextResponse.json({
            user: {
                id: user.id,
                name: user.name,
                image: user.image,
                title: user.bookingTitle,
                bio: user.bookingBio,
                tenantId: user.tenantId,
                tenantName: user.tenant?.nombre
            },
            servicios
        })
    } catch (error: any) {
        console.error('Error fetching public user profile:', error)
        return NextResponse.json(
            { error: error.message || 'Error al obtener el perfil' },
            { status: 500 }
        )
    }
}
