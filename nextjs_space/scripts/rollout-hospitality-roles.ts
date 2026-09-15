/**
 * Pone al día los permisos de Hospitality al introducir los roles del producto.
 *
 * Qué cambia con este paso, y por qué hace falta:
 *
 *  1. Las credenciales del registro de viajeros (el certificado de la entidad) y
 *     los documentos sin enmascarar dejaban de concederse por el nombre del rol
 *     —«Admin»— para pasar a ser capacidades. Sin copiar el privilegio, el
 *     administrador de una cuenta se queda de un día para otro sin poder instalar
 *     su propio certificado.
 *  2. El check-in se separó de la limpieza, y los roles de Hospitality del resto
 *     del equipo. Quien podía lo uno conserva lo otro.
 *
 * Es **solo aditivo** y **idempotente**: no retira nada y repetirlo no cambia
 * nada. Las reglas de qué hereda quién viven en
 * `lib/hospitality/roles-rollout.ts`, con sus pruebas.
 *
 * El catálogo de roles (Anfitrión, Agente, Mantenimiento, Limpieza, Huésped) NO
 * se crea aquí: lo aplica el Anfitrión de cada cuenta desde Hospitality → Equipo
 * y roles. Crear roles que nadie ha pedido en todas las cuentas sería imponer un
 * modelo, no ofrecerlo.
 *
 * Uso:
 *   npx tsx scripts/rollout-hospitality-roles.ts            # simulación
 *   npx tsx scripts/rollout-hospitality-roles.ts --apply    # aplica
 */
import { prisma } from '../lib/db';
import {
  capacidadesQueHereda,
  conPrivilegiosHeredados,
  type Permisos,
} from '../lib/hospitality/roles-rollout';

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

  const pendientes = roles
    .map((rol) => ({
      rol,
      hereda: capacidadesQueHereda(rol.permisos as Permisos, rol.nombre),
    }))
    .filter((entrada) => entrada.hereda.length > 0);

  console.log(`Roles en total: ${roles.length}`);
  console.log(`Con algo que heredar: ${pendientes.length}`);
  console.log('');

  for (const { rol, hereda } of pendientes) {
    const usuarios = rol._count.users;
    console.log(
      `  · ${rol.tenant?.nombre ?? '(sin tenant)'} → ${rol.nombre} (${usuarios} usuario${
        usuarios === 1 ? '' : 's'
      })`
    );
    console.log(`      hereda: ${hereda.join(', ')}`);
  }

  if (!pendientes.length) {
    console.log('\nNada que hacer.');
    return;
  }

  if (!APLICAR) {
    console.log('\nSimulación: nada modificado. Repite con --apply para aplicarlo.');
    return;
  }

  for (const { rol } of pendientes) {
    await prisma.role.update({
      where: { id: rol.id },
      data: { permisos: conPrivilegiosHeredados(rol.permisos as Permisos, rol.nombre) as object },
    });
  }
  console.log(`\nActualizados: ${pendientes.length}`);

  // Verificación posterior: nadie queda con privilegios por nombre sin permiso
  // explícito, que es justo lo que este paso viene a evitar.
  const despues = await prisma.role.findMany({ select: { nombre: true, permisos: true } });
  const sinCopiar = despues.filter(
    (rol) => capacidadesQueHereda(rol.permisos as Permisos, rol.nombre).length > 0
  ).length;
  console.log(`Roles a los que aún les falta copiar algo: ${sinCopiar}`);
}

main()
  .catch((error) => {
    console.error('Error en el paso de roles:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
