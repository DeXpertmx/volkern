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
 * Cómo está el catálogo de roles de este tenant. `ausente` no es un error —el
 * tenant puede no haber dado el alta nunca—, es lo que el operador tiene que
 * resolver antes de pasarle el enlace al cliente.
 */
export interface RolEstado {
  nombre: string;
  descripcion: string;
  estado: 'al_dia' | 'incompleto' | 'ausente';
  /** Capacidades `modulo.accion` que le faltan del catálogo. */
  faltantes: string[];
}

export interface PropiedadPuestaEnMarcha {
  id: string;
  nombre: string;
  ciudad: string | null;
  pais: string | null;
  estado: string;
  /** Unidades creadas por el cliente. 0 = todavía no ha empezado el paso 2. */
  unidades: number;
  /** A dónde mandar al cliente para que siga por esta propiedad. */
  enlaceWizard: string;
}

export interface PuestaEnMarchaHospitality {
  tenant: { id: string; nombre: string };
  roles: {
    catalogo: number;
    alDia: number;
    detalle: RolEstado[];
    /** `true` si no queda ningún rol ausente ni incompleto. */
    completos: boolean;
  };
  propiedades: PropiedadPuestaEnMarcha[];
  /** Qué falta, en frases listas para una tabla. Vacío = nada pendiente. */
  faltantes: string[];
  /**
   * Enlace sin propiedad: el wizard del cliente le pide elegir entre las suyas.
   * Es el que se le pasa cuando aún no hay ninguna.
   */
  enlaceWizard: string;
  /**
   * Si el operador ya puede pasarle la puerta al cliente: catálogo de roles al
   * día y al menos una propiedad. Las unidades y el mapping NO entran aquí —
   * esos los pone el cliente en su wizard, que es justo el punto.
   */
  listo: boolean;
}

export type PuestaEnMarchaResult =
  | { ok: true; estado: PuestaEnMarchaHospitality }
  | AltaHospitalityError;

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

/**
 * Enlace del wizard del cliente para una propiedad concreta (o la raíz si aún
 * no hay ninguna). Lo comparten el alta y el estado para que no se separen.
 */
export function enlaceWizardHospitality(propertyId?: string | null): string {
  const base = '/dashboard/hospitality/onboarding';
  return propertyId ? `${base}?propertyId=${encodeURIComponent(propertyId)}` : base;
}

/** Nombres del catálogo, para reconocer a un cliente de Hospitality por sus roles. */
export const NOMBRES_ROLES_HOSPITALITY = ROLES_HOSPITALITY.map((r) => r.nombre);

/** Una propiedad tal y como sale de la consulta, sin derivar nada. */
export interface PropiedadCruda {
  id: string;
  nombre: string;
  ciudad: string | null;
  pais: string | null;
  estado: string;
  unidades: number;
}

/**
 * Qué le falta a la cuenta, en frases que se pueden leer en una tabla sin
 * abrir nada. Lo comparten el detalle de un tenant y el listado global: si cada
 * uno redactara lo suyo, acabarían diciendo cosas distintas del mismo cliente.
 */
function faltantesDe(
  roles: PuestaEnMarchaHospitality['roles'],
  propiedades: PropiedadPuestaEnMarcha[]
): string[] {
  const frases: string[] = [];

  const pendientes = roles.detalle.filter((r) => r.estado !== 'al_dia');
  if (pendientes.length) {
    frases.push(
      `${pendientes.length} de ${roles.catalogo} roles por preparar: ` +
        pendientes.map((r) => r.nombre).join(', ')
    );
  }

  if (!propiedades.length) {
    frases.push('Sin ninguna propiedad: falta el paso 1 del cliente');
  } else if (propiedades.every((p) => p.unidades === 0)) {
    frases.push('Propiedades sin unidades: el cliente aún no ha empezado');
  }

  return frases;
}

/**
 * La puesta en marcha vista desde los datos crudos. **Pura**: mismas reglas
 * para un tenant (tarjeta del detalle) y para cientos (listado del panel), y
 * probable sin base de datos.
 */
export function evaluarPuestaEnMarcha(
  rolesExistentes: { nombre: string; permisos: unknown }[],
  propiedades: PropiedadCruda[]
): Omit<PuestaEnMarchaHospitality, 'tenant'> {
  const porNombre = new Map<string, Permisos>(
    rolesExistentes.map((r) => [r.nombre, r.permisos as Permisos] as const)
  );

  const detalle: RolEstado[] = ROLES_HOSPITALITY.map((definicion) => {
    if (!porNombre.has(definicion.nombre)) {
      return {
        nombre: definicion.nombre,
        descripcion: definicion.descripcion,
        estado: 'ausente' as const,
        faltantes: [],
      };
    }
    const faltantes = capacidadesFaltantes(
      porNombre.get(definicion.nombre) as Permisos,
      permisosDeRol(definicion.id)
    );
    return {
      nombre: definicion.nombre,
      descripcion: definicion.descripcion,
      estado: faltantes.length ? ('incompleto' as const) : ('al_dia' as const),
      faltantes,
    };
  });

  const alDia = detalle.filter((r) => r.estado === 'al_dia').length;
  const roles: PuestaEnMarchaHospitality['roles'] = {
    catalogo: ROLES_HOSPITALITY.length,
    alDia,
    detalle,
    completos: alDia === ROLES_HOSPITALITY.length,
  };

  const propiedadesEstado: PropiedadPuestaEnMarcha[] = propiedades.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    ciudad: p.ciudad,
    pais: p.pais,
    estado: p.estado,
    unidades: p.unidades,
    enlaceWizard: enlaceWizardHospitality(p.id),
  }));

  return {
    roles,
    propiedades: propiedadesEstado,
    faltantes: faltantesDe(roles, propiedadesEstado),
    enlaceWizard: enlaceWizardHospitality(propiedadesEstado[0]?.id ?? null),
    listo: roles.completos && propiedadesEstado.length > 0,
  };
}

