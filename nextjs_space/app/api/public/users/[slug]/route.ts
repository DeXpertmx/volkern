export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { monedaEfectiva } from '@/lib/moneda'
import { findBookingUserBySlug } from '@/lib/public-slug-lookup'


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
                    // Divisa de reporte del tenant: es el respaldo de los servicios
                    // que no declaran la suya (antes caían a un euro fijo).
                    moneda: true,
                }
            }
        };

        // Buscar por bookingSlug con scoping por tenant (subdominio) y fallback
        // global para QRs impresos antes del scoping; luego por ID de usuario
        let user = await findBookingUserBySlug(params.slug, request.headers.get('x-tenant-subdomain'), {
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

        // El usuario ya está resuelto: la constante fija el estrechamiento de tipo
        // para los `map` de abajo, donde TypeScript no lo mantiene sobre un `let`.
        const usuario = user;

        // Obtener servicios desde CatalogoItem y Servicio (legacy)
        const [catalogoItems, serviciosLegacy] = await Promise.all([
            prisma.catalogoItem.findMany({
                where: {
                    tenantId: user.tenantId,
                    activo: true,
                    tipo: { in: ['servicio', 'cita', 'producto'] },
                } as any,
                orderBy: { nombre: 'asc' }
            }),
            prisma.servicio.findMany({
                where: {
                    tenantId: user.tenantId,
                    activo: true,
                },
                orderBy: { nombre: 'asc' }
            })
        ])

        // Mapear CatalogoItem a la interfaz esperada
        const catalogoMap = new Map(catalogoItems.map(item => [item.id, {
            id: item.id,
            nombre: item.nombre,
            descripcion: item.descripcion,
            duracionMinutos: item.duracionMinutos || 60,
            precio: item.precioBase,
            moneda: monedaEfectiva([item.moneda], usuario.tenant?.moneda),
            modalidad: item.modalidad || 'presencial'
        }]))

        // Mapear Servicio legacy y deduplicar si tiene catalogoItemId
        const legacyIds = new Set<string>()
        for (const s of serviciosLegacy) {
            if (s.catalogoItemId && catalogoMap.has(s.catalogoItemId)) continue
            const key = s.catalogoItemId || s.id
            if (legacyIds.has(key)) continue
            legacyIds.add(key)
        }

        const servicios = [
            ...Array.from(catalogoMap.values()),
            ...serviciosLegacy
                .filter(s => !s.catalogoItemId || !catalogoMap.has(s.catalogoItemId))
                .map(s => ({
                    id: s.id,
                    nombre: s.nombre,
                    descripcion: s.descripcion,
                    duracionMinutos: s.duracionMinutos || 60,
                    precio: s.precio,
                    moneda: monedaEfectiva([s.moneda], usuario.tenant?.moneda),
                    modalidad: s.modalidad || 'presencial'
                }))
        ]

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
