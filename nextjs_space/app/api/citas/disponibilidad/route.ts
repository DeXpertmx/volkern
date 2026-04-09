export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// Interfaces para horarios configurados
interface RangoHorario {
  inicio: string  // "09:00"
  fin: string     // "17:00"
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

// Mapeo de día de la semana (0=domingo, 1=lunes, etc.)
const diasMap: Record<number, keyof HorariosConfig> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado'
}

// Horarios por defecto si no hay configuración
const defaultHorarios: HorariosConfig = {
  lunes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  martes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  miercoles: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  jueves: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  viernes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  sabado: { activo: false, rangos: [] },
  domingo: { activo: false, rangos: [] },
}

/**
 * Endpoint estilo Google Calendar para consultar disponibilidad
 * GET /api/citas/disponibilidad?fecha=2025-12-05&duracion=60
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['citas:read'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') // YYYY-MM-DD
    const duracionParam = searchParams.get('duracion') || '60'
    const duracion = typeof duracionParam === 'string' ? parseInt(duracionParam, 10) : duracionParam
    const bufferMinutos = parseInt(searchParams.get('buffer') || '0', 10)
    const avisoMinimoMin = parseInt(searchParams.get('avisoMinimo') || '0', 10)

    // Validación
    if (!fecha) {
      return NextResponse.json(
        { 
          error: 'Parámetro "fecha" requerido',
          hint: 'Formato: YYYY-MM-DD, ejemplo: 2025-12-05'
        },
        { status: 400 }
      )
    }

    // Validar formato de fecha
    const fechaDate = new Date(fecha)
    if (isNaN(fechaDate.getTime())) {
      return NextResponse.json(
        { 
          error: 'Formato de fecha inválido',
          hint: 'Use formato YYYY-MM-DD, ejemplo: 2025-12-05'
        },
        { status: 400 }
      )
    }

    console.log(`[GET /api/citas/disponibilidad] Consultando disponibilidad:`, {
      tenantId: auth.tenant.id,
      fecha,
      duracion
    })

    // ============================================
    // PASO 1: Obtener configuración de horarios del tenant
    // ============================================
    const configHorarios = await prisma.configuracion.findFirst({
      where: {
        tenantId: auth.tenant.id,
        clave: 'horariosAtencion'
      }
    })

    let horariosConfig: HorariosConfig = defaultHorarios
    if (configHorarios?.valor) {
      try {
        horariosConfig = JSON.parse(configHorarios.valor)
        console.log(`[GET /api/citas/disponibilidad] Usando horarios configurados del tenant`)
      } catch (e) {
        console.log(`[GET /api/citas/disponibilidad] Error parseando horarios, usando defaults`)
      }
    } else {
      console.log(`[GET /api/citas/disponibilidad] No hay horarios configurados, usando defaults`)
    }

    // ============================================
    // PASO 2: Determinar día de la semana y verificar si está activo
    // ============================================
    const diaSemana = fechaDate.getDay() // 0=domingo, 1=lunes, etc.
    const nombreDia = diasMap[diaSemana]
    const horarioDia = horariosConfig[nombreDia]

    console.log(`[GET /api/citas/disponibilidad] Día: ${nombreDia}, Activo: ${horarioDia?.activo}, Rangos: ${horarioDia?.rangos?.length || 0}`)

    // Si el día no está activo, retornar sin slots disponibles
    if (!horarioDia || !horarioDia.activo || !horarioDia.rangos || horarioDia.rangos.length === 0) {
      return NextResponse.json({
        fecha,
        duracion,
        dia: nombreDia,
        diaActivo: false,
        horarioLaboral: null,
        intervalo: 30,
        totalSlots: 0,
        disponibles: {
          total: 0,
          slots: []
        },
        ocupados: {
          total: 0,
          slots: []
        },
        recomendacion: `El día ${nombreDia} no está habilitado para citas. Verifica la configuración de horarios.`,
        siguienteDisponible: null
      })
    }

    // ============================================
    // PASO 3: Definir rango del día y obtener citas existentes
    // ============================================
    const startOfDay = new Date(fecha)
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date(fecha)
    endOfDay.setHours(23, 59, 59, 999)

    // Obtener TODAS las citas del día (filtraremos canceladas manualmente para case-insensitive)
    const todasCitasDelDia = await prisma.cita.findMany({
      where: {
        tenantId: auth.tenant.id,
        fechaHora: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      select: {
        id: true,
        fechaHora: true,
        duracion: true,
        titulo: true,
        estado: true
      },
      orderBy: {
        fechaHora: 'asc'
      }
    })

    // Filtrar citas canceladas con comparación case-insensitive
    const citasDelDia = todasCitasDelDia.filter(cita => {
      const estadoNormalizado = (cita.estado || '').toLowerCase().trim()
      return estadoNormalizado !== 'cancelada'
    })

    console.log(`[GET /api/citas/disponibilidad] Citas totales: ${todasCitasDelDia.length}, Activas (no canceladas): ${citasDelDia.length}`)

    // ============================================
    // PASO 4: Generar slots basados en los rangos horarios configurados
    // ============================================
    const intervaloMinutos = 30 // Bloques de 30 minutos
    const todosLosSlots: Date[] = []

    for (const rango of horarioDia.rangos) {
      const [horaInicio, minInicio] = rango.inicio.split(':').map(Number)
      const [horaFin, minFin] = rango.fin.split(':').map(Number)
      
      // Convertir a minutos totales para facilitar iteración
      const inicioMinutos = horaInicio * 60 + minInicio
      const finMinutos = horaFin * 60 + minFin

      for (let minutoActual = inicioMinutos; minutoActual < finMinutos; minutoActual += intervaloMinutos) {
        const hora = Math.floor(minutoActual / 60)
        const minuto = minutoActual % 60
        
        const slot = new Date(fecha)
        slot.setHours(hora, minuto, 0, 0)
        todosLosSlots.push(slot)
      }
    }

    // Ordenar slots cronológicamente
    todosLosSlots.sort((a, b) => a.getTime() - b.getTime())

    console.log(`[GET /api/citas/disponibilidad] Generados ${todosLosSlots.length} slots de ${intervaloMinutos} minutos`)

    // Función para verificar si un slot está ocupado (con buffer)
    const esSlotOcupado = (slot: Date): boolean => {
      const slotFin = new Date(slot.getTime() + (duracion + bufferMinutos) * 60000)

      return citasDelDia.some(cita => {
        const citaInicio = new Date(cita.fechaHora)
        const citaFin = new Date(citaInicio.getTime() + (cita.duracion + bufferMinutos) * 60000)

        return (
          (slot >= citaInicio && slot < citaFin) ||
          (slotFin > citaInicio && slotFin <= citaFin) ||
          (slot <= citaInicio && slotFin >= citaFin)
        )
      })
    }

    // Filtrar slots disponibles y ocupados
    const disponibles: string[] = []
    const ocupados: Array<{ hora: string; cita: { id: string; titulo: string; estado: string } }> = []
    const ahora = new Date()

    todosLosSlots.forEach(slot => {
      // Aplicar aviso mínimo: no mostrar slots que estén antes de ahora + avisoMinimoMin
      if (avisoMinimoMin > 0) {
        const minBookingTime = new Date(ahora.getTime() + avisoMinimoMin * 60000)
        if (slot < minBookingTime) return
      }

      // No mostrar slots que ya pasaron
      if (slot <= ahora) return

      const slotISO = slot.toISOString()
      
      if (esSlotOcupado(slot)) {
        const citaEnSlot = citasDelDia.find(cita => {
          const citaInicio = new Date(cita.fechaHora)
          const citaFin = new Date(citaInicio.getTime() + (cita.duracion + bufferMinutos) * 60000)
          return slot >= citaInicio && slot < citaFin
        })

        if (citaEnSlot) {
          ocupados.push({
            hora: slotISO,
            cita: {
              id: citaEnSlot.id,
              titulo: citaEnSlot.titulo || 'Sin título',
              estado: citaEnSlot.estado
            }
          })
        }
      } else {
        disponibles.push(slotISO)
      }
    })

    console.log(`[GET /api/citas/disponibilidad] Disponibles: ${disponibles.length}, Ocupados: ${ocupados.length}`)

    // Construir información de horarios laborales del día
    const horarioLaboralInfo = horarioDia.rangos.map(r => ({
      inicio: r.inicio,
      fin: r.fin
    }))

    // Respuesta al estilo Google Calendar
    return NextResponse.json({
      fecha,
      duracion,
      dia: nombreDia,
      diaActivo: true,
      horarioLaboral: {
        rangos: horarioLaboralInfo,
        resumen: horarioLaboralInfo.map(r => `${r.inicio}-${r.fin}`).join(', ')
      },
      intervalo: intervaloMinutos,
      totalSlots: todosLosSlots.length,
      disponibles: {
        total: disponibles.length,
        slots: disponibles
      },
      ocupados: {
        total: ocupados.length,
        slots: ocupados
      },
      recomendacion: disponibles.length > 0 
        ? `Hay ${disponibles.length} horarios disponibles. Primer horario: ${disponibles[0]}` 
        : 'No hay horarios disponibles para este día (todos los slots están ocupados)',
      siguienteDisponible: disponibles.length > 0 ? disponibles[0] : null
    })

  } catch (error: any) {
    console.error('[GET /api/citas/disponibilidad] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al consultar disponibilidad',
        details: error?.message || 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
