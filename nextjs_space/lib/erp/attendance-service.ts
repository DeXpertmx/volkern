import { prisma } from '@/lib/db';
import crypto from 'crypto';

export class AttendanceService {
  private static SECRET = process.env.ATTENDANCE_INTEGRITY_SECRET || 'v0lkern_attendance_secure_v2';

  /**
   * Genera un hash HMAC para asegurar la integridad de la entrada/salida
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
   * Registra una Entrada o Salida (Punch Clock)
   */
  static async registerAudit(data: {
    employeeId: string;
    tenantId: string;
    type: 'IN' | 'OUT';
    method: string;
    locationLat?: number;
    locationLng?: number;
    evidenceUrl?: string;
  }) {
    const timestamp = new Date().toISOString();
    const integrityHash = this.generateHash({
      employeeId: data.employeeId,
      timestamp,
      type: data.type,
      tenantId: data.tenantId
    });

    // 1. Validar Geofencing
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId, tenantId: data.tenantId }
    });

    if (!employee) throw new Error('Empleado no encontrado');

    let isAnomaly = false;
    let anomalyType = null;

    if (data.locationLat && data.locationLng) {
      // 📍 Oboarding 2.0: Validar contra Estación Base o Home Office
      const targetLat = employee.isTeleworkAllowed ? employee.homeOfficeLat : employee.baseGPSLat;
      const targetLng = employee.isTeleworkAllowed ? employee.homeOfficeLng : employee.baseGPSLng;
      const radius = employee.isTeleworkAllowed ? employee.teleworkRadius : 100;

      if (targetLat && targetLng) {
        const distance = this.calculateDistance(targetLat, targetLng, data.locationLat, data.locationLng);
        if (distance > radius) {
          isAnomaly = true;
          anomalyType = 'GPS_MISMATCH';
        }
      }
    }

    // 📸 Oboarding 2.0: Validación de Selfie Contextual (Vision AI)
    if (data.evidenceUrl && !isAnomaly) {
      const visionResult = await this.validateVisionContext(data.evidenceUrl, employee);
      if (!visionResult.valid) {
        isAnomaly = true;
        anomalyType = visionResult.reason;
      }
    }

    // 2. Persistir Registro
    const log = await prisma.attendance.create({
      data: {
        employeeId: data.employeeId,
        tenantId: data.tenantId,
        type: data.type,
        timestamp: new Date(timestamp),
        method: data.method,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        integrityHash,
        evidenceUrl: data.evidenceUrl,
        isAnomaly,
        anomalyType
      }
    });

    return { 
      success: true, 
      id: log.id, 
      isAnomaly, 
      anomalyType,
      message: `Marcaje ${data.type === 'IN' ? 'Entrada' : 'Salida'} registrado con éxito.`
    };
  }

  /**
   * Verifica la integridad de un registro contra su Hash
   */
  static verifyIntegrity(log: any): boolean {
    const expected = this.generateHash({
      employeeId: log.employeeId,
      timestamp: log.timestamp.toISOString(),
      type: log.type,
      tenantId: log.tenantId
    });
    return expected === log.integrityHash;
  }

  /**
   * Cálculo de Horas Efectivas Diarias (Jornadas partidas)
   */
  static async getDailyHours(employeeId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await prisma.attendance.findMany({
      where: {
        employeeId,
        timestamp: { gte: startOfDay, lte: endOfDay }
      },
      orderBy: { timestamp: 'asc' }
    });

    let totalMs = 0;
    let lastIn: number | null = null;

    for (const log of logs) {
      if (log.type === 'IN') {
        lastIn = log.timestamp.getTime();
      } else if (log.type === 'OUT' && lastIn !== null) {
        totalMs += (log.timestamp.getTime() - lastIn);
        lastIn = null;
      }
    }

    return {
      hours: totalMs / (1000 * 60 * 60),
      sessions: logs.length / 2, // Estimado
      logs: logs.map(l => ({ 
        type: l.type, 
        time: l.timestamp, 
        valid: this.verifyIntegrity(l) 
      }))
    };
  }

  /**
   * Dispara un desafío aleatorio (Random Pulse)
   */
  static async triggerChallenge(attendanceId: string, type: 'RANDOM_SELFIE' | 'QR_SYNC') {
    const deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + 3); // 3 minutos para responder

    const challenge = await prisma.attendanceChallenge.create({
      data: {
        attendanceId,
        type,
        deadline,
        status: 'PENDING'
      },
      include: {
        attendance: { include: { employee: true } }
      }
    });

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    await notifyByTelegram(`🚨 <b>DESAFÍO DE PULSO (RANDOM PULSE)</b>\nEmpleado: ${challenge.attendance.employee.fullName}\nAcción: ${type}\n<i>Límite: 3 minutos.</i>`, { 
      tenantId: challenge.attendance.tenantId 
    } as any);

    return challenge;
  }

  /**
   * Resuelve un desafío (PASSED / FAILED)
   */
  static async resolveChallenge(challengeId: string, status: 'PASSED' | 'FAILED', evidenceUrl?: string) {
    const challenge = await prisma.attendanceChallenge.update({
      where: { id: challengeId },
      data: { status, evidenceUrl },
      include: { attendance: { include: { employee: true } } }
    });

    if (status === 'FAILED') {
      await prisma.securityIncident.create({
        data: {
          tenantId: challenge.attendance.tenantId,
          type: 'ATTENDANCE_FRAUD',
          severity: 'HIGH',
          details: `Desafío RECHAZADO para ${challenge.attendance.employee.fullName}. Evidencia: ${evidenceUrl}`
        }
      });
    }

    return challenge;
  }

  /**
   * Auditoría de Timeouts (Random Pulse)
   */
  static async checkTimeouts(tenantId: string) {
    const now = new Date();
    const timeouts = await prisma.attendanceChallenge.findMany({
      where: {
        status: 'PENDING',
        deadline: { lt: now },
        attendance: { tenantId }
      },
      include: { attendance: { include: { employee: true } } }
    });

    for (const challenge of timeouts) {
      await prisma.attendanceChallenge.update({
        where: { id: challenge.id },
        data: { status: 'TIMEOUT' }
      });

      await prisma.securityIncident.create({
        data: {
          tenantId,
          type: 'ATTENDANCE_TIMEOUT',
          severity: 'MEDIUM',
          details: `Desafío de pulso EXPIRADO para ${challenge.attendance.employee.fullName}. El empleado no respondió en el tiempo límite.`
        }
      });
    }

    return timeouts.length;
  }

  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * 🤖 Gemma 4 Vision Validator
   * Analiza el selfie buscando parpadeo, entorno y fraude por pantalla.
   */
  private static async validateVisionContext(imageUrl: string, employee: any): Promise<{valid: boolean, reason?: string}> {
    console.log(`[VisionAI] Analizando contexto para empleado: ${employee.fullName}`);
    
    // Simulación de respuesta de Gemma 4 Vision
    // En producción esto llamaría al MCP Handler o directamente al Vertex AI / Gemma Endpoint
    
    // Caso 1: Liveness Detection (¿Es una persona real?)
    const scoreLiveness = Math.random(); // Placeholder
    if (scoreLiveness < 0.1) {
      return { valid: false, reason: 'LIVENESS_FAILED' };
    }

    // Caso 2: Anti-Proxy / Screen Detection (¿Está tomando foto a una pantalla?)
    const screenDetected = Math.random() < 0.05; // Placeholder
    if (screenDetected) {
      return { valid: false, reason: 'SCREEN_DETECTION_FRAUD' };
    }

    // Caso 3: Match Facial (¿Es la misma persona del patrón?)
    // Aquí compararíamos contra employee.faceVector
    
    return { valid: true };
  }
}
