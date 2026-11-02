export const dynamic = 'force-dynamic';

/**
 * Personalización del alta: el equipo y sus permisos.
 *
 * GET    → qué roles encajan con el perfil, qué eligió el cliente y qué existe
 *          ya en la cuenta.
 * POST   → crea (o completa) los roles elegidos, con auditoría.
 * DELETE → deshace: borra los roles que creó el alta y que nadie usa.
 *
 * Dos cosas no se hacen aquí: no se crean personas (un rol vacío no entra a
 * ningún sitio) y no se retiran permisos a un rol que ya existía. Aplicar
 * completa; recortar se hace desde Equipo, donde se ve a quién afecta.
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { getPlanConfig } from '@/lib/plans'
import { normalizarDescubrimiento } from '@/lib/implantacion/descubrimiento'
import {
  normalizarSeleccion,
  proponerRoles,
  resumenRoles,
  ROLES_EQUIPO,
  type RolEquipoId,
  type SeleccionRol,
} from '@/lib/implantacion/roles'
import { aplicarRoles, deshacerRoles } from '@/lib/implantacion/aplicar-roles'

interface RolGuardado {
  id: RolEquipoId
  roleId: string
}

interface RolesGuardados {
  seleccion?: unknown
  creados?: RolGuardado[]
  aplicadoEn?: string
  aplicadoPor?: string
  deshechoEn?: string
}

function leerPlan(plan: unknown): Record<string, unknown> {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return {}
  return plan as Record<string, unknown>
}

function rolesDelPlan(plan: unknown): RolesGuardados {
  const roles = leerPlan(plan).roles
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) return {}
  return roles as RolesGuardados
}

/** Solo las entradas con forma completa: un `creados` corrupto no rompe el GET. */
function creadosDelPlan(plan: unknown): RolGuardado[] {
  const bruto = rolesDelPlan(plan).creados
  if (!Array.isArray(bruto)) return []
  return bruto.filter(
    (entrada): entrada is RolGuardado =>
      !!entrada &&
      typeof entrada === 'object' &&
      typeof (entrada as RolGuardado).roleId === 'string' &&
      typeof (entrada as RolGuardado).id === 'string',
  )
}

/** Tope de personas del plan, para poder avisar antes de que no quepan. */
async function limiteDeUsuarios(tenantId: string): Promise<number | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })
  const planConfig = await getPlanConfig(tenant?.plan ?? 'esencial')
  const limites = (planConfig?.limites ?? {}) as { users?: number }
  return typeof limites.users === 'number' ? limites.users : null
}

/** Lo que hay de verdad en la cuenta para los roles del catálogo. */
async function rolesEnCuenta(tenantId: string) {
  const nombres = ROLES_EQUIPO.map((rol) => rol.nombre)
  const existentes = await prisma.role.findMany({
    where: { tenantId, nombre: { in: nombres } },
    select: {
      id: true,
      nombre: true,
      permisos: true,
      _count: { select: { users: true } },
    },
  })

  return existentes.map((rol) => ({
    id: ROLES_EQUIPO.find((r) => r.nombre === rol.nombre)?.id ?? null,
    roleId: rol.id,
    nombre: rol.nombre,
    usuarios: rol._count.users,
    permisos: rol.permisos,
  }))
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant!.id

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { descubrimiento: true, plan: true },
    })

    const { descubrimiento } = normalizarDescubrimiento(registro?.descubrimiento)
    const limiteUsuarios = await limiteDeUsuarios(tenantId)
    const propuesta = proponerRoles(descubrimiento, { limiteUsuarios })

    // Sin elección guardada se parte de lo propuesto: el cliente quita lo que
    // no encaje, que es más rápido que marcar cinco casillas desde cero.
    const guardada = normalizarSeleccion(rolesDelPlan(registro?.plan).seleccion)
    const porDefecto: SeleccionRol[] = propuesta.roles
      .filter((rol) => rol.propuesto)
      .map((rol) => ({ id: rol.id, veTodo: rol.veTodo }))
    const seleccion = guardada.seleccion.length > 0 ? guardada.seleccion : porDefecto

    const enCuenta = await rolesEnCuenta(tenantId)

    return NextResponse.json({
      propuesta,
      seleccion,
      resumen: resumenRoles(seleccion),
      enCuenta,
      aplicadoEn: rolesDelPlan(registro?.plan).aplicadoEn ?? null,
      // Deshacer solo se ofrece si el alta creó algo: un botón que devuelve 409
      // al pulsarlo es peor que no tenerlo.
      deshacerDisponible: creadosDelPlan(registro?.plan).length > 0,
      equipo: { estimado: propuesta.equipoEstimado, limiteUsuarios },
      avisos: guardada.avisos,
    })
  } catch (error) {
    console.error('[Implantacion roles GET] Error:', error)
    return NextResponse.json({ error: 'Error al leer los roles del alta' }, { status: 500 })
  }
}, ['settings:read'])

