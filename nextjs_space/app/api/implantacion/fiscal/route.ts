export const dynamic = 'force-dynamic';

/**
 * Personalización del alta: impuestos, moneda y datos fiscales.
 *
 * GET    → país detectado, propuesta de tasas y de moneda, qué falta del emisor
 *          y qué hay ya en la cuenta.
 * POST   → crea (o corrige) las tasas elegidas y cambia la moneda si el cliente
 *          lo confirma, con auditoría.
 * DELETE → deshace: borra las tasas que creó el alta y que nadie usa.
 *
 * El emisor **no se crea aquí**: la razón social y el NIF son datos suyos y
 * falsearlos sería peor que dejarlos vacíos. Se dice qué falta y se enlaza a
 * Configuración fiscal.
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { getSupportedCountries } from '@/lib/fiscal-validation'
// La divisa no se escribe a mano aquí: `monedaEscritura` aplica la red de
// seguridad del módulo del dinero y es el único sitio que puede nombrarla.
import { monedaEscritura } from '@/lib/moneda'
import { normalizarDescubrimiento } from '@/lib/implantacion/descubrimiento'
import {
  monedasOfrecidas,
  normalizarSeleccionFiscal,
  proponerFiscal,
  resumenFiscal,
  type ContextoFiscal,
} from '@/lib/implantacion/fiscal'
import { aplicarFiscal, deshacerFiscal } from '@/lib/implantacion/aplicar-fiscal'

interface FiscalGuardado {
  pais?: string | null
  moneda?: string
  tasas?: string[]
  creados?: string[]
  aplicadoEn?: string
  deshechoEn?: string
}

function leerPlan(plan: unknown): Record<string, unknown> {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return {}
  return plan as Record<string, unknown>
}

function fiscalDelPlan(plan: unknown): FiscalGuardado {
  const fiscal = leerPlan(plan).fiscal
  if (!fiscal || typeof fiscal !== 'object' || Array.isArray(fiscal)) return {}
  return fiscal as FiscalGuardado
}

function creadosDelPlan(plan: unknown): string[] {
  const bruto = fiscalDelPlan(plan).creados
  if (!Array.isArray(bruto)) return []
  return bruto.filter((codigo): codigo is string => typeof codigo === 'string')
}

/**
 * El país del que se factura: primero lo que dice el emisor (es el dato que
 * firma la factura), después el de las tasas que ya existan. Nunca se adivina
 * por la moneda: `Tenant.moneda` nace en MXN por defecto y por eso mismo no vale
 * como pista de país.
 */
async function contextoFiscal(tenantId: string): Promise<ContextoFiscal> {
  const [emisor, tasa, tenant] = await Promise.all([
    prisma.configuracionFiscalEmisor.findFirst({
      where: { tenantId, esPrincipal: true },
      select: {
        pais: true,
        razonSocial: true,
        idFiscal: true,
        direccion: true,
        ciudad: true,
        codigoPostal: true,
        email: true,
      },
    }),
    prisma.tasaImpuesto.findFirst({
      where: { tenantId, activo: true },
      orderBy: { fechaCreacion: 'asc' },
      select: { pais: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { moneda: true } }),
  ])

  return {
    pais: emisor?.pais ?? tasa?.pais ?? null,
    monedaActual: monedaEscritura(tenant?.moneda),
    emisor: emisor
      ? {
          razonSocial: emisor.razonSocial,
          idFiscal: emisor.idFiscal,
          direccion: emisor.direccion,
          ciudad: emisor.ciudad,
          codigoPostal: emisor.codigoPostal,
          email: emisor.email,
        }
      : null,
  }
}

async function tasasEnCuenta(tenantId: string) {
  const tasas = await prisma.tasaImpuesto.findMany({
    where: { tenantId, activo: true },
    orderBy: [{ pais: 'asc' }, { porcentaje: 'desc' }],
    select: { id: true, codigo: true, nombre: true, porcentaje: true, pais: true },
  })

  return tasas.map((tasa) => ({ ...tasa, porcentaje: Number(tasa.porcentaje) }))
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
    const contexto = await contextoFiscal(tenantId)
    const propuesta = proponerFiscal(descubrimiento, contexto)

    // Sin elección guardada se parte de lo propuesto: el tipo general (o el
    // reducido, si el negocio es alojamiento) y la moneda del país.
    const guardada = normalizarSeleccionFiscal(fiscalDelPlan(registro?.plan), propuesta)
    const porDefecto = {
      moneda: propuesta.moneda.recomendada ?? propuesta.moneda.actual,
      tasas: propuesta.tasas.filter((tasa) => tasa.propuesto).map((tasa) => tasa.codigo),
    }
    const seleccion = guardada.seleccion.tasas.length > 0 ? guardada.seleccion : porDefecto

    const enCuenta = await tasasEnCuenta(tenantId)

    return NextResponse.json({
      propuesta,
      seleccion,
      resumen: resumenFiscal(seleccion, propuesta),
      enCuenta,
      monedas: monedasOfrecidas(),
      paises: getSupportedCountries(),
      monedaActual: contexto.monedaActual,
      aplicadoEn: fiscalDelPlan(registro?.plan).aplicadoEn ?? null,
      deshacerDisponible: creadosDelPlan(registro?.plan).length > 0,
      avisos: guardada.avisos,
    })
  } catch (error) {
    console.error('[Implantacion fiscal GET] Error:', error)
    return NextResponse.json({ error: 'Error al leer los impuestos del alta' }, { status: 500 })
  }
}, ['settings:read'])

