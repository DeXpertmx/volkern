/**
 * Emite un token de sesión JWT válido del Superadmin (admin@volkern.app)
 * usando NEXTAUTH_SECRET. NO modifica la BD: solo genera el token para
 * inyectar en el navegador y poder llamar a las APIs del superadmin
 * (cuya contraseña fue cambiada y no está documentada).
 *
 * Uso: npx tsx scripts/mint-superadmin-session.ts
 */
import 'dotenv/config';
import { prisma } from '../lib/db';
import { encode } from 'next-auth/jwt';

async function main() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error('❌ NEXTAUTH_SECRET no está definida en .env');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: 'admin@volkern.app' },
    include: {
      role: { select: { nombre: true } },
      tenant: { select: { accountType: true, subdomain: true } },
    },
  });

  if (!user) {
    console.error('❌ Superadmin no encontrado');
    process.exit(1);
  }

  // Mismos claims que el jwt() callback de lib/auth.ts añade al hacer signIn
  const token = {
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.image || undefined,
    tenantId: user.tenantId,
    roleId: user.roleId,
    roleName: user.role?.nombre,
    accountType: user.tenant?.accountType,
    tokenVersion: (user as any).tokenVersion,
    tenantSubdomain: user.tenant?.subdomain,
  };

  const sessionToken = await encode({
    token,
    secret,
    maxAge: 24 * 60 * 60, // 24h, igual que session.maxAge
  });

  console.log(JSON.stringify({ user: { id: user.id, email: user.email, role: user.role?.nombre }, token: sessionToken }));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
