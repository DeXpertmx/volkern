/**
 * Alta de un cliente de Hospitality desde el panel de plataforma (§31 + partner
 * onboarding).
 *
 * El wizard de partner ya crea el tenant con su plan y siembra los módulos de la
 * vertical (`lib/provisioning/tenant-provisioner.ts`). Lo que faltaba es lo
 * específico de Hospitality: un tenant recién dado de alta llegaba al módulo con
 * el catálogo de módulos activo pero **sin los roles del vocabulario del
 * producto** (Anfitrión, Agente, Mantenimiento, Limpieza, Huésped) y **sin
 * ninguna propiedad**, así que el cliente entraba a una pantalla vacía sin
 * saber qué le falta.
 *
 * Este módulo hace esas dos cosas y nada más, para poder reutilizarlo desde el
 * wizard, desde una ruta o desde un script:
 *
 *   1. **Roles del catálogo.** Crea los que falten y a los existentes les
 *      **añade** lo que les falte, con la misma semántica que
 *      `POST /api/hospitality/roles`: aplicar el catálogo nunca retira permisos,
 *      así que repetirlo no puede dejar a nadie sin acceso.
 *   2. **Primera propiedad vacía.** Nombre y ubicación; las unidades, tarifas y
 *      el mapping los pone el cliente en el wizard guiado, donde el catálogo
 *      externo se valida contra el proveedor (nada se inventa, §0.1).
 *
 * Idempotente por diseño: volver a ejecutarlo sobre el mismo tenant no duplica
 * roles ni propiedades. Es lo que permite que sea un botón y no un ritual.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logAuditAction } from '@/lib/permissions';
import { ROLES_HOSPITALITY, permisosDeRol } from '@/lib/hospitality/roles';
import {
  capacidadesFaltantes,
  conLoQueFalta,
  type Permisos,
} from '@/lib/hospitality/roles-apply';

export interface PropiedadInicial {
  nombre: string;
  ciudad?: string | null;
  pais?: string | null;
  zona?: string | null;
  timezone?: string | null;
}

export interface AltaHospitalityInput {
  tenantId: string;
  propiedad: PropiedadInicial;
  /** Quién ejecuta el alta, para la traza. `null` en scripts sin sesión. */
  actorUserId: string | null;
}

export interface AltaHospitalityOk {
  ok: true;
  tenant: { id: string; nombre: string };
  roles: {
    /** Nombres creados en esta llamada. */
    creados: string[];
    /** Roles que ya existían y a los que se les añadió lo que faltaba. */
    completados: { nombre: string; faltantes: string[] }[];
    /** Los nombres del catálogo que el tenant tiene ahora (haya creado o no). */
    catalogo: string[];
  };
  propiedad: { id: string; nombre: string; estado: string; creada: boolean };
}

export interface AltaHospitalityError {
  ok: false;
  status: number;
  error: string;
}

export type AltaHospitalityResult = AltaHospitalityOk | AltaHospitalityError;

/**
 * Un identificador de zona horaria IANA, o `null` si no lo es.
 *
 * El proyecto guarda las fechas por propiedad con `timezone` y de ahí salen las
 * ventanas de día, los holds y las comunicaciones: un valor inventado no falla
 * al guardarse, falla días después al calcular una llegada. `Intl` es el único
 * validador que ya está aquí y conoce la base tzdata del runtime.
 */
