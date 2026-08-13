import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { TwoFactorService } from './security/two-factor'
import fs from 'fs'
import path from 'path'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // Dominio de cookie configurable por despliegue:
        //  - por defecto '.volkern.app' (multi-tenant en Vercel, sin cambios)
        //  - AUTH_COOKIE_DOMAIN=none → cookie host-only (despliegues en otros dominios,
        //    p.ej. erp.dimension.expert en el VPS)
        ...(process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_DOMAIN !== 'none'
          ? { domain: process.env.AUTH_COOKIE_DOMAIN || '.volkern.app' }
          : {}),
      }
    }
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        code: { label: '2FA Code', type: 'text' }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const cleanEmail = credentials.email.trim().toLowerCase();

        // 🔴 CRÍTICO: Detectar subdominio desde el hostname de la request
        const hostname = req.headers?.host || ''
        let requestSubdomain: string | null = null
        
        const cleanHost = hostname.replace(/:.*$/, '')
        console.log(`[DEBUG-AUTH] Hostname: ${cleanHost}`);
        
        // Lógica de detección de subdominio mejorada
        if (cleanHost.includes('.volkern.app')) {
          const parts = cleanHost.split('.')
          if (parts.length >= 3) {
            requestSubdomain = parts[0]
          }
        } else if (cleanHost.endsWith('localhost') && cleanHost !== 'localhost') {
          requestSubdomain = cleanHost.split('.')[0]
        }
        
        console.log(`[DEBUG-AUTH] Request Subdomain: ${requestSubdomain}`);

        // Buscamos el usuario incluyendo el tokenVersion para cierre global
        const user = await prisma.user.findUnique({
          where: { email: cleanEmail },
          select: {
            id: true,
            email: true,
            password: true,
            name: true,
            image: true,
            tenantId: true,
            roleId: true,
            tokenVersion: true,
            role: {
              select: { nombre: true }
            },
            tenant: {
              select: { accountType: true, subdomain: true }
            }
          }
        })

        if (!user || !user.password) {
          console.warn(`[DEBUG-AUTH] Usuario no encontrado: ${cleanEmail}`);
          // No podemos loguear a la tabla auditLog si no hay usuario ni tenantID claro, 
          // pero al menos lo dejamos en el log de Vercel
          return null
        }

        console.log(`[DEBUG-AUTH] User Tenant Subdomain: ${user.tenant?.subdomain}`);

        // 🔴 VALIDACIÓN CRUZADA: Si hay subdominio en request, el usuario debe pertenecer a ese tenant
        // Los subdominios reservados (admin, www, app, api, auth, etc.) son portales multi-tenant
        // y no deben aplicar validación cruzada.
        const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'auth', 'login', 'register', 'dashboard', 'webcreator', 'admin']);
        const isReservedSubdomain = requestSubdomain ? RESERVED_SUBDOMAINS.has(requestSubdomain) : false;

        if (requestSubdomain && !isReservedSubdomain && user.tenant?.subdomain !== requestSubdomain) {
          console.warn(`[DEBUG-AUTH] Mismatch: Request=${requestSubdomain}, UserTenant=${user.tenant?.subdomain}`);
          await prisma.auditLog.create({
            data: {
              accion: 'LOGIN_FAILURE',
              entidad: 'User',
              entidadId: user.id,
              descripcion: `Mismatch de subdominio: Request=${requestSubdomain}, Tenant=${user.tenant?.subdomain}`,
              tenantId: user.tenantId,
              userId: user.id
            }
          }).catch(e => console.error('[DEBUG-AUTH] Error logging mismatch:', e))
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )
        
        console.log(`[DEBUG-AUTH] Password Valid: ${isPasswordValid}`);

        if (!isPasswordValid) {
          await prisma.auditLog.create({
            data: {
              accion: 'LOGIN_FAILURE',
              entidad: 'User',
              entidadId: user.id,
              descripcion: `Contraseña inválida para usuario ${cleanEmail}`,
              tenantId: user.tenantId,
              userId: user.id
            }
          }).catch(e => console.error('[DEBUG-AUTH] Error logging failure:', e))
          return null
        }

        // Lógica de 2FA protegida contra fallos de esquema (con SQL directo para máxima estabilidad)
        try {
          const rawUserData: any[] = await prisma.$queryRawUnsafe(
            `SELECT "isTwoFactorEnabled" FROM "User" WHERE id = $1`,
            user.id
          );
          
          const firstRow = rawUserData[0] || {};
          const isMfaActive = firstRow.isTwoFactorEnabled === true || firstRow.istwofactorenabled === true;
          
          // Si tiene 2FA habilitado y NO se ha proporcionado código
          if (isMfaActive && !credentials.code) {
            const code = await TwoFactorService.generateCode(user.id);
            await TwoFactorService.sendVerificationEmail(user.email, code);
            throw new Error('2FA_REQUIRED');
          }

          // Si tiene 2FA habilitado y SE HA proporcionado código
          if (isMfaActive && credentials.code) {
            const isValid = await TwoFactorService.verifyCode(user.id, credentials.code);
            if (!isValid) throw new Error('INVALID_2FA_CODE');
          }
        } catch (mfaError: any) {
          if (mfaError.message === '2FA_REQUIRED' || mfaError.message === 'INVALID_2FA_CODE') {
            throw mfaError;
          }
          // Si hay un error de servicio, ignoramos por ahora para no bloquear el login si el esquema falla
          console.error('[MFA] Error:', mfaError.message);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          tenantId: user.tenantId,
          roleId: user.roleId,
          roleName: user.role?.nombre,
          accountType: user.tenant?.accountType,
          tenantSubdomain: user.tenant?.subdomain,
          tokenVersion: user.tokenVersion,
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 horas
  },
  pages: {
    signIn: '/auth/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as any).tenantId
        token.roleId = (user as any).roleId
        token.roleName = (user as any).roleName
        token.accountType = (user as any).accountType
        token.tokenVersion = (user as any).tokenVersion
        token.tenantSubdomain = (user as any).tenantSubdomain
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub!
        ;(session.user as any).tenantId = token.tenantId as string
        ;(session.user as any).roleId = token.roleId as string
        ;(session.user as any).roleName = token.roleName as string
        ;(session.user as any).accountType = token.accountType as string
        ;(session.user as any).tokenVersion = token.tokenVersion as number
        ;(session.user as any).tenantSubdomain = token.tenantSubdomain as string
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Si la URL empieza con /, es interna
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Si es una URL completa, verificamos si es del dominio volkern.app
      else if (new URL(url).origin.endsWith(".volkern.app") || new URL(url).origin.endsWith(".localhost")) return url
      return baseUrl
    }

  }
}
