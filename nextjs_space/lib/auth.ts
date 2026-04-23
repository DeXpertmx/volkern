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
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        code: { label: '2FA Code', type: 'text' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const cleanEmail = credentials.email.trim().toLowerCase();

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
              select: { accountType: true }
            }
          }
        })

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
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
          // Si hay un error de servicio, ahora bloqueamos por seguridad (MFA obligatorio)
          throw new Error('MFA_SERVICE_ERROR');
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
          tokenVersion: user.tokenVersion,
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 60, // 30 minutos de inactividad
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
      }

      // Verificación de Seguridad Global: ¿El tokenVersion sigue siendo el mismo?
      try {
        if (token.sub) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: { tokenVersion: true }
          });

          if (!dbUser || dbUser.tokenVersion !== token.tokenVersion) {
            return null; // Invalida el token y fuerza logout
          }
        }
      } catch (e) {
        // En caso de error de DB, permitimos que siga por ahora para evitar bloqueos falsos
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
      }
      return session
    }
  }
}
