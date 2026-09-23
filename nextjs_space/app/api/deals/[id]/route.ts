export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma, getTenantDb, dbContext } from '@/lib/db'
import { createSystemContext } from '@/lib/skills/context';
import { authOptions } from '@/lib/auth'
import { ComplianceGate } from '@/lib/compliance-gate'

// GET - Obtener deal por ID
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const deal = await prisma.deal.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
      include: {
        lead: true,
        usuarioAsignado: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        cotizaciones: {
          orderBy: {
            fechaCreacion: 'desc',
          },
        },
        actividades: {
          include: {
            usuario: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            fechaCreacion: 'desc',
          },
          take: 50,
        },
        archivos: {
          include: {
            usuario: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            fechaSubida: 'desc',
          },
        },
        comisiones: {
          include: {
            usuario: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        propiedad: {
          select: { id: true, nombre: true, tipo: true, precioBase: true, moneda: true },
        },
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Error al obtener deal:', error)
    return NextResponse.json(
      { error: 'Error al obtener deal', details: error.message },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar deal
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    // Verificar que el deal existe y pertenece al tenant
    const dealActual = await prisma.deal.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!dealActual) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    // Cura de deals huérfanos (pipelineId NULL) al primer pipeline activo.
    // Idempotente; se invoca solo en escrituras para no ensuciar el GET.
    const { assignOrphanDealsToDefaultPipeline } = await import('@/lib/deals/orphan-deals');
    await assignOrphanDealsToDefaultPipeline(user.tenantId).catch((e: any) =>
      console.warn('⚠️ No se pudieron reasignar deals huérfanos:', e),
    );

    const body = await req.json()
    const {
      titulo,
      descripcion,
      valor,
      moneda,
      etapa,
      probabilidad,
      estado,
      prioridad,
      fechaEstimadaCierre,
      razonPerdida,
      competidor,
      notasInternas,
      valorReal,
      descuento,
      tags,
      usuarioAsignadoId,
      catalogoItemId,
    } = body

    // Preparar datos para actualizar
    const dataToUpdate: any = {
      fechaUltimaActividad: new Date(),
    }

    if (titulo !== undefined) dataToUpdate.titulo = titulo
    if (descripcion !== undefined) dataToUpdate.descripcion = descripcion
    if (valor !== undefined) dataToUpdate.valor = parseFloat(valor)
    if (moneda !== undefined) dataToUpdate.moneda = moneda
    if (probabilidad !== undefined) dataToUpdate.probabilidad = parseInt(probabilidad)
    if (prioridad !== undefined) dataToUpdate.prioridad = prioridad
    if (razonPerdida !== undefined) dataToUpdate.razonPerdida = razonPerdida
    if (competidor !== undefined) dataToUpdate.competidor = competidor
    if (notasInternas !== undefined) dataToUpdate.notasInternas = notasInternas
    if (valorReal !== undefined) dataToUpdate.valorReal = parseFloat(valorReal)
    if (descuento !== undefined) dataToUpdate.descuento = parseFloat(descuento)
    if (tags !== undefined) dataToUpdate.tags = tags
    if (usuarioAsignadoId !== undefined) dataToUpdate.usuarioAsignadoId = usuarioAsignadoId
    if (catalogoItemId !== undefined) dataToUpdate.catalogoItemId = catalogoItemId || null
    
    if (fechaEstimadaCierre !== undefined) {
      dataToUpdate.fechaEstimadaCierre = fechaEstimadaCierre ? new Date(fechaEstimadaCierre) : null
    }

    // Cambio de etapa — COMPLIANCE GATE
    if (etapa !== undefined && etapa !== dealActual.etapa) {
      // Verificar compliance antes de cambiar etapa (tareas obligatorias)
      const gateResult = await ComplianceGate.check({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'pipeline_advance',
        entityId: params.id,
        entityType: 'deal',
      });

      if (!gateResult.allowed) {
        return NextResponse.json({
          error: gateResult.reason,
          gate: {
            requiredAction: gateResult.requiredAction,
            missingRequirements: gateResult.missingRequirements,
            blockingRule: gateResult.blockingRule?.name,
            mode: gateResult.mode,
          },
        }, { status: 403 });
      }

      dataToUpdate.etapa = etapa
      
      // Registrar actividad de cambio de etapa
      await prisma.dealActivity.create({
        data: {
          dealId: params.id,
          tenantId: user.tenantId,
          userId: user.id,
          tipo: 'cambio_etapa',
          titulo: 'Cambio de etapa',
          descripcion: `Etapa cambiada de "${dealActual.etapa}" a "${etapa}"`,
        },
      })
    }

    // Cambio de estado (ganado/perdido) — COMPLIANCE GATE
    if (estado !== undefined && estado !== dealActual.estado) {
      dataToUpdate.estado = estado

      // Verificar compliance antes de cerrar el deal
      if (estado === 'ganado' || estado === 'perdido') {
        const gateResult = await ComplianceGate.check({
          tenantId: user.tenantId,
          userId: user.id,
          action: estado === 'ganado' ? 'deal_close_won' : 'deal_close_lost',
          entityId: params.id,
          entityType: 'deal',
          metadata: { razonPerdida: body.razonPerdida },
        });

        if (!gateResult.allowed) {
          return NextResponse.json({
            error: gateResult.reason,
            gate: {
              requiredAction: gateResult.requiredAction,
              missingRequirements: gateResult.missingRequirements,
              blockingRule: gateResult.blockingRule?.name,
              mode: gateResult.mode,
            },
          }, { status: 403 });
        }

        dataToUpdate.fechaCierre = new Date()
        
        // Registrar actividad de cierre
        await prisma.dealActivity.create({
          data: {
            dealId: params.id,
            tenantId: user.tenantId,
            userId: user.id,
            tipo: 'cierre',
            titulo: `Deal ${estado}`,
            descripcion: `Deal marcado como ${estado}`,
            resultado: estado,
          },
        })

        // DATASET DE CALIBRACIÓN (C6): marca el desenlace en el snapshot más
        // reciente del deal. El historial anterior no se toca — el score de
        // ANTES del cierre es lo que se compara con lo que pasó.
        try {
          const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
          await PipelineHealthService.marcarDesenlaceEnSnapshots(
            params.id,
            estado as 'ganado' | 'perdido'
          );
        } catch (e: any) {
          console.warn('⚠️ No se pudo marcar el desenlace en los snapshots:', e);
        }

        // Si es ganado, generar comisión si aplica
        if (estado === 'ganado' && valorReal) {
          // Aquí se puede implementar lógica de comisiones automáticas
          // Por ahora dejamos pendiente para configuración manual
        }
      }
    }

    // Actualizar el deal
    const deal = await prisma.deal.update({
      where: { id: params.id },
      data: dataToUpdate,
      include: {
        lead: true,
        propiedad: {
          select: { id: true, nombre: true, tipo: true, precioBase: true, moneda: true },
        },
        usuarioAsignado: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'actualizar',
        entidad: 'deal',
        entidadId: deal.id,
        descripcion: `Usuario ${user.name} actualizó el deal "${deal.titulo}"`,
        cambiosAntes: dealActual,
        cambiosDespues: deal,
      },
    })

    // Notificación por Telegram al admin si cambió a ganado/perdido
    if (estado === 'ganado' || estado === 'perdido') {
      const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
      const emoji = estado === 'ganado' ? '🎉' : '😔';
      const resultadoTexto = estado === 'ganado' ? 'GANADO' : 'PERDIDO';
      notifyByTelegram(
        `${emoji} *Deal ${resultadoTexto}*\n\n📝 *Nombre:* ${deal.titulo}\n💰 *Valor:* ${deal.valor} ${deal.moneda}\n👤 *Cliente:* ${deal.lead?.nombre || 'N/A'}`,
        createSystemContext(user.tenantId)
      ).catch(() => {})
    }

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Error al actualizar deal:', error)
    return NextResponse.json(
      { error: 'Error al actualizar deal', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar deal
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const deal = await prisma.deal.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    // Eliminar deal (las relaciones en cascade se eliminan automáticamente)
    await prisma.deal.delete({
      where: { id: params.id },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'eliminar',
        entidad: 'deal',
        entidadId: params.id,
        descripcion: `Usuario ${user.name} eliminó el deal "${deal.titulo}"`,
        cambiosAntes: deal,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al eliminar deal:', error)
    return NextResponse.json(
      { error: 'Error al eliminar deal', details: error.message },
      { status: 500 }
    )
  }
}
