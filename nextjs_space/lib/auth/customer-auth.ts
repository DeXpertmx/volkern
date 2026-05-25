import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'crypto';

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

    return await prisma.erp_customer_users.create({
      data: {
        tenantId: data.tenantId,
        email: data.email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        contactId: data.contactId,
        role: 'ADMIN', // Default for the first user of the company
        isActive: true,
        erp_customer_profiles: {
          create: {
            preferredLanguage: 'es',
            timezone: 'UTC'
          }
        }
      }
    });
  }

  /**
   * Authenticates a CustomerUser (erp_customer_users) 
   * or falls back to the internal User table (NextAuth).
   * Returns a JWT token + user data for mobile clients.
   */
  static async login(email: string, password: string, deviceInfo?: string, ipAddress?: string) {
    const cleanEmail = email.toLowerCase();

    // ── 1. Try erp_customer_users (customer portal) ──
    const customerUser = await prisma.erp_customer_users.findFirst({
      where: { email: cleanEmail, isActive: true },
      include: { Tenant: true }
    });

    if (customerUser) {
      const isValid = await bcrypt.compare(password, customerUser.passwordHash);
      if (!isValid) throw new Error('Credenciales inválidas');

      await prisma.erp_customer_users.update({
        where: { id: customerUser.id },
        data: { lastLoginAt: new Date() }
      });

      const token = jwt.sign(
        { 
          uid: customerUser.id, 
          tid: customerUser.tenantId, 
          cid: customerUser.contactId,
          role: customerUser.role 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await prisma.erp_customer_sessions.create({
        data: {
          id: randomUUID(),
          userId: customerUser.id,
          token: token,
          deviceInfo: deviceInfo,
          ipAddress: ipAddress,
          expiresAt: expiresAt
        }
      });

      const name = [customerUser.firstName, customerUser.lastName].filter(Boolean).join(' ');

      return {
        user: {
          id: customerUser.id,
          email: customerUser.email,
          name: name || customerUser.email.split('@')[0],
          firstName: customerUser.firstName,
          lastName: customerUser.lastName,
          role: customerUser.role,
          tenantId: customerUser.tenantId
        },
        token: token,
        sessionId: session.id
      };
    }

    // ── 2. Fallback: internal User (NextAuth) ──
    const internalUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        image: true,
        tenantId: true,
        roleId: true,
        role: {
          select: { nombre: true }
        }
      }
    });

    if (!internalUser || !internalUser.password) throw new Error('Credenciales inválidas');

    const isValid = await bcrypt.compare(password, internalUser.password);
    if (!isValid) throw new Error('Credenciales inválidas');

    // Generate JWT (no session in erp_customer_sessions — FK constraint to erp_customer_users)
    const token = jwt.sign(
      { 
        uid: internalUser.id, 
        tid: internalUser.tenantId, 
        role: internalUser.role?.nombre || 'admin'
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      user: {
        id: internalUser.id,
        email: internalUser.email,
        name: internalUser.name || internalUser.email.split('@')[0],
        firstName: internalUser.name || null,
        lastName: null,
        role: internalUser.role?.nombre || 'admin',
        tenantId: internalUser.tenantId || ''
      },
      token: token,
      sessionId: null
    };
  }

  /**
   * Validates a session token.
   * Supports both erp_customer_users (with session record) and
   * internal User table users (JWT-only verification).
   */
  static async validateToken(token: string) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);

      // ── 1. Try session-based validation (erp_customer_users) ──
      const session = await prisma.erp_customer_sessions.findUnique({
        where: { token, revoked: false },
        include: { erp_customer_users: true }
      });

      if (session) {
        if (session.expiresAt < new Date() || !session.erp_customer_users.isActive) {
          return null;
        }
        return {
          userId: decoded.uid,
          tenantId: decoded.tid,
          contactId: decoded.cid,
          role: decoded.role
        };
      }

      // ── 2. Fallback: verify User (NextAuth) table exists ──
      // Tokens from the User table fallback don't have a session record.
      // Verify the user still exists and is active.
      if (decoded.uid && decoded.tid) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.uid },
          select: { id: true, tenantId: true, email: true, estado: true }
        });

        if (user && user.tenantId === decoded.tid && user.estado === 'activo') {
          return {
            userId: decoded.uid,
            tenantId: decoded.tid,
            contactId: decoded.cid || null,
            role: decoded.role || 'admin'
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Revokes a session (Logout).
   */
  static async logout(token: string) {
    return await prisma.erp_customer_sessions.update({
      where: { token },
      data: { revoked: true }
    });
  }

  /**
   * Revokes all sessions for a user (Security reset).
   */
  static async revokeAllSessions(userId: string) {
    return await prisma.erp_customer_sessions.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true }
    });
  }
}
