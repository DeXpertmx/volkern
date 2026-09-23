/**
 * Asigna el rol de administrador de una cuenta a su usuario.
 *
 * Por qué existe: `POST /api/tenants/create` — el mecanismo propio de
 * provisión — crea el tenant y su usuario, pero **no** le asigna rol. Y en esta
 * plataforma las capacidades se conceden por rol, no por ser el primer usuario
 * de la cuenta (`lib/hospitality/capacidades.ts`: «si falta el permiso, se
 * deniega»). Sin rol, el administrador recién provisionado entra y no puede
 * nada: ni ver reservas, ni el planning, ni el registro de viajeros. Este es el
 * paso que en un alta acompañada da el operador.
 *
 * El rol se llama «Administrador» y lleva el wildcard `{ all: true }` — la
 * misma convención de `scripts/bootstrap-admin.ts`, así que hereda todas las
 * capacidades de Hospitality (incluidas las privilegiadas) sin enumerarlas.
 *
 * Uso:
 *   npx tsx scripts/asignar-rol-admin-tenant.ts --tenant <slug|subdomain|id> [--email <email>]
 *
 * Sin `--email` toma el primer usuario del tenant (el admin que creó el
 * provisioner). Es **idempotente**: repetirlo no cambia nada. No crea tenants
 * ni usuarios, no toca datos del negocio y no imprime contraseñas.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const clave = arg('tenant');
  const email = arg('email');

  if (!clave) {
    console.error('❌ Falta --tenant <slug|subdomain|id>');
    console.error('   Uso: npx tsx scripts/asignar-rol-admin-tenant.ts --tenant homologacion-mir');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: clave }, { slug: clave }, { subdomain: clave }] },
    select: { id: true, nombre: true, slug: true },
  });
  if (!tenant) {
    throw new Error(`No existe ningún tenant con slug/subdomain/id «${clave}»`);
  }

  const usuario = email
    ? await prisma.user.findFirst({
        where: { email, tenantId: tenant.id },
        select: { id: true, email: true, name: true },
      })
    : await prisma.user.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true },
      });

  if (!usuario) {
    throw new Error(
      email
        ? `El tenant «${tenant.slug}» no tiene ningún usuario con email ${email}`
        : `El tenant «${tenant.slug}» no tiene usuarios`
    );
  }

  const rol = await prisma.role.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Administrador' } },
    update: { permisos: { all: true } },
    create: {
      tenantId: tenant.id,
      nombre: 'Administrador',
      descripcion: 'Acceso total a la cuenta. Convención de scripts/bootstrap-admin.ts.',
      permisos: { all: true },
      esPersonalizado: false,
      orden: 0,
    },
    select: { id: true, nombre: true },
  });

  await prisma.user.update({
    where: { id: usuario.id },
    data: { roleId: rol.id },
  });

  console.log(`✅ Tenant: ${tenant.nombre} (${tenant.slug}) — ${tenant.id}`);
  console.log(`✅ Usuario: ${usuario.email} — rol «${rol.nombre}» (${rol.id})`);
  console.log('   Capacidades: wildcard { all: true } → todas, incluidas las privilegiadas.');
}

main()
  .catch((error) => {
    console.error('❌', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
