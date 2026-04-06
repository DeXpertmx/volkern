export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/tasks - Obtener todas las tareas del tenant con filtros
 * 
 * Query Parameters:
 * - status: 'pending' (completada=false) | 'completed' (completada=true) | 'all'
 * - assignedToMe: boolean
 * - search: string
 * - tipo: string (llamada, email, reunion, recordatorio)
 * - limit: number
 */
export const GET = withTenantAuth(async (request, auth) => {
    try {
        const searchParams = new URL(request.url).searchParams;
        const status = searchParams.get('status') || 'all';
        const assignedToMe = searchParams.get('assignedToMe') === 'true';
        const search = searchParams.get('search');
        const tipo = searchParams.get('tipo');
        const limit = parseInt(searchParams.get('limit') || '50');

        const where: any = {
            tenantId: auth.tenant!.id
        };

        if (status === 'pending') {
            where.completada = false;
        } else if (status === 'completed') {
            where.completada = true;
        }

        if (assignedToMe && auth.user?.id) {
            where.asignadoA = auth.user.id;
        }

        if (search) {
            where.OR = [
                { titulo: { contains: search, mode: 'insensitive' } },
                { descripcion: { contains: search, mode: 'insensitive' } },
                { lead: { nombre: { contains: search, mode: 'insensitive' } } }
            ];
        }

        if (tipo) {
            where.tipo = tipo;
        }

        // El proxy redirige automáticamente a la DB del tenant
        const tasks = await prisma.task.findMany({
            where,
            include: {
                lead: {
                    select: {
                        id: true,
                        nombre: true,
                        email: true,
                        empresa: true
                    }
                },
                asignadoUsuario: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true
                    }
                }
            },
            orderBy: [
                { completada: 'asc' },
                { fechaVencimiento: 'asc' }
            ],
            take: limit
        });

        return NextResponse.json(tasks);
    } catch (error) {
        console.error('Error fetching global tasks:', error);
        return NextResponse.json(
            { error: 'Error al cargar las tareas' },
            { status: 500 }
        );
    }
}, ['tasks:read']);
