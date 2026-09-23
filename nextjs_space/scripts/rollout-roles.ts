/**
 * Pone al día los permisos de todos los roles al retirar las puertas que
 * decidían por el nombre del rol.
 *
 * Qué cambia con este paso, y por qué hace falta:
 *
 *  1. **Plataforma.** Cambiar el modo de compliance, escribir la marca de la
 *     cuenta y ver el cockpit financiero consolidado se concedían a quien se
 *     llamara «Admin» o «Administrador». Ahora lo concede
 *     `configuracion.gestionar`; sin copiar el privilegio, el administrador de
 *     una cuenta se queda de un día para otro con un 403 en su propio cockpit.
 *     Y el pipeline de leads se veía entero salvo para «Sales Agent» y
 *     «Support»; ahora lo concede `leads.ver_todos`, así que a todo rol que
 *     entraba al pipeline y no se llamaba así se le copia la llave, o pasaría
 *     a ver solo sus leads asignados. Reglas en `lib/roles-rollout.ts`.
 *  2. **Hospitality.** Las credenciales del registro de viajeros (el
 *     certificado de la entidad) y los documentos sin enmascarar dejaban de
 *     concederse por el nombre «Admin» para pasar a ser capacidades. Además el
 *     check-in se separó de la limpieza, y los roles de Hospitality del resto
 *     del equipo: quien podía lo uno conserva lo otro. Reglas en
 *     `lib/hospitality/roles-rollout.ts`.
 *
 * Es **solo aditivo** y **idempotente**: no retira nada y repetirlo no cambia
 * nada. No crea roles: el catálogo de Hospitality (Anfitrión, Agente,
 * Mantenimiento, Limpieza, Huésped) lo aplica el Anfitrión de cada cuenta desde
 * Hospitality → Equipo y roles, porque crear roles que nadie ha pedido en todas
 * las cuentas sería imponer un modelo, no ofrecerlo.
 *
 * Uso:
 *   npx tsx scripts/rollout-roles.ts            # simulación
 *   npx tsx scripts/rollout-roles.ts --apply    # aplica
 */
import { prisma } from '../lib/db';
import {
  capacidadesQueHereda,
  conPrivilegiosHeredados,
  type Permisos,
} from '../lib/hospitality/roles-rollout';
import {
  permisosQueHereda,
  conPermisosHeredados,
} from '../lib/roles-rollout';

const APLICAR = process.argv.includes('--apply');

interface Pendiente {
  id: string;
  nombre: string;
  tenant: string;
  usuarios: number;
  hospitality: string[];
  plataforma: string[];
}

function planificar(
  roles: {
    id: string;
    nombre: string;
    permisos: unknown;
    tenant: { nombre: string } | null;
    _count: { users: number };
  }[]
): Pendiente[] {
  const pendientes: Pendiente[] = [];

  for (const rol of roles) {
    const permisos = rol.permisos as Permisos;
    const hospitality = capacidadesQueHereda(permisos, rol.nombre);
    const plataforma = permisosQueHereda(permisos, rol.nombre).map(
      (permiso) => `${permiso.modulo}.${permiso.accion}`
    );
    if (!hospitality.length && !plataforma.length) continue;

    pendientes.push({
      id: rol.id,
      nombre: rol.nombre,
      tenant: rol.tenant?.nombre ?? '(sin tenant)',
      usuarios: rol._count.users,
      hospitality,
      plataforma,
    });
  }

  return pendientes;
}

function permisosPuestosAlDia(permisos: unknown, nombre: string): Permisos {
  const conPlataforma = conPermisosHeredados(permisos as Permisos, nombre);
  return conPrivilegiosHeredados(conPlataforma, nombre);
}

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

  const pendientes = planificar(roles);

  console.log(`Roles en total: ${roles.length}`);
  console.log(`Con algo que heredar: ${pendientes.length}`);
  console.log('');

  for (const pendiente of pendientes) {
    console.log(
      `  · ${pendiente.tenant} → ${pendiente.nombre} (${pendiente.usuarios} usuario${
        pendiente.usuarios === 1 ? '' : 's'
      })`
    );
    if (pendiente.plataforma.length) {
      console.log(`      plataforma: ${pendiente.plataforma.join(', ')}`);
    }
    if (pendiente.hospitality.length) {
      console.log(`      hospitality: ${pendiente.hospitality.join(', ')}`);
    }
  }

  if (!pendientes.length) {
    console.log('\nNada que hacer.');
    return;
  }

  if (!APLICAR) {
    console.log('\nSimulación: nada modificado. Repite con --apply para aplicarlo.');
    return;
  }

  for (const pendiente of pendientes) {
    const actual = roles.find((rol) => rol.id === pendiente.id)!;
    await prisma.role.update({
      where: { id: pendiente.id },
      data: { permisos: permisosPuestosAlDia(actual.permisos, actual.nombre) as object },
    });
  }
  console.log(`\nActualizados: ${pendientes.length}`);

  // Verificación posterior: nadie queda con privilegios por nombre sin permiso
  // explícito, que es justo lo que este paso viene a evitar.
  const despues = await prisma.role.findMany({ select: { nombre: true, permisos: true } });
  const sinCopiar = planificar(
    despues.map((rol) => ({
      id: rol.nombre,
      nombre: rol.nombre,
      permisos: rol.permisos,
      tenant: null,
      _count: { users: 0 },
    }))
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