export function zonaHorariaValida(valor: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Aplica el catálogo de roles de Hospitality al tenant: crea los que falten y
 * completa los que existan. Nunca retira permisos.
 */
export async function asegurarRolesHospitality(
  tenantId: string
): Promise<{ creados: string[]; completados: { nombre: string; faltantes: string[] }[] }> {
  const creados: string[] = [];
  const completados: { nombre: string; faltantes: string[] }[] = [];

  // `orden` es el del catálogo y arranca después de los roles que ya tenga la
  // cuenta, para que el nuevo salga al final y no por delante de Admin.
  let orden = await prisma.role.count({ where: { tenantId } });

  for (const definicion of ROLES_HOSPITALITY) {
    const esperado = permisosDeRol(definicion.id);
    const existente = await prisma.role.findFirst({
      where: { tenantId, nombre: definicion.nombre },
      select: { id: true, permisos: true },
    });

    if (!existente) {
      orden += 1;
      await prisma.role.create({
        data: {
          tenantId,
          nombre: definicion.nombre,
          descripcion: definicion.descripcion,
          permisos: esperado,
          orden,
        },
      });
      creados.push(definicion.nombre);
      continue;
    }

    const faltantes = capacidadesFaltantes(existente.permisos as Permisos, esperado);
    if (!faltantes.length) continue;

    await prisma.role.update({
      where: { id: existente.id },
      data: {
        permisos: conLoQueFalta(
          existente.permisos as Permisos,
          esperado
        ) as Prisma.InputJsonValue,
      },
    });
    completados.push({ nombre: definicion.nombre, faltantes });
  }

  return { creados, completados };
}

/**
 * Da de alta un cliente de Hospitality: roles del catálogo + primera propiedad
 * vacía. No crea el tenant (lo hace el wizard de partner, con su plan y sus
 * módulos) ni usuarios: el operador decide quién entra.
 */
export async function prepararTenantHospitality(
  input: AltaHospitalityInput
): Promise<AltaHospitalityResult> {
  const tenantId = texto(input?.tenantId);
  if (!tenantId) {
    return { ok: false, status: 400, error: 'Indica el cliente sobre el que preparar Hospitality.' };
  }

  const nombrePropiedad = texto(input?.propiedad?.nombre);
  if (!nombrePropiedad) {
    return {
      ok: false,
      status: 400,
      error: 'Indica el nombre de la primera propiedad: es el paso 1 del onboarding del cliente.',
    };
  }

  // La zona horaria decide las ventanas de día de TODA la operación de esa
  // propiedad, así que un valor inválido se rechaza aquí y no en la primera
  // llegada mal calculada.
  const timezone = texto(input?.propiedad?.timezone) || null;
  if (timezone && !zonaHorariaValida(timezone)) {
    return {
      ok: false,
      status: 400,
      error: `«${timezone}» no es una zona horaria válida (se espera un identificador IANA, como Europe/Madrid).`,
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true },
  });
  if (!tenant) {
    return { ok: false, status: 404, error: 'El cliente no existe.' };
  }

  const roles = await asegurarRolesHospitality(tenantId);

  // Idempotencia por nombre: repetir el alta no crea «Villa Mar Azul (2)».
  const existente = await prisma.hospitalityProperty.findFirst({
    where: { tenantId, nombre: { equals: nombrePropiedad, mode: 'insensitive' } },
    select: { id: true, nombre: true, estado: true },
  });

  let propiedad: AltaHospitalityOk['propiedad'];
  if (existente) {
    propiedad = { ...existente, creada: false };
  } else {
    const creada = await prisma.hospitalityProperty.create({
      data: {
        tenantId,
        nombre: nombrePropiedad,
        ciudad: texto(input?.propiedad?.ciudad) || null,
        pais: texto(input?.propiedad?.pais) || null,
        zona: texto(input?.propiedad?.zona) || null,
        // Sin zona indicada manda el default del esquema, no una inventada.
        ...(timezone ? { timezone } : {}),
        // `activa` = creada pero sin conectar: el wizard del cliente deriva sus
        // pasos de la realidad y verá pendiente todo lo que falta.
        estado: 'activa',
      },
      select: { id: true, nombre: true, estado: true },
    });
    propiedad = { ...creada, creada: true };
  }

  await logAuditAction(
    input.actorUserId ?? 'sistema',
    tenantId,
    'crear',
    'hospitality_alta_cliente',
    tenantId,
    `Alta de cliente Hospitality: ${roles.creados.length} rol(es) creado(s), ` +
      `${roles.completados.length} completado(s) y propiedad «${propiedad.nombre}» ` +
      `${propiedad.creada ? 'creada' : 'ya existente'}`,
    null,
    {
      rolesCreados: roles.creados,
      rolesCompletados: roles.completados.map((r) => r.nombre),
      propiedadId: propiedad.id,
      propiedadCreada: propiedad.creada,
    }
  ).catch(() => {});

  return {
    ok: true,
    tenant,
    roles: {
      ...roles,
      catalogo: ROLES_HOSPITALITY.map((r) => r.nombre),
    },
    propiedad,
  };
}
