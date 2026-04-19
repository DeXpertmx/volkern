import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026';
const JWT_EXPIRES_IN = '7d';

/**
 * CustomerAuthService
 * Dedicated authentication engine for the Customer Portal.
 */
export class CustomerAuthService {
  /**
   * Registers a new CustomerUser.
   * Usually called via an invitation or a validated registration.
   */
  static async register(data: {
    tenantId: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    contactId?: string;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 12);

    return await prisma.customerUser.create({
      data: {
        tenantId: data.tenantId,
        email: data.email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        contactId: data.contactId,
        role: 'ADMIN', // Default for the first user of the company
        isActive: true,
        profile: {
          create: {
            preferredLanguage: 'es',
            timezone: 'UTC'
          }
        }
      }
    });
  }

  /**
   * Authenticates a CustomerUser and generates a session.
   */
  static async login(email: string, password: string, deviceInfo?: string, ipAddress?: string) {
    const user = await prisma.customerUser.findUnique({
      where: { email: email.toLowerCase(), isActive: true },
      include: { tenant: true }
    });

    if (!user) throw new Error('Credenciales inválidas');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error('Credenciales inválidas');

    // Update last login
    await prisma.customerUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        uid: user.id, 
        tid: user.tenantId, 
        cid: user.contactId,
        role: user.role 
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Create a database-backed session for audit and revocation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.customerSession.create({
      data: {
        userId: user.id,
        token: token,
        deviceInfo: deviceInfo,
        ipAddress: ipAddress,
        expiresAt: expiresAt
      }
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId
      },
      token: token,
      sessionId: session.id
    };
  }

  /**
   * Validates a session token.
   */
  static async validateToken(token: string) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      
      // Verify session in DB
      const session = await prisma.customerSession.findUnique({
        where: { token, revoked: false },
        include: { user: true }
      });

      if (!session || session.expiresAt < new Date() || !session.user.isActive) {
        return null;
      }

      return {
        userId: decoded.uid,
        tenantId: decoded.tid,
        contactId: decoded.cid,
        role: decoded.role
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Revokes a session (Logout).
   */
  static async logout(token: string) {
    return await prisma.customerSession.update({
      where: { token },
      data: { revoked: true }
    });
  }

  /**
   * Revokes all sessions for a user (Security reset).
   */
  static async revokeAllSessions(userId: string) {
    return await prisma.customerSession.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true }
    });
  }
}
