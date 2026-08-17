import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.ACADEMY_JWT_SECRET || 'volkern-academy-secret-2026';
const JWT_EXPIRES_IN = '30d'; // Longer sessions for learning

/**
 * AcademyAuthService
 * Specialized authentication for the Volkern Academy Portal.
 */
export class AcademyAuthService {
  /**
   * Registers a new Academy Learner.
   */
  static async register(data: {
    tenantId: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.erp_academy_users.create({
      data: {
        tenantId: data.tenantId,
        email: data.email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'LEARNER'
      } as any
    });

    // Automatically create an Estudiante profile
    await prisma.estudiante.create({
      data: {
        tenantId: data.tenantId,
        email: data.email,
        nombre: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        academyUserId: user.id
      }
    });

    return user;
  }

  /**
   * Authenticates a Learner.
   */
  static async login(email: string, password: string, deviceInfo?: string, ipAddress?: string) {
    const user = await prisma.erp_academy_users.findUnique({
      where: { email: email.toLowerCase(), status: 'ACTIVE' },
      include: { Estudiante: true }
    });

    if (!user) throw new Error('Credenciales inválidas');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error('Credenciales inválidas');

    // Update last login
    await prisma.erp_academy_users.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        uid: user.id, 
        tid: user.tenantId, 
        eid: (user as any).estudiante?.id,
        role: user.role 
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Persist session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.erp_academy_sessions.create({
      data: {
        userId: user.id,
        token: token,
        deviceInfo,
        ipAddress,
        expiresAt
      }
    });

    // Log the event
    await this.logEvent(user.tenantId, user.id, 'LOGIN', 'USER', user.id, { deviceInfo, ipAddress });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        estudianteId: (user as any).Estudiante?.id
      },
      token
    };
  }

  /**
   * Validates academy session.
   */
  static async validateToken(token: string) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      
      const session = await prisma.erp_academy_sessions.findUnique({
        where: { token, revoked: false },
        include: { erp_academy_users: true }
      });

      if (!session || session.expiresAt < new Date() || (session.erp_academy_users as any).status !== 'ACTIVE') {
        return null;
      }

      return {
        userId: decoded.uid,
        tenantId: decoded.tid,
        estudianteId: decoded.eid,
        role: decoded.role
      } as any;
    } catch (error) {
      return null;
    }
  }

  /**
   * Internal auditing for Academy.
   */
  private static async logEvent(tenantId: string, userId: string, eventType: string, entityType: string, entityId: string, payload?: any) {
    const integrityHash = jwt.sign({ tenantId, userId, eventType, timestamp: Date.now() }, JWT_SECRET);
    
    return await prisma.erp_academy_audit_logs.create({
      data: {
        tenantId,
        userId,
        eventType,
        entityType,
        entityId,
        payload: payload || {},
        integrityHash
      }
    });
  }
}