/**
 * Estado de la puesta en marcha de un tenant que YA existe.
 *
 * El alta guiada del wizard de partner cubre el tenant recién creado, pero un
 * tenant registrado hace meses (o un partner al que se le enciende Hospitality
 * después) entra por el panel de plataforma: allí hacía falta saber qué falta
 * antes de pasarle la puerta al cliente, y el enlace exacto por donde sigue.
 *
 * Solo lee: derivar este estado no escribe nada ni reclama el alta.
 */
export async function estadoPuestaEnMarchaHospitality(
  tenantId: string
): Promise<PuestaEnMarchaResult> {
  const id = texto(tenantId);
  if (!id) {
    return { ok: false, status: 400, error: 'Indica el cliente del que consultar la puesta en marcha.' };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, nombre: true },
  });
  if (!tenant) {
    return { ok: false, status: 404, error: 'El cliente no existe.' };
  }

  const [rolesExistentes, propiedades] = await Promise.all([
    prisma.role.findMany({
      where: { tenantId: id },
      select: { nombre: true, permisos: true },
    }),
    prisma.hospitalityProperty.findMany({
      where: { tenantId: id },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        id: true,
        nombre: true,
        ciudad: true,
        pais: true,
        estado: true,
        _count: { select: { units: true } },
      },
    }),
  ]);

  return {
    ok: true,
    estado: {
      tenant,
      ...evaluarPuestaEnMarcha(
        rolesExistentes,
        propiedades.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          ciudad: p.ciudad,
          pais: p.pais,
          estado: p.estado,
          unidades: p._count?.units ?? 0,
        }))
      ),
    },
  };
}

/** Tope de filas del listado: el panel no necesita más, y así no se lleva la base por delante. */
export const TOPE_LISTADO_PUESTA_EN_MARCHA = 200;

export interface PuestaEnMarchaFila {
  tenantId: string;
  tenant: string;
  plan: string;
  /** Alta del tenant (ISO), para saber desde cuándo espera. */
  desde: string;
  /**
   * Última señal de Hospitality en la cuenta (ISO): el alta, los roles del
   * catálogo o las propiedades, lo más reciente de todo. Es el ancla honesta de
   * «desde cuándo está parada»: si el módulo se encendió ayer en un cliente
   * viejo, la señal es de ayer, no de hace un año.
   */
  senal: string;
  /**
   * El operador apagó Hospitality a mano: el cliente no lo ve aunque tenga
   * datos. No es un descarte — es la avería que hay que arreglar primero.
   */
  moduloApagado: boolean;
  roles: { catalogo: number; alDia: number; pendientes: string[] };
  propiedades: { total: number; unidades: number; primera: { id: string; nombre: string } | null };
  enlaceWizard: string;
  faltantes: string[];
  listo: boolean;
}

export interface ListadoPuestaEnMarcha {
  generadoEn: string;
  totales: { tenants: number; pendientes: number; listos: number; apagados: number };
  /** `true` si hay más clientes de los que caben en el listado. */
  truncado: boolean;
  tenants: PuestaEnMarchaFila[];
}

/**
 * Los clientes de Hospitality con su puesta en marcha, de un solo barrido.
 *
 * Qué entra y qué no, que es la decisión que hace útil la lista:
 *
 *  - **Entra quien tiene Hospitality de verdad**: el override de la vertical
 *    (lo que siembra el wizard de partner), una propiedad o los roles del
 *    catálogo.
 *  - **NO entra por entitlement del plan.** Casi todos los planes incluyen la
 *    vertical, así que "su plan podría tener Hospitality" es todo el mundo y la
 *    tabla no diría nada. Esto es una lista de clientes, no de candidatos.
 *  - **Sí entra, y marcado, el que tiene datos con el módulo apagado**: eso es
 *    una avería (el cliente no ve lo suyo), no un onboarding pendiente.
 *
 * Solo lee. Las consultas son cuatro fijas —tenants, roles, propiedades y
 * overrides—, no una por cliente.
 */