// ─── POST: crear los roles elegidos ──────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const usuarioId = auth.user?.id
    if (!usuarioId) {
      return NextResponse.json(
        { error: 'Necesitas una sesión de usuario para aplicar el alta' },
        { status: 403 },
      )
    }

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { descubrimiento: true, plan: true, estado: true },
    })
    if (!registro) {
      return NextResponse.json(
        { error: 'Primero hay que completar el descubrimiento del alta guiada' },
        { status: 409 },
      )
    }

    const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { seleccion, avisos } = normalizarSeleccion(cuerpo.seleccion ?? cuerpo)

    if (seleccion.length === 0) {
      return NextResponse.json(
        { error: avisos[avisos.length - 1] ?? 'Elige al menos un rol', avisos },
        { status: 400 },
      )
    }

    const resultado = await aplicarRoles(tenantId, seleccion)
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.mensaje }, { status: 400 })
    }

    // Los roles que creó el alta se acumulan: si luego se vuelve a aplicar con
    // otro rol más, deshacer tiene que poder quitar los dos.
    const previos = creadosDelPlan(registro.plan)
    const creadosAhora = resultado.resultados
      .filter((r) => r.estado === 'creado')
      .map((r) => ({ id: r.id, roleId: r.roleId }))

    // Si un rol se creó, se borró a mano y se vuelve a crear, la entrada vieja
    // apunta a un id muerto: se sustituye por la nueva para que deshacer borre
    // el rol que existe de verdad.
    const recienCreados = new Set(creadosAhora.map((c) => c.id))
    const creados = [...previos.filter((c) => !recienCreados.has(c.id))]
    for (const nuevo of creadosAhora) {
      if (!creados.some((c) => c.roleId === nuevo.roleId)) creados.push(nuevo)
    }

    const ahora = new Date()
    const planPrevio = leerPlan(registro.plan)

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...planPrevio,
          roles: {
            seleccion,
            creados,
            aplicadoEn: ahora.toISOString(),
            aplicadoPor: usuarioId,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_roles',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: `Roles del alta aplicados: ${resultado.resultados.map((r) => `«${r.nombre}» (${r.estado})`).join(', ')}`,
        metadata: {
          pieza: 'roles',
          seleccion: seleccion as unknown as Prisma.InputJsonValue,
          resultados: resultado.resultados as unknown as Prisma.InputJsonValue,
          estadoPrevio: registro.estado,
        },
      },
    })

    const enCuenta = await rolesEnCuenta(tenantId)

    return NextResponse.json({
      ok: true,
      resultados: resultado.resultados,
      avisos,
      seleccion,
      resumen: resumenRoles(seleccion),
      enCuenta,
      aplicadoEn: ahora.toISOString(),
    })
  } catch (error) {
    console.error('[Implantacion roles POST] Error:', error)
    return NextResponse.json({ error: 'No se pudieron crear los roles' }, { status: 500 })
  }
}, ['settings:write'])

// ─── DELETE: deshacer los roles que creó el alta ─────────────────────────────

export const DELETE = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const usuarioId = auth.user?.id
    if (!usuarioId) {
      return NextResponse.json(
        { error: 'Necesitas una sesión de usuario para deshacer el alta' },
        { status: 403 },
      )
    }

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { plan: true },
    })
    const creados = creadosDelPlan(registro?.plan)

    if (creados.length === 0) {
      return NextResponse.json(
        { error: 'No hay ningún rol del alta que deshacer' },
        { status: 409 },
      )
    }

    const resultado = await deshacerRoles(tenantId, creados)

    // Lo que se quedó porque alguien lo usa sigue marcado como creado por el
    // alta: si esa persona se va, deshacer volverá a funcionar.
    const siguen = creados.filter((c) =>
      resultado.conservados.some((k) => k.roleId === c.roleId),
    )

    const planPrevio = leerPlan(registro?.plan)
    const rolesPrevios = rolesDelPlan(registro?.plan)

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...planPrevio,
          roles: {
            seleccion: rolesPrevios.seleccion ?? [],
            creados: siguen,
            aplicadoEn: rolesPrevios.aplicadoEn ?? null,
            deshechoEn: new Date().toISOString(),
          },
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_roles_deshacer',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: resultado.borrados.length
          ? `Roles del alta deshechos: ${resultado.borrados.length} borrado${resultado.borrados.length === 1 ? '' : 's'}${resultado.conservados.length ? `, ${resultado.conservados.length} conservado${resultado.conservados.length === 1 ? '' : 's'} por tener personas` : ''}`
          : 'Roles del alta no deshechos: todos tienen personas asignadas',
        metadata: {
          pieza: 'roles',
          borrados: resultado.borrados,
          conservados: resultado.conservados as unknown as Prisma.InputJsonValue,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      borrados: resultado.borrados,
      conservados: resultado.conservados,
      ausentes: resultado.ausentes,
      enCuenta: await rolesEnCuenta(tenantId),
    })
  } catch (error) {
    console.error('[Implantacion roles DELETE] Error:', error)
    return NextResponse.json({ error: 'No se pudieron deshacer los roles' }, { status: 500 })
  }
}, ['settings:write'])
