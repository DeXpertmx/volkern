export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET - Obtener etapas del pipeline
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const user = auth.user!;

    let stages = await prisma.pipelineStage.findMany({
      where: {
        tenantId: tenantId,
        activo: true,
      },
      orderBy: {
        orden: 'asc',
      },
    })

    // Si no hay etapas, crear las por defecto
    if (stages.length === 0) {
      const defaultStages: Array<{
        nombre: string
        probabilidad: number
        orden: number
        color: string
        esEtapaFinal: boolean
        tipoEtapaFinal?: string
      }> = [
        { nombre: 'Calificación', probabilidad: 10, orden: 1, color: '#94a3b8', esEtapaFinal: false, tipoEtapaFinal: undefined },
        { nombre: 'Contacto Inicial', probabilidad: 25, orden: 2, color: '#3b82f6', esEtapaFinal: false, tipoEtapaFinal: undefined },
        { nombre: 'Propuesta', probabilidad: 50, orden: 3, color: '#8b5cf6', esEtapaFinal: false, tipoEtapaFinal: undefined },
        { nombre: 'Negociación', probabilidad: 75, orden: 4, color: '#f59e0b', esEtapaFinal: false, tipoEtapaFinal: undefined },
        { nombre: 'Cierre', probabilidad: 90, orden: 5, color: '#10b981', esEtapaFinal: false, tipoEtapaFinal: undefined },
        { nombre: 'Ganado', probabilidad: 100, orden: 6, color: '#059669', esEtapaFinal: true, tipoEtapaFinal: 'ganado' },
        { nombre: 'Perdido', probabilidad: 0, orden: 7, color: '#ef4444', esEtapaFinal: true, tipoEtapaFinal: 'perdido' },
      ]

      stages = await Promise.all(
        defaultStages.map((stage) => {
          const data: any = {
            nombre: stage.nombre,
            probabilidad: stage.probabilidad,
            orden: stage.orden,
            color: stage.color,
            esEtapaFinal: stage.esEtapaFinal,
            tenantId: tenantId,
          }
          
          if (stage.tipoEtapaFinal) {
            data.tipoEtapaFinal = stage.tipoEtapaFinal
          }
          
          return prisma.pipelineStage.create({ data })
        })
      )
    }

    return NextResponse.json({ stages })
  } catch (error: any) {
    console.error('Error al obtener etapas:', error)
    return NextResponse.json(
      { error: 'Error al obtener etapas', details: error.message },
      { status: 500 }
    )
  }
}, ['leads:read', 'deals:read'])

// POST - Crear etapa personalizada
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const user = auth.user!;

    const body = await req.json()
    const {
      nombre,
      descripcion,
      probabilidad = 50,
      color = '#3b82f6',
      requiereAprobacion = false,
    } = body

    if (!nombre) {
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    }

    // Obtener el último orden
    const ultimaEtapa = await prisma.pipelineStage.findFirst({
      where: { tenantId: tenantId },
      orderBy: { orden: 'desc' },
    })

    const orden = (ultimaEtapa?.orden || 0) + 1

    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId: tenantId,
        nombre,
        descripcion,
        orden,
        probabilidad: parseInt(probabilidad),
        color,
        requiereAprobacion,
      },
    })

    return NextResponse.json({ stage }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear etapa:', error)
    return NextResponse.json(
      { error: 'Error al crear etapa', details: error.message },
      { status: 500 }
    )
  }
}, ['leads:write', 'configuracion:editar'])
