import { prisma } from '@/lib/db';

export interface RangoHorario {
  inicio: string; // "09:00"
  fin: string;    // "17:00"
}

export interface DiaHorario {
  activo: boolean;
  rangos: RangoHorario[];
}

export interface HorariosConfig {
  lunes: DiaHorario;
  martes: DiaHorario;
  miercoles: DiaHorario;
  jueves: DiaHorario;
  viernes: DiaHorario;
  sabado: DiaHorario;
  domingo: DiaHorario;
}

const diasMap: Record<number, keyof HorariosConfig> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado'
};

const defaultHorarios: HorariosConfig = {
  lunes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  martes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  miercoles: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  jueves: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  viernes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  sabado: { activo: false, rangos: [] },
  domingo: { activo: false, rangos: [] },
};

export async function checkAvailability(params: {
  tenantId: string;
  fecha: string; // YYYY-MM-DD
  duracion?: number;
  buffer?: number;
  avisoMinimo?: number;
}) {
  const { tenantId, fecha, duracion = 60, buffer = 0, avisoMinimo = 0 } = params;
  const fechaDate = new Date(fecha);

  // 1. Obtener configuración
  const configHorarios = await prisma.configuracion.findFirst({
    where: { tenantId, clave: 'horariosAtencion' }
  });

  let horariosConfig: HorariosConfig = defaultHorarios;
  if (configHorarios?.valor) {
    try {
      horariosConfig = JSON.parse(configHorarios.valor);
    } catch (e) {
      console.error('Error parseando horarios:', e);
    }
  }

  // 2. Verificar día activo
  const diaSemana = fechaDate.getDay();
  const nombreDia = diasMap[diaSemana];
  const horarioDia = horariosConfig[nombreDia];

  if (!horarioDia || !horarioDia.activo || !horarioDia.rangos || horarioDia.rangos.length === 0) {
    return { 
      disponible: false, 
      slots: [], 
      motivo: 'Día no laboral',
      dia: nombreDia,
      totalSlots: 0
    };
  }

  // 3. Obtener citas existentes
  const startOfDay = new Date(fecha);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(fecha);
  endOfDay.setHours(23, 59, 59, 999);

  const citas = await prisma.cita.findMany({
    where: {
      tenantId,
      fechaHora: { gte: startOfDay, lte: endOfDay },
      estado: { notIn: ['cancelada', 'Cancelada', 'CANCELADA'] as any }
    }
  });

  // 4. Generar slots
  const intervaloMinutos = 30;
  const disponibles: string[] = [];
  const ahora = new Date();

  for (const rango of horarioDia.rangos) {
    const [hInicio, mInicio] = rango.inicio.split(':').map(Number);
    const [hFin, mFin] = rango.fin.split(':').map(Number);
    const inicioMinutos = hInicio * 60 + mInicio;
    const finMinutos = hFin * 60 + mFin;

    for (let current = inicioMinutos; current < finMinutos; current += intervaloMinutos) {
      const slot = new Date(fecha);
      slot.setHours(Math.floor(current / 60), current % 60, 0, 0);

      if (avisoMinimo > 0 && slot < new Date(ahora.getTime() + avisoMinimo * 60000)) continue;
      if (slot <= ahora) continue;

      const slotFin = new Date(slot.getTime() + (duracion + buffer) * 60000);
      const isOccupied = citas.some((cita: any) => {
        const cInicio = new Date(cita.fechaHora);
        const cFin = new Date(cInicio.getTime() + (cita.duracion + buffer) * 60000);
        return (slot >= cInicio && slot < cFin) || (slotFin > cInicio && slotFin <= cFin);
      });

      if (!isOccupied) {
        disponibles.push(slot.toISOString());
      }
    }
  }

  return {
    disponible: disponibles.length > 0,
    slots: disponibles,
    dia: nombreDia,
    totalSlots: disponibles.length
  };
}
