/**
 * Catálogo básico de roles por tenant.
 *
 * Las cuentas nacían con un único rol «Admin» (y las primeras, con la clave
 * legada `usuarios.*`): cada miembro extra era administrador o no podía
 * trabajar — y el selector de invitación no tenía nada entre medias. Este
 * catálogo ofrece perfiles estándar listos para invitar, pensados para que
 * una cuenta nueva pueda separar "quien administra" de "quien trabaja" y de
 * "quien solo mira" sin tocar la matriz de permisos.
 *
 *   - **Admin** — el dueño de la cuenta (equivalente al Owner): equipo,
 *     roles, configuración y todos los módulos de trabajo.
 *   - **Miembro** — trabaja con los módulos del día a día; ve el equipo pero
 *     no lo gestiona.
 *   - **Solo lectura** — consulta sin alterar nada: ver en cada módulo y
 *     nada más.
 *
 * No sustituye al catálogo de Hospitality (Anfitrión, Agente, Mantenimiento,
 * Limpieza, Huésped): ese vive en su módulo con su propia llave
 * (`equipo.roles`) porque reparte el alojamiento. Este es el mínimo común de
 * cualquier cuenta, sea cual sea su vertical.
 *
 * La aplicación es **idempotente y conservadora**:
 *   - crea los roles que falten (por nombre dentro del tenant);
 *   - sobre los existentes solo **añade** llaves faltantes (nunca retira ni
 *     cambia valores, respeto absoluto a lo que el admin ya ajustó a mano);
 *   - re-aplicarlo no cambia nada.
 */

import type { PermissionModule } from './permissions-core';

export interface DefinicionRolBasico {
  nombre: string;
  descripcion: string;
  permisos: Partial<Record<PermissionModule | 'usuarios' | 'contactos' | 'reportes', Record<string, boolean>>>;
}

type Matriz = Record<string, Record<string, boolean>>;

const TODO: Record<string, boolean> = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
};

const SOLO_VER: Record<string, boolean> = { ver: true };

/** Módulos del día a día comercial (vertical por defecto de la plataforma). */
const MODULOS_TRABAJO: Array<PermissionModule | 'contactos' | 'reportes'> = [
  'leads',
  'catalogo',
  'citas',
  'campanas',
  'automatizaciones',
  'mensajes',
  'contactos',
  'reportes',
];

export const ROLES_BASICOS_POR_NOMBRE: Record<string, DefinicionRolBasico> = {
  Admin: {
    nombre: 'Admin',
    descripcion: 'Administrador de la cuenta: equipo, roles y configuración.',
    permisos: {
      // La clave legada se mantiene para compatibilidad con puertas viejas;
      // el rollout la hereda a `equipo` automáticamente.
      usuarios: { ...TODO },
      equipo: {
        ver: true,
        invitar: true,
        crear: true,
        editar: true,
        eliminar: true,
        // La llave de Hospitality: administrar la cuenta incluye poder aplicar
        // su catálogo de roles y gestionar accesos de huéspedes.
        roles: true,
      },
      configuracion: { ...TODO },
      analytics: { ver: true },
      ...MODULOS_TRABAJO.reduce((acc, m) => ({ ...acc, [m]: { ...TODO } }), {}),
    },
  },
  Miembro: {
    nombre: 'Miembro',
    descripcion: 'Trabaja con los módulos de la cuenta; ve el equipo sin gestionarlo.',
    permisos: {
      equipo: { ver: true },
      ...MODULOS_TRABAJO.reduce((acc, m) => ({ ...acc, [m]: { ...TODO } }), {}),
    },
  },
  'Solo lectura': {
    nombre: 'Solo lectura',
    descripcion: 'Consulta la información de la cuenta sin poder modificar nada.',
    permisos: {
      ...MODULOS_TRABAJO.reduce((acc, m) => ({ ...acc, [m]: { ...SOLO_VER } }), {}),
      analytics: { ver: true },
    },
  },
};

/** ¿Es este nombre parte del catálogo básico? */
export function esNombreDeRolBasico(nombre: string | null | undefined): boolean {
  return !!nombre && Object.prototype.hasOwnProperty.call(ROLES_BASICOS_POR_NOMBRE, nombre);
}

