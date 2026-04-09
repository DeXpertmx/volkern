export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface RangoHorario {
  inicio: string
  fin: string
}

interface DiaHorario {
  activo: boolean
  rangos: RangoHorario[]
}

interface HorariosConfig {
  lunes: DiaHorario
  martes: DiaHorario
  miercoles: DiaHorario
  jueves: DiaHorario
  viernes: DiaHorario
  sabado: DiaHorario
  domingo: DiaHorario
}

const diasSemanaMap: { [key: number]: keyof HorariosConfig } = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado'
}

/**
 * Endpoint público para consultar disponibilidad de citas
 * GET /api/public/citas/disponibilidad?tenantId=xxx&fecha=2025-01-20&duracion=60
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')
    const fecha = searchParams.get('fecha') // YYYY-MM-DD
    const duracion = parseInt(searchParams.get('duracion') || '60') // Minutos
    const usuarioId = searchParams.get('usuarioId') // Opcional: ID de usuario específico
    const bufferMinutos = parseInt(searchParams.get('buffer') || '0', 10)
    const avisoMinimoMin = parseInt(searchParams.get('avisoMinimo') || '0', 10)

    // Validación
    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId es requerido' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (!fecha) {
      return NextResponse.json(
        { error: 'fecha es requerida (formato: YYYY-MM-DD)' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Validar formato de fecha
    const fechaDate = new Date(fecha)
    if (isNaN(fechaDate.getTime())) {
      return NextResponse.json(
        { error: 'Formato de fecha inválido. Use YYYY-MM-DD' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Verificar que el tenant existe
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    })

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404, headers: corsHeaders }
      )
    }

    // Obtener horarios de atención del tenant
    const configHorarios = await prisma.configuracion.findUnique({
      where: {
        tenantId_clave: {
          tenantId: tenantId,
          clave: 'horariosAtencion'
        }
      }
    })

    let horariosAtencion: HorariosConfig | null = null
    if (configHorarios?.valor) {
      try {
        horariosAtencion = JSON.parse(configHorarios.valor)
      } catch {
        console.warn('Error parsing horariosAtencion, usando defaults')
      }
    }

    // Determinar el día de la semana (usando UTC para consistencia)
    const diaSemana = diasSemanaMap[fechaDate.getUTCDay()]

    // Obtener horarios del día específico
    let rangosDelDia: RangoHorario[] = []

    if (horariosAtencion && horariosAtencion[diaSemana]) {
      const diaConfig = horariosAtencion[diaSemana]
      if (diaConfig.activo && diaConfig.rangos && diaConfig.rangos.length > 0) {
        rangosDelDia = diaConfig.rangos
      }
    } else {
      // Default: Lunes a Viernes 9:00-18:00, fines de semana cerrado
      if (['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].includes(diaSemana)) {
        rangosDelDia = [{ inicio: '09:00', fin: '18:00' }]
      }
    }

    // Si no hay rangos para este día, está cerrado
    if (rangosDelDia.length === 0) {
      return NextResponse.json({
        fecha,
        duracion,
        diaSemana,
        cerrado: true,
        mensaje: 'Este día no está disponible para citas',
        disponibles: [],
        ocupados: []
      }, { headers: corsHeaders })
    }

    // Definir rango del día para buscar citas (UTC)
    // Las fechas en la BD están en UTC, así que buscamos el día completo en UTC
    const startOfDay = new Date(`${fecha}T00:00:00.000Z`)
    const endOfDay = new Date(`${fecha}T23:59:59.999Z`)

    // Obtener todas las citas del día que ocupan el horario
    // Excluir estados cancelados (case-insensitive)
    const citasDelDia = await prisma.cita.findMany({
      where: {
        tenantId: tenantId,
        // Si se pide un usuario específico, filtrar solo sus citas
        // Si no se pide, filtrar todas las del tenant (comportamiento anterior)
        ...(usuarioId ? { usuarioAsignadoId: usuarioId } : {}),
        fechaHora: {
          gte: startOfDay,
          lte: endOfDay
        },
        // Excluir todas las variantes de cancelada
        NOT: {
          estado: {
            in: ['cancelada', 'Cancelada', 'CANCELADA', 'no_asistio', 'No Asistió']
          }
        }
      },
      select: {
        id: true,
        fechaHora: true,
        duracion: true,
        estado: true
      },
      orderBy: {
        fechaHora: 'asc'
      }
    })

    console.log(`[Disponibilidad] Fecha: ${fecha}, Citas activas encontradas:`, citasDelDia.length)
    citasDelDia.forEach(c => {
      console.log(`  - ${new Date(c.fechaHora).toISOString()} (${c.duracion}min) - Estado: ${c.estado}`)
    })

    // Determinar la zona horaria para el cálculo de slots
    let timezone = 'America/Mexico_City' // Default
    
    if (usuarioId) {
      const usuario = await prisma.user.findUnique({
        where: { id: usuarioId },
        select: { timezone: true }
      })
      if (usuario?.timezone) timezone = usuario.timezone
    } else {
      // Intentar obtener de la configuración del tenant
      const configTimezone = await prisma.configuracion.findUnique({
        where: {
          tenantId_clave: {
            tenantId: tenantId,
            clave: 'timezone'
          }
        }
      })
      if (configTimezone?.valor) timezone = configTimezone.valor
    }

    // Calcular el offset dinámico para la fecha solicitada
    const getUtcOffset = (tz: string, date: Date) => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset'
        }).formatToParts(date)
        const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0'
        const match = offsetPart.match(/GMT([+-])(\d+)/)
        if (match) {
          const sign = match[1] === '+' ? 1 : -1
          return sign * parseInt(match[2], 10)
        }
      } catch (e) {
        console.warn(`Error calculando offset para ${tz}:`, e)
      }
      return 1 // Fallback a UTC+1 si falla
    }

    const UTC_OFFSET_HOURS = getUtcOffset(timezone, startOfDay)
    console.log(`[Disponibilidad] Usando Timezone: ${timezone}, Offset: UTC${UTC_OFFSET_HOURS >= 0 ? '+' : ''}${UTC_OFFSET_HOURS}`)

    const intervaloMinutos = 30
    const todosLosSlots: Date[] = []

    for (const rango of rangosDelDia) {
      const [horaInicio, minInicio] = rango.inicio.split(':').map(Number)
      const [horaFin, minFin] = rango.fin.split(':').map(Number)

      let horaActual = horaInicio
      let minActual = minInicio

      while (horaActual < horaFin || (horaActual === horaFin && minActual < minFin)) {
        // Crear slot en UTC (restando el offset de la zona horaria del negocio)
        const horaUTC = horaActual - UTC_OFFSET_HOURS
        const slot = new Date(`${fecha}T${horaUTC.toString().padStart(2, '0')}:${minActual.toString().padStart(2, '0')}:00.000Z`)

        // Verificar que el slot + duración no exceda el fin del rango
        const slotFin = new Date(slot.getTime() + duracion * 60000)
        const horaFinUTC = horaFin - UTC_OFFSET_HOURS
        const rangoFinDate = new Date(`${fecha}T${horaFinUTC.toString().padStart(2, '0')}:${minFin.toString().padStart(2, '0')}:00.000Z`)

        if (slotFin <= rangoFinDate) {
          todosLosSlots.push(slot)
        }

        // Avanzar al siguiente slot
        minActual += intervaloMinutos
        if (minActual >= 60) {
          horaActual++
          minActual = minActual - 60
        }
      }
    }

    // Función para verificar si un slot está ocupado (con buffer)
    const esSlotOcupado = (slot: Date): boolean => {
      const slotFin = new Date(slot.getTime() + (duracion + bufferMinutos) * 60000)

      return citasDelDia.some(cita => {
        const citaInicio = new Date(cita.fechaHora)
        const citaFin = new Date(citaInicio.getTime() + ((cita.duracion || 60) + bufferMinutos) * 60000)

        return (
          (slot >= citaInicio && slot < citaFin) ||
          (slotFin > citaInicio && slotFin <= citaFin) ||
          (slot <= citaInicio && slotFin >= citaFin)
        )
      })
    }

    // Filtrar slots disponibles
    const disponibles: string[] = []
    const ocupados: string[] = []
    const ahora = new Date()

    todosLosSlots.forEach(slot => {
      // Aplicar aviso mínimo
      if (avisoMinimoMin > 0) {
        const minBookingTime = new Date(ahora.getTime() + avisoMinimoMin * 60000)
        if (slot < minBookingTime) return
      }

      // No mostrar slots pasados
      if (slot <= ahora) return

      // Convertir de UTC a hora local (sumando el offset)
      const horaLocal = slot.getUTCHours() + UTC_OFFSET_HOURS
      const minutos = slot.getUTCMinutes()
      const horaFormateada = `${horaLocal.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`

      if (esSlotOcupado(slot)) {
        ocupados.push(horaFormateada)
      } else {
        disponibles.push(horaFormateada)
      }
    })

    // Formatear rangos para respuesta
    const horariosDelDia = rangosDelDia.map(r => `${r.inicio} - ${r.fin}`).join(', ')

    return NextResponse.json({
      fecha,
      duracion,
      diaSemana,
      cerrado: false,
      horarioLaboral: horariosDelDia,
      rangos: rangosDelDia,
      intervalo: intervaloMinutos,
      totalSlots: todosLosSlots.length,
      disponibles,
      ocupados,
      citasExistentes: citasDelDia.length
    }, { headers: corsHeaders })

  } catch (error: any) {
    console.error('[GET /api/public/citas/disponibilidad] Error:', error)
    return NextResponse.json(
      { error: 'Error al consultar disponibilidad' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Manejar OPTIONS para CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}