// ─── POST: crear impuestos y fijar la moneda ─────────────────────────────────

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

    const { descubrimiento } = normalizarDescubrimiento(registro.descubrimiento)
    const contexto = await contextoFiscal(tenantId)
    const propuesta = proponerFiscal(descubrimiento, contexto)

    const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { seleccion, avisos } = normalizarSeleccionFiscal(cuerpo, propuesta)

    const resultado = await aplicarFiscal(tenantId, propuesta, seleccion)
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.mensaje, avisos }, { status: 400 })
    }

    const creadasAhora = resultado.resultado.tasas
      .filter((tasa) => tasa.estado === 'creada')
      .map((tasa) => tasa.codigo)

    // Se acumula lo creado: si luego se añade otro impuesto, deshacer alcanza a
    // todos. Y se sustituye el código si se había borrado a mano y se recreó.
    const previos = creadosDelPlan(registro.plan)
    const creados = [...previos.filter((codigo) => !creadasAhora.includes(codigo)), ...creadasAhora]

    const ahora = new Date()

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...leerPlan(registro.plan),
          fiscal: {
            pais: propuesta.pais,
            moneda: seleccion.moneda,
            tasas: seleccion.tasas,
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
        accion: 'implantacion_fiscal',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: `Fiscal del alta aplicado: ${resultado.resultado.tasas.map((t) => `${t.codigo} ${t.porcentaje}% (${t.estado})`).join(', ')}${
          resultado.resultado.moneda.cambiada
            ? ` · moneda ${resultado.resultado.moneda.anterior} → ${resultado.resultado.moneda.actual}`
            : ''
        }`,
        metadata: {
          pieza: 'fiscal',
          pais: propuesta.pais,
          seleccion: seleccion as unknown as Prisma.InputJsonValue,
          resultado: resultado.resultado as unknown as Prisma.InputJsonValue,
          estadoPrevio: registro.estado,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      resultado: resultado.resultado,
      avisos,
      seleccion,
      resumen: resumenFiscal(seleccion, propuesta),
      enCuenta: await tasasEnCuenta(tenantId),
      aplicadoEn: ahora.toISOString(),
    })
  } catch (error) {
    console.error('[Implantacion fiscal POST] Error:', error)
    return NextResponse.json({ error: 'No se pudieron crear los impuestos' }, { status: 500 })
  }
}, ['settings:write'])

// ─── DELETE: deshacer impuestos ──────────────────────────────────────────────

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
        { error: 'No hay ningún impuesto del alta que deshacer' },
        { status: 409 },
      )
    }

    const resultado = await deshacerFiscal(tenantId, creados)

    const fiscalPrevio = fiscalDelPlan(registro?.plan)
    const siguen = creados.filter((codigo) =>
      resultado.conservadas.some((tasa) => tasa.codigo === codigo),
    )

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...leerPlan(registro?.plan),
          fiscal: {
            ...fiscalPrevio,
            // Lo que se quedó porque ya está en documentos sigue marcado: si
            // deja de usarse, deshacer vuelve a funcionar.
            creados: siguen,
            deshechoEn: new Date().toISOString(),
          },
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_fiscal_deshacer',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: resultado.borradas.length
          ? `Impuestos del alta deshechos: ${resultado.borradas.length} borrado${resultado.borradas.length === 1 ? '' : 's'}${
              resultado.conservadas.length
                ? `, ${resultado.conservadas.length} conservado${resultado.conservadas.length === 1 ? '' : 's'} por estar en documentos`
                : ''
            }`
          : 'Impuestos del alta no deshechos: todos están en uso',
        metadata: {
          pieza: 'fiscal',
          borradas: resultado.borradas,
          conservadas: resultado.conservadas as unknown as Prisma.InputJsonValue,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      borradas: resultado.borradas,
      conservadas: resultado.conservadas,
      ausentes: resultado.ausentes,
      enCuenta: await tasasEnCuenta(tenantId),
    })
  } catch (error) {
    console.error('[Implantacion fiscal DELETE] Error:', error)
    return NextResponse.json({ error: 'No se pudieron deshacer los impuestos' }, { status: 500 })
  }
}, ['settings:write'])
