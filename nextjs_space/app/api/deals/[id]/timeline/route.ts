export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'

export interface TimelineItem {
  id: string
  tipo: 'actividad' | 'cita' | 'tarea' | 'nota' | 'interaccion' | 'cambio_etapa' | 'cotizacion' | 'contrato'
  subtipo?: string
  titulo: string
  descripcion?: string | null
  fecha: string
  estado?: string
  resultado?: string | null
  duracion?: number | null
  usuario?: {
    id: string
    name: string | null
  } | null
  metadata?: any
}

// GET - Obtener timeline unificado del deal
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

    // Obtener el deal con sus relaciones
    const deal = await prisma.deal.findFirst({
      where: {
        id: id,
        tenantId: user.tenantId,
      },
      include: {
        lead: true,
        contact: true,
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    const timeline: TimelineItem[] = []

    // 1. Actividades del Deal
    const actividades = await prisma.dealActivity.findMany({
      where: { dealId: deal.id },
      include: {
        usuario: {
          select: { id: true, name: true },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    })

    actividades.forEach((act) => {
      timeline.push({
        id: act.id,
        tipo: 'actividad',
        subtipo: act.tipo,
        titulo: act.titulo || act.tipo,
        descripcion: act.descripcion,
        fecha: act.fechaCreacion.toISOString(),
        resultado: act.resultado,
        duracion: act.duracion,
        usuario: act.usuario,
        metadata: act.metadata,
      })
    })

    // 2. Citas del Lead asociado
    if (deal.leadId) {
      const citas = await prisma.cita.findMany({
        where: { leadId: deal.leadId },
        include: {
          servicio: {
            select: { id: true, nombre: true },
          },
        },
        orderBy: { fechaHora: 'desc' },
      })

      citas.forEach((cita) => {
        timeline.push({
          id: cita.id,
          tipo: 'cita',
          subtipo: cita.tipo,
          titulo: cita.titulo || cita.servicio?.nombre || 'Cita',
          descripcion: cita.descripcion,
          fecha: cita.fechaHora.toISOString(),
          estado: cita.estado,
          duracion: cita.duracion,
          metadata: {
            ubicacion: cita.ubicacion,
            linkReunion: cita.linkReunion,
            servicioId: cita.servicioId,
            servicioNombre: cita.servicio?.nombre,
          },
        })
      })

      // 3. Tareas del Lead
      const tareas = await prisma.task.findMany({
        where: { leadId: deal.leadId },
        include: {
          asignadoUsuario: {
            select: { id: true, name: true },
          },
        },
        orderBy: { fechaVencimiento: 'desc' },
      })

      tareas.forEach((tarea) => {
        timeline.push({
          id: tarea.id,
          tipo: 'tarea',
          subtipo: tarea.tipo,
          titulo: tarea.titulo,
          descripcion: tarea.descripcion,
          fecha: tarea.fechaVencimiento.toISOString(),
          estado: tarea.completada ? 'completada' : 'pendiente',
          usuario: tarea.asignadoUsuario,
          metadata: {
            fechaCompletado: tarea.fechaCompletado,
          },
        })
      })

      // 4. Notas del Lead
      const notas = await prisma.note.findMany({
        where: { leadId: deal.leadId },
        include: {
          creador: {
            select: { id: true, name: true },
          },
        },
        orderBy: { fechaCreacion: 'desc' },
      })

      notas.forEach((nota) => {
        timeline.push({
          id: nota.id,
          tipo: 'nota',
          titulo: 'Nota',
          descripcion: nota.contenido,
          fecha: nota.fechaCreacion.toISOString(),
          usuario: nota.creador,
        })
      })

      // 5. Interacciones del Lead
      const interacciones = await prisma.interaction.findMany({
        where: { leadId: deal.leadId },
        include: {
          creador: {
            select: { id: true, name: true },
          },
        },
        orderBy: { fechaCreacion: 'desc' },
      })

      interacciones.forEach((int) => {
        timeline.push({
          id: int.id,
          tipo: 'interaccion',
          subtipo: int.tipo,
          titulo: `Interacción: ${int.tipo}`,
          descripcion: int.contenido,
          fecha: int.fechaCreacion.toISOString(),
          resultado: int.resultado,
          usuario: int.creador,
          metadata: int.metadatos,
        })
      })
    }

    // 6. Cotizaciones del Deal
    const cotizaciones = await prisma.cotizacion.findMany({
      where: { dealId: deal.id },
      include: {
        creadoPor: {
          select: { id: true, name: true },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    })

    cotizaciones.forEach((cot) => {
      timeline.push({
        id: cot.id,
        tipo: 'cotizacion',
        titulo: cot.numero || 'Cotización',
        descripcion: cot.titulo,
        fecha: cot.fechaCreacion.toISOString(),
        estado: cot.estado,
        usuario: cot.creadoPor,
        metadata: {
          total: cot.total,
          moneda: cot.moneda,
        },
      })
    })

    // 7. Contratos del Deal
    const contratos = await prisma.contrato.findMany({
      where: { dealId: deal.id },
      include: {
        creadoPor: {
          select: { id: true, name: true },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    })

    contratos.forEach((cont) => {
      timeline.push({
        id: cont.id,
        tipo: 'contrato',
        titulo: cont.numero || 'Contrato',
        descripcion: cont.titulo,
        fecha: cont.fechaCreacion.toISOString(),
        estado: cont.estado,
        usuario: cont.creadoPor,
        metadata: {
          total: cont.total,
          moneda: cont.moneda,
          firmadoPorCliente: cont.firmadoPorCliente,
          firmadoPorEmpresa: cont.firmadoPorEmpresa,
        },
      })
    })

    // Ordenar todo el timeline por fecha (más reciente primero)
    timeline.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

    // Calcular estadísticas
    const stats = {
      totalActividades: actividades.length,
      totalCitas: timeline.filter(t => t.tipo === 'cita').length,
      totalTareas: timeline.filter(t => t.tipo === 'tarea').length,
      tareasCompletadas: timeline.filter(t => t.tipo === 'tarea' && t.estado === 'completada').length,
      totalNotas: timeline.filter(t => t.tipo === 'nota').length,
      totalInteracciones: timeline.filter(t => t.tipo === 'interaccion').length,
      totalCotizaciones: cotizaciones.length,
      totalContratos: contratos.length,
    }

    return NextResponse.json({
      timeline,
      stats,
      deal: {
        id: deal.id,
        titulo: deal.titulo,
        leadId: deal.leadId,
        contactId: deal.contactId,
      },
    })
  } catch (error: any) {
    console.error('Error al obtener timeline:', error)
    return NextResponse.json(
      { error: 'Error al obtener timeline', details: error.message },
      { status: 500 }
    )
  }
}
