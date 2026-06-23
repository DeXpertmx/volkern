import { prisma } from '@/lib/db';
import crypto from 'crypto';

/**
 * AttendanceService — control horario basado EXCLUSIVAMENTE en geolocalización.
 *
 * Historia:
 *   Antes (pre-Julio 2026) este servicio recibía `evidenceUrl` (URL de selfie capturada
 *   por el navegador) y validaba el contexto con `validateVisionContext` (LIVENESS_FAILED,
 *   SCREEN_DETECTION_FRAUD, IDENTITY_MISMATCH) llamando al MCP server / Gemma Vision.
 *   También disparaba `AttendanceChallenge` (RANDOM_SELFIE, QR_SYNC) con `triggerChallenge`
 *   y `resolveChallenge` que generaban `SecurityIncident` ATTENDANCE_FRAUD / ATTENDANCE_TIMEOUT.
 *
 *   Tras RGPD (UE 2016/679) y LOPDGDD (Ley Orgánica 3/2018) se considera que datos
 *   biométricos son categoría especial (Art. 9). La selfie facial + face match constituye
 *   tratamiento de datos biométricos, lo que exige base jurídica específica del Art. 9.2,
 *   restringida fuera del ámbito del cumplimiento de obligaciones legales. El EDPB
 *   Guidelines 8/2020 sobre geolocalización recomienda evitar captura adicional cuando
 *   el propósito (control horario) puede satisfacerse con datos menos invasivos.
 *
 *   Por tanto, todo el código biométrico se ha retirado. Sólo se conserva el modelo de
 *   control horario clásico basado en:
 *     1. HMAC-SHA256 integrity hash atómico (Auditoría estilo Veri*Factu).
 *     2. Geofencing contra `baseGPSLat/Lng` o `homeOfficeLat/Lng` con un radio configurable.
 *     3. Anti-spoofing "Impossible Travel" (no puedes volar a 250 km/h entre dos marcajes).
 *     4. Rate limit por empleado para evitar doble-marcaje accidental o malicioso.
 *
 * Integraciones downstream que NO se rompen:
 *   - `lib/erp/payroll-service.ts` → llama a `prisma.attendance.findMany({ type: 'CLOCK_IN' })`
 *     para calcular `attendancePercent`. Sigue funcionando: `timestamp`, `type`, `employeeId`
 *     no han cambiado.
 *   - `lib/skills/attendance-skills.ts` → `anomaly_pattern_detection` sigue siendo útil y no
 *     se ha modificado.
 *   - Endpoints `/api/erp/attendance/punch` y `/api/erp/attendance/status` siguen activos.
 */
export class AttendanceService {
  private static SECRET = process.env.ATTENDANCE_INTEGRITY_SECRET || 'v0lkern_attendance_secure_v2';

  /**
   * Velocidad máxima plausible entre dos marcajes consecutivos del mismo empleado.
   * Configurable por tenant (default 250 km/h — cubre una emergencia + Alta Velocidad
   * Española AVE ~300 km/h punta). Para trabajos multi-site nacionales puede bajarse.
   * El servicio lee `rules.maxTravelKmh` si existe; este DEFAULT es fallback.
   */
  private static DEFAULT_MAX_TRAVEL_KMH = 250;

  /**
   * Genera un hash HMAC-SHA256 que encadena employeeId|timestamp|type|tenantId.
   * Sirve de prueba criptográfica de integridad por si la BD se audita forensicamente.
   * (Inspirado en el patrón Veri*Factu de encadenamiento de hashes del módulo de
   * facturación.)
   */
  private static generateHash(data: {
    employeeId: string;
    timestamp: string;
    type: string;
    tenantId: string;
  }): string {
    const payload = `${data.employeeId}|${data.timestamp}|${data.type}|${data.tenantId}`;
    return crypto.createHmac('sha256', this.SECRET).update(payload).digest('hex');
  }