export async function listarPuestasEnMarchaHospitality(opts?: {
  tope?: number;
}): Promise<{ ok: true; listado: ListadoPuestaEnMarcha } | AltaHospitalityError> {
  const tope = Number.isFinite(opts?.tope) ? Math.max(1, Math.floor(opts!.tope!)) : TOPE_LISTADO_PUESTA_EN_MARCHA;

  // Candidatos: evidencia de Hospitality, no entitlement. Se pide una fila de
  // más para poder decir si el listado quedó corto.
  const candidatos = await prisma.tenant.findMany({
    where: {
      OR: [
        { tenantFeatures: { some: { feature: 'hospitality', habilitado: true } } },
        { hospitalityProperties: { some: {} } },
        { roles: { some: { nombre: { in: NOMBRES_ROLES_HOSPITALITY } } } },
      ],
    },
    orderBy: { fechaCreacion: 'asc' },
    take: tope + 1,
    select: { id: true, nombre: true, plan: true, fechaCreacion: true },
  });

  const truncado = candidatos.length > tope;
  const elegidos = truncado ? candidatos.slice(0, tope) : candidatos;
  const ids = elegidos.map((t) => t.id);

  if (!ids.length) {
    return {
      ok: true,
      listado: {
        generadoEn: new Date().toISOString(),
        totales: { tenants: 0, pendientes: 0, listos: 0, apagados: 0 },
        truncado: false,
        tenants: [],
      },
    };
  }

  const [roles, propiedades, features] = await Promise.all([
    prisma.role.findMany({
      where: { tenantId: { in: ids } },
      select: { tenantId: true, nombre: true, permisos: true, fechaCreacion: true },
    }),
    prisma.hospitalityProperty.findMany({
      where: { tenantId: { in: ids } },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        tenantId: true,
        id: true,
        nombre: true,
        ciudad: true,
        pais: true,
        estado: true,
        fechaCreacion: true,
        _count: { select: { units: true } },
      },
    }),
    prisma.tenantFeature.findMany({
      where: { tenantId: { in: ids }, feature: 'hospitality' },
      select: { tenantId: true, habilitado: true },
    }),
  ]);

  const apagados = new Set(
    features.filter((f) => f.habilitado === false).map((f) => f.tenantId)
  );

  const filas: PuestaEnMarchaFila[] = elegidos.map((tenant) => {
    const susRoles = roles.filter((r) => r.tenantId === tenant.id);
    const susPropiedades = propiedades.filter((p) => p.tenantId === tenant.id);

    const suyos = evaluarPuestaEnMarcha(
      susRoles,
      susPropiedades.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        ciudad: p.ciudad,
        pais: p.pais,
        estado: p.estado,
        unidades: p._count?.units ?? 0,
      }))
    );

    // La señal solo cuenta actividad que sea de Hospitality: los roles del
    // catálogo y las propiedades, no cualquier rol genérico del tenant.
    const momentos = [
      tenant.fechaCreacion.getTime(),
      ...susPropiedades.map((p) => p.fechaCreacion.getTime()),
      ...susRoles
        .filter((r) => NOMBRES_ROLES_HOSPITALITY.includes(r.nombre))
        .map((r) => r.fechaCreacion.getTime()),
    ];
    const senal = new Date(Math.max(...momentos));

    const moduloApagado = apagados.has(tenant.id);
    const unidades = suyos.propiedades.reduce((n, p) => n + p.unidades, 0);

    return {
      tenantId: tenant.id,
      tenant: tenant.nombre,
      plan: tenant.plan,
      desde: tenant.fechaCreacion.toISOString(),
      senal: senal.toISOString(),
      moduloApagado,
      roles: {
        catalogo: suyos.roles.catalogo,
        alDia: suyos.roles.alDia,
        pendientes: suyos.roles.detalle
          .filter((r) => r.estado !== 'al_dia')
          .map((r) => r.nombre),
      },
      propiedades: {
        total: suyos.propiedades.length,
        unidades,
        primera: suyos.propiedades[0]
          ? { id: suyos.propiedades[0].id, nombre: suyos.propiedades[0].nombre }
          : null,
      },
      enlaceWizard: suyos.enlaceWizard,
      faltantes: suyos.faltantes,
      // Con el módulo apagado no está listo aunque tenga todo: el cliente no lo ve.
      listo: suyos.listo && !moduloApagado,
    };
  });

  // Lo pendiente primero, y dentro de lo pendiente lo que ya está en marcha: así
  // lo que se ve al abrir la pantalla es a quién hay que empujar.
  filas.sort((a, b) => {
    if (a.listo !== b.listo) return a.listo ? 1 : -1;
    const enMarcha = (f: PuestaEnMarchaFila) => (f.propiedades.total > 0 ? 0 : 1);
    if (enMarcha(a) !== enMarcha(b)) return enMarcha(a) - enMarcha(b);
    return a.desde.localeCompare(b.desde);
  });

  return {
    ok: true,
    listado: {
      generadoEn: new Date().toISOString(),
      totales: {
        tenants: filas.length,
        pendientes: filas.filter((f) => !f.listo).length,
        listos: filas.filter((f) => f.listo).length,
        apagados: filas.filter((f) => f.moduloApagado).length,
      },
      truncado,
      tenants: filas,
    },
  };
}
