import { prisma } from '@/lib/db';

/**
 * Skills del sistema de control horario.
 *
 * Historia (RGPD/LOPDGDD compliance, Julio 2026):
 *   La función `attendance_context_audit` original invocaba Gemma Vision sobre
 *   `attendance.evidenceUrl` para validar coincidencia facial y entorno de
 *   oficina (palabras clave 'pc' / 'office' / 'stranger'). Esto era un
 *   tratamiento de datos biométricos (RGPD Art. 9) sin base jurídica específica
 *   en el marco laboral español (LOPDGDD Art. 88). Por tanto se ha retirado.
 *
 *   La función que se conserva — `anomaly_pattern_detection` — se ha ampliado
 *   con detección "Impossible Travel" para que la auditoría diaria siga
 *   encontrando inconsistencias GPS que sí podemos argumentar como control
 *   horario legítimo (RGPD Art. 6.1.f interés legítimo + Art. 6.1.c obligación
 *   legal de RD-Ley 8/2010).
 */

export interface ImpossibleTravelAnomaly {
  ids: string[];
  message: string;
  speedKmh: number;
  elapsedMinutes: number;
  distanceMeters: number;
}

export interface ProximityAnomaly {
  ids: string[];
  message: string;
}

/**
 * SKILL: anomaly_pattern_detection
 *
 * Detecta patrones sospechosos en el marcaje diario del tenant:
 *   - "Impossible Travel": dos punches con >250 km/h de velocidad entre sí
 *     (manipulación de GPS / fuerza de spoofing).
 *   - "Marcaje en proximidad": dos punches con <5 s entre empleados distintos
 *     (posible suplantación / marcaje entre dos empleados en el mismo sitio).
 *
 * No usa ningún dato biométrico; sólo consultas a `prisma.attendance` ya
 * registradas.
 */
export async function anomaly_pattern_detection({
  tenantId,
  impossibleTravelKmh = 250,
  proximitySeconds = 5,
}: {
  tenantId: string;
  impossibleTravelKmh?: number;
  proximitySeconds?: number;
}): Promise<{ impossibleTravel: ImpossibleTravelAnomaly[]; proximity: ProximityAnomaly[] }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await prisma.attendance.findMany({
    where: { tenantId, timestamp: { gte: today } },
    orderBy: { timestamp: 'asc' },
  });

  const impossibleTravel: ImpossibleTravelAnomaly[] = [];
  const proximity: ProximityAnomaly[] = [];

  // ── Impossible Travel: comparar cada marcaje con el anterior del mismo empleado ──
  const byEmployee = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = byEmployee.get(log.employeeId) ?? [];
    list.push(log);
    byEmployee.set(log.employeeId, list);
  }

  const R = 6371e3; // radio Tierra metros
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLam = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) * Math.sin(dLam / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  byEmployee.forEach((employeeLogs) => {
    for (let i = 1; i < employeeLogs.length; i++) {
      const prev = employeeLogs[i - 1];
      const curr = employeeLogs[i];
      if (
        prev.locationLat === null || prev.locationLng === null ||
        curr.locationLat === null || curr.locationLng === null
      ) {
        continue;
      }
      const distanceM = haversine(prev.locationLat, prev.locationLng, curr.locationLat, curr.locationLng);
      const elapsedMs = curr.timestamp.getTime() - prev.timestamp.getTime();
      const elapsedMinutes = elapsedMs / (1000 * 60);
      if (elapsedMs <= 0) continue;
      const speedKmh = distanceM / 1000 / (elapsedMs / (1000 * 60 * 60));
      if (speedKmh > impossibleTravelKmh) {
        impossibleTravel.push({
          ids: [prev.id, curr.id],
          message: `Velocidad inverosímil (${speedKmh.toFixed(0)} km/h) entre marcajes del mismo empleado. Posible spoofing GPS.`,
          speedKmh,
          elapsedMinutes,
          distanceMeters: distanceM,
        });
      }
    }
  });

  // ── Marcajes en proximidad entre empleados distintos ──
  const inPunches = logs.filter((l) => l.type === 'IN');
  for (let i = 0; i < inPunches.length - 1; i++) {
    const diff = Math.abs(
      inPunches[i].timestamp.getTime() - inPunches[i + 1].timestamp.getTime(),
    );
    if (diff < proximitySeconds * 1000 && inPunches[i].employeeId !== inPunches[i + 1].employeeId) {
      proximity.push({
        ids: [inPunches[i].id, inPunches[i + 1].id],
        message: 'Marcaje en proximidad detectado: posible registro por terceros.',
      });
    }
  }

  return { impossibleTravel, proximity };
}

/**
 * SKILL: geo_anomaly_review
 *
 * Comodín para revisión humana de anomalías GPS. Las anomalías se mantienen como
 * flag (`isAnomaly: true` con `anomalyType`) en el registro de attendance y son
 * revisadas por managers (NO automatizadas, RGPD Art. 22 — sin decisiones
 * automatizadas con efectos jurídicos significativos sobre el empleado).
 */
export async function geo_anomaly_review({ tenantId }: { tenantId: string }) {
  const anomalies = await prisma.attendance.findMany({
    where: { tenantId, isAnomaly: true },
    orderBy: { timestamp: 'desc' },
    take: 50,
    include: { employee: { select: { id: true, fullName: true } } },
  });
  return anomalies.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    employeeName: a.employee.fullName,
    type: a.type,
    timestamp: a.timestamp,
    anomalyType: a.anomalyType,
    locationLat: a.locationLat,
    locationLng: a.locationLng,
  }));
}