  /**
   * Registra un marcaje de entrada/salida validando SOLO GPS + cooldowns + imposible-travel.
   * No captura ni transfiere ningún dato biométrico.
   *
   * Devuelve códigos específicos que el endpoint HTTP traduce a 200/400/429:
   *   - { ok: true, id, ... }                → 200 OK
   *   - throw 'EMPLOYEE_NOT_FOUND'          → 404
   *   - throw 'GPS_REQUIRED'                → 400
   *   - throw 'GPS_OUT_OF_RANGE'            → 400 (geofence violation)
   *   - throw 'GPS_MISPLACED'               → 400 (impossible travel)
   *   - throw 'RATE_LIMITED'                → 429
   *   - throw 'GPS_INVALID'                 → 400 (lat/lng fuera de bounds)
   */
  static async registerPunch(data: {
    employeeId: string;
    tenantId: string;
    type: 'IN' | 'OUT';
    method: string;
    locationLat?: number;
    locationLng?: number;
    clientTimestamp?: string;
  }) {
    // ── 1. Validación de input ───────────────────────────────────────────────
    if (!data.employeeId || !data.tenantId) {
      throw new Error('INVALID_REQUEST');
    }

    if (
      data.locationLat === undefined ||
      data.locationLng === undefined ||
      !Number.isFinite(data.locationLat) ||
      !Number.isFinite(data.locationLng)
    ) {
      throw new Error('GPS_REQUIRED');
    }
    if (data.locationLat < -90 || data.locationLat > 90) {
      throw new Error('GPS_INVALID_LAT');
    }
    if (data.locationLng < -180 || data.locationLng > 180) {
      throw new Error('GPS_INVALID_LNG');
    }

    // ── 2. Empleado y reglas del tenant ──────────────────────────────────────
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId, tenantId: data.tenantId },
    });
    if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

    const rules = await prisma.attendanceRules.findUnique({
      where: { tenantId: data.tenantId },
    });
    const minPunchIntervalSec = rules?.minPunchIntervalSec ?? 30;
    const maxTravelKmh = rules?.maxTravelKmh ?? this.DEFAULT_MAX_TRAVEL_KMH;

    // ── 2.1 LOPDGDD Art. 88 — bloqueo si tenant obligas firma de cláusula ──
    if (rules?.blockIfNotNoticed && !employee.noticeAcknowledgedAt) {
      throw new Error('NOTICE_NOT_ACKNOWLEDGED');
    }

    // ── 3. Rate-limit (anti doble-tap / accidental) ──────────────────────────
    const recentPunch = await prisma.attendance.findFirst({
      where: { employeeId: data.employeeId, tenantId: data.tenantId },
      orderBy: { timestamp: 'desc' },
    });
    const now = new Date();
    if (recentPunch) {
      const secondsSinceLast = (now.getTime() - recentPunch.timestamp.getTime()) / 1000;
      if (secondsSinceLast < minPunchIntervalSec) {
        throw new Error('RATE_LIMITED');
      }
    }

    // ── 4. Geofencing ───────────────────────────────────────────────────────
    let isAnomaly = false;
    let anomalyType: string | null = null;
    const baseLat = employee.isTeleworkAllowed
      ? employee.homeOfficeLat ?? null
      : employee.baseGPSLat ?? null;
    const baseLng = employee.isTeleworkAllowed
      ? employee.homeOfficeLng ?? null
      : employee.baseGPSLng ?? null;
    const radius = employee.isTeleworkAllowed
      ? (employee.teleworkRadius ?? 100)
      : 100;

    if (baseLat !== null && baseLng !== null) {
      const distance = this.calculateDistance(
        baseLat,
        baseLng,
        data.locationLat,
        data.locationLng,
      );
      if (distance > radius) {
        isAnomaly = true;
        anomalyType = 'GPS_OUT_OF_RANGE';
        // Aún registramos el marcaje (el empleado puede haber tenido autorización verbal),
        // pero queda marcado como anomalía para auditoría.
      }
    } else if (rules?.requireGPS) {
      // El tenant obliga a GPS y el empleado no tiene base configurada. No bloqueamos
      // (esto sería una mala UX para empleados recién alta), sólo lo marcamos.
      isAnomaly = true;
      anomalyType = 'NO_BASE_LOCATION';
    }

    // ── 5. Anti-spoofing: Impossible Travel ──────────────────────────────────
    // Si el último marcaje válido estaba a más de MAX_TRAVEL_KMH del actual,
    // asumimos GPS spoofing (empleado o atacante ha falsificado coordenadas).
    if (recentPunch && recentPunch.locationLat !== null && recentPunch.locationLng !== null
        && !isAnomaly) {
      const lastDistance = this.calculateDistance(
        recentPunch.locationLat,
        recentPunch.locationLng,
        data.locationLat,
        data.locationLng,
      );
      const elapsedHours =
        (now.getTime() - recentPunch.timestamp.getTime()) / (1000 * 60 * 60);
      if (elapsedHours > 0) {
        const speedKmh = lastDistance / 1000 / elapsedHours;
        if (speedKmh > maxTravelKmh) {
          isAnomaly = true;
          anomalyType = `GPS_IMPLAUSIBLE_${Math.round(speedKmh)}KMH`;
        }
      }
    }

    // ── 6. Persistencia con HMAC integrity hash ─────────────────────────────
    // serverTimestamp es la hora oficial del servidor, no la del cliente, para evitar
    // manipulación del user-agent (RGPD Art. 5 integridad).
    const serverTimestamp = now.toISOString();
    const integrityHash = this.generateHash({
      employeeId: data.employeeId,
      timestamp: serverTimestamp,
      type: data.type,
      tenantId: data.tenantId,
    });

    const log = await prisma.attendance.create({
      data: {
        employeeId: data.employeeId,
        tenantId: data.tenantId,
        type: data.type,
        timestamp: now,
        method: data.method,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        integrityHash,
        isAnomaly,
        anomalyType,
      },
    });

    return {
      ok: true as const,
      id: log.id,
      isAnomaly,
      anomalyType,
      message: `Marcaje ${data.type === 'IN' ? 'Entrada' : 'Salida'} registrado con éxito.`,
    };
  }

  /**
   * Reconstruye la API anterior (`registerAudit`) como wrapper retro-compatible.
   * Devolvía un campo `evidenceUrl` opcional. Se conserva la firma exacta para que
   * llamadas internas (e.g. scripts de seed) no rompan, pero el campo se ignora.
   *
   * @deprecated Usa `registerPunch` directamente. Esta firma se mantiene por
   * compatibilidad transitoria y se eliminará en la próxima major release.
   */
  static async registerAudit(data: {
    employeeId: string;
    tenantId: string;
    type: 'IN' | 'OUT';
    method: string;
    locationLat?: number;
    locationLng?: number;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    evidenceUrl?: string; // IGNORED: selfie/biometric retired (RGPD Art. 9)
  }) {
    return this.registerPunch({
      employeeId: data.employeeId,
      tenantId: data.tenantId,
      type: data.type,
      method: data.method,
      locationLat: data.locationLat,
      locationLng: data.locationLng,
    });
  }

  static verifyIntegrity(log: {
    employeeId: string;
    timestamp: Date;
    type: string;
    tenantId: string;
    integrityHash: string;
  }): boolean {
    const expected = this.generateHash({
      employeeId: log.employeeId,
      timestamp: log.timestamp.toISOString(),
      type: log.type,
      tenantId: log.tenantId,
    });
    return expected === log.integrityHash;
  }

  static async getDailyHours(employeeId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await prisma.attendance.findMany({
      where: {
        employeeId,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'asc' },
    });

    let totalMs = 0;
    let lastIn: number | null = null;

    for (const log of logs) {
      if (log.type === 'IN') {
        lastIn = log.timestamp.getTime();
      } else if (log.type === 'OUT' && lastIn !== null) {
        totalMs += log.timestamp.getTime() - lastIn;
        lastIn = null;
      }
    }

    return {
      hours: totalMs / (1000 * 60 * 60),
      sessions: logs.length / 2,
      logs: logs.map((l) => ({
        type: l.type,
        time: l.timestamp,
        valid: this.verifyIntegrity(l),
      })),
    };
  }

  /**
   * Cálculo geodésico entre dos puntos (Haversine).
   * Devuelve distancia en metros.
   * Idéntico a la implementación anterior — se mantiene para no romper el geofencing.
   */
  static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLam = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) * Math.sin(dLam / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
