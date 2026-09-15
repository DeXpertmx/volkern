/**
 * Retrollenado de permisos de Hospitality.
 *
 * Hasta ahora ninguna ruta de Hospitality comprobaba el rol: el módulo del plan
 * decidía si la cuenta tenía Hospitality, y a partir de ahí cualquier usuario
 * del tenant podía cancelar una reserva, cerrar una limpieza o ver los
 * ingresos. Al empezar a comprobar los permisos por acción, un rol que nunca
 * tuvo claves de Hospitality se quedaría sin acceso de golpe — incluidos los
 * usuarios que están trabajando hoy.
 *
 * Este script les concede explícitamente el conjunto completo (lo que ya podían
 * hacer) para que el cambio no quite nada a nadie. A partir de ahí el
 * administrador decide qué recortar desde la matriz de roles, en
 * Equipo → Roles y permisos.
 *
 * Idempotente: salta los roles que ya tienen cualquier clave `hospitality_*`, los
 * que usan el wildcard `{ all: true }` y los Superadmin (esos ya pasan cualquier
 * comprobación por nombre).
 *
 * Uso:
 *   npx tsx scripts/backfill-hospitality-permissions.ts            # simulación
 *   npx tsx scripts/backfill-hospitality-permissions.ts --apply    # aplica
 */
import { prisma } from '../lib/db';
import {
  conPermisosHospitality,
  rolYaCubierto,
  type Permisos,
} from '../lib/hospitality/permissions-backfill';

const APLICAR = process.argv.includes('--apply');

async function main() {
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      nombre: true,
      permisos: true,
      tenant: { select: { nombre: true } },
      _count: { select: { users: true } },
    },
    orderBy: [{ tenantId: 'asc' }, { nombre: 'asc' }],
  });

  const pendientes = roles.filter((r) => !rolYaCubierto(r.permisos as Permisos, r.nombre));
  const cubiertos = roles.length - pendientes.length;

  console.log(`Roles en total: ${roles.length}`);
  console.log(`Ya cubiertos (wildcard, Superadmin o ya retrollenados): ${cubiertos}`);
  console.log(`Por retrollenar: ${pendientes.length}`);
  console.log('');

  for (const rol of pendientes) {
    const usuarios = rol._count.users;
    console.log(
      `  · ${rol.tenant?.nombre ?? '(sin tenant)'} → ${rol.nombre} (${usuarios} usuario${usuarios === 1 ? '' : 's'})`
    );
  }

  if (!pendientes.length) {
    console.log('\nNada que hacer.');
    return;
  }

  if (!APLICAR) {
    console.log('\nSimulación: nada modificado. Repite con --apply para aplicarlo.');
    return;
  }

  for (const rol of pendientes) {
    await prisma.role.update({
      where: { id: rol.id },
      data: { permisos: conPermisosHospitality(rol.permisos as Permisos) as object },
    });
  }
  console.log(`\nRetrollenados: ${pendientes.length}`);

  // Verificación posterior: nadie queda con Hospitality sin permiso explícito.
  const despues = await prisma.role.findMany({ select: { nombre: true, permisos: true } });
  const sinCubrir = despues.filter(
    (r) => !rolYaCubierto(r.permisos as Permisos, r.nombre)
  ).length;
  console.log(`Roles sin claves de Hospitality tras el retrollenado: ${sinCubrir}`);
}

main()
  .catch((error) => {
    console.error('Error en el retrollenado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