/**
 * Compara la definición del catálogo con los permisos de un rol existente y
 * devuelve las llaves que faltan, con la forma `{ modulo: { accion: true } }`
 * lista para fusionarse. Vacío = el rol ya cumple el catálogo.
 */
export function llavesFaltantesDelCatalogo(
  nombre: string,
  permisos: unknown
): Matriz {
  const def = ROLES_BASICOS_POR_NOMBRE[nombre];
  if (!def) return {};

  const actuales: Matriz =
    permisos && typeof permisos === 'object' ? (permisos as Matriz) : {};
  const faltantes: Matriz = {};

  for (const [modulo, acciones] of Object.entries(def.permisos)) {
    const delModulo: unknown = actuales[modulo];
    const esObjeto = !!delModulo && typeof delModulo === 'object';
    const esModuloEntero = delModulo === true;

    for (const [accion, requerida] of Object.entries(acciones)) {
      if (!requerida) continue;
      // Una clave presente —aunque sea `false`— es una decisión deliberada del
      // admin: el catálogo no la toca. Solo rellena lo que no existe.
      const yaEstaDecidida =
        (actuales as { all?: unknown }).all === true ||
        esModuloEntero ||
        (esObjeto && accion in (delModulo as Record<string, unknown>));
      if (!yaEstaDecidida) {
        faltantes[modulo] = { ...(faltantes[modulo] || {}), [accion]: true };
      }
    }
  }

  return faltantes;
}

/** Los permisos con las llaves del catálogo añadidas. No muta ni retira. */
export function conCatalogoAplicado(nombre: string, permisos: unknown): Matriz {
  const faltantes = llavesFaltantesDelCatalogo(nombre, permisos);
  const base: Matriz =
    permisos && typeof permisos === 'object' ? { ...(permisos as Matriz) } : {};

  for (const [modulo, acciones] of Object.entries(faltantes)) {
    base[modulo] = {
      ...(base[modulo] && typeof base[modulo] === 'object' ? base[modulo] : {}),
      ...acciones,
    };
  }
  return base;
}

export interface ResultadoAplicarCatalogo {
  creados: string[];
  actualizados: string[];
  yaCumplian: string[];
}

/**
 * Aplica el catálogo a un tenant: crea lo que falte y completa lo existente.
 * Pensado para llamarse en el signup de cada cuenta nueva y desde un script
 * de puesta al día para las existentes.
 */
export async function aplicarCatalogoRolesBasicos(
  tx: {
    role: {
      findMany: (args: { where: { tenantId: string } }) => Promise<
        Array<{ id: string; nombre: string; permisos: unknown }>
      >;
      create: (args: {
        data: {
          nombre: string;
          descripcion: string;
          permisos: Matriz;
          tenantId: string;
        };
      }) => Promise<unknown>;
      update: (args: {
        where: { id: string };
        data: { permisos: Matriz };
      }) => Promise<unknown>;
    };
  },
  tenantId: string
): Promise<ResultadoAplicarCatalogo> {
  const existentes = await tx.role.findMany({ where: { tenantId } });
  const porNombre = new Map(existentes.map((r) => [r.nombre, r]));

  const resultado: ResultadoAplicarCatalogo = {
    creados: [],
    actualizados: [],
    yaCumplian: [],
  };

  for (const def of Object.values(ROLES_BASICOS_POR_NOMBRE)) {
    const existente = porNombre.get(def.nombre);

    if (!existente) {
      await tx.role.create({
        data: {
          nombre: def.nombre,
          descripcion: def.descripcion,
          permisos: def.permisos as Matriz,
          tenantId,
        },
      });
      resultado.creados.push(def.nombre);
      continue;
    }

    const faltantes = llavesFaltantesDelCatalogo(def.nombre, existente.permisos);
    if (Object.keys(faltantes).length === 0) {
      resultado.yaCumplian.push(def.nombre);
      continue;
    }

    await tx.role.update({
      where: { id: existente.id },
      data: { permisos: conCatalogoAplicado(def.nombre, existente.permisos) },
    });
    resultado.actualizados.push(def.nombre);
  }

  return resultado;
}
