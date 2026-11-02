export const dynamic = 'force-dynamic';

/**
 * API del alta guiada (R1).
 *
 * GET   → estado, descubrimiento, propuesta vigente y checklist.
 * POST  → guarda el descubrimiento y genera la propuesta (si hay material).
 * PATCH → guarda la elección del cliente (aceptados / descartados) y avanza.
 *
 * Dos decisiones que se ven en el código:
 *   - La propuesta se **recalcula** en cada lectura con el plan vigente. Si el
 *     cliente sube de plan, sus tarjetas no pueden seguir diciendo «addon».
 *   - Nada de esto escribe módulos del tenant. Aceptar una tarjeta deja la
 *     elección registrada; activarla es una acción aparte (aplicar el plan es
 *     R4) y así el alta no puede encender algo sin que se vea.
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { getPlanConfig } from '@/lib/plans';
import { PIPELINE_LIMITS_BY_PLAN } from '@/lib/pipelines';
import { resolverModulosTenant } from '@/lib/tenant-modules';
import {
  MINIMO_RESPUESTAS_PARA_PROPONER,
  hayMaterialSuficiente,
  normalizarDescubrimiento,
  resumenDescubrimiento,
  type Descubrimiento,
} from '@/lib/implantacion/descubrimiento';
import {
  INFORMES,
  PLANTILLAS,
  recomendar,
  type ContextoRecomendacion,
  type Recomendacion,
} from '@/lib/implantacion/recomendar';
import {
  ETIQUETAS_ESTADO,
  PASOS,
  checklistDeAlta,
  normalizarEstado,
  puedeTransicionar,
  type EstadoImplantacion,
  type TareaChecklist,
} from '@/lib/implantacion/estado';
import { ROL_EQUIPO_POR_ID, type RolEquipoId } from '@/lib/implantacion/roles';
import { leerFirma, normalizarFirma, puedeFirmar } from '@/lib/implantacion/cierre';
import { aplicarRedaccion, avisoDeTope, leerRedaccion, redactarPropuesta, sinAviso, REDACCION_VACIA } from '@/lib/implantacion/redactar'
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * El checklist se calcula siempre con lo que hay guardado: módulos aceptados e
 * informes realmente fijados. Así «Informes fijados» no se cierra por avanzar
 * de paso, solo cuando la selección está aplicada en la cuenta.
 */
function checklistDe(
  estado: EstadoImplantacion,
  aceptados: string[],
  tieneRecomendacion: boolean,
  registro: {
    informes?: string[] | null
    entregablesAplicadosEn?: Date | null
    plan?: unknown
    firmaGoLive?: unknown
  } | null,
  embudoAplicado: boolean,
  roles: { elegidos: number; enCuenta: number },
  fiscal: { tasasActivas: number; emisorPrincipal: boolean; monedaConfirmada: boolean },
  marca: { aplicada: boolean; elegidos: number; enCuenta: number },
  cargados: { importaciones: number; registros: number },
): TareaChecklist[] {
  return checklistDeAlta({
    estado,
    aceptados,
    tieneRecomendacion,
    informesFijados: registro?.informes?.length ?? 0,
    entregablesAplicadosEn: registro?.entregablesAplicadosEn ?? null,
    embudoAplicado,
    rolesElegidos: roles.elegidos,
    rolesEnCuenta: roles.enCuenta,
    tasasActivas: fiscal.tasasActivas,
    emisorPrincipal: fiscal.emisorPrincipal,
    monedaConfirmada: fiscal.monedaConfirmada,
    marcaAplicada: marca.aplicada,
    canalesElegidos: marca.elegidos,
    canalesEnCuenta: marca.enCuenta,
    importacionesConfirmadas: cargados.importaciones,
    registrosEnCuenta: cargados.registros,
    firmaGoLive: leerFirma(registro?.firmaGoLive ?? null),
  });
}

/** Id del embudo que creó el alta, si lo hay. */
function pipelineDelPlan(plan: unknown): string | null {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null
  const id = (plan as Record<string, unknown>).pipelineId
  return typeof id === 'string' ? id : null
}

/**
 * «Embudo aprobado» no se cierra por llegar al paso: se comprueba que el
 * embudo siga existiendo. Si alguien lo borró a mano, la línea vuelve a abrirse.
 */
async function embudoEnCuenta(tenantId: string, plan: unknown): Promise<boolean> {
  const pipelineId = pipelineDelPlan(plan)
  if (!pipelineId) return false
  const existe = await prisma.pipeline.count({ where: { id: pipelineId, tenantId } })
  return existe > 0
}

/**
 * «Equipo y permisos» se cierra con hechos: los roles que se eligieron en el
 * alta tienen que seguir existiendo. Si alguien borra «Comercial» desde Equipo,
 * la línea vuelve a abrirse en vez de decir que está hecho.
 */
async function rolesDelAltaEnCuenta(
  tenantId: string,
  plan: unknown,
): Promise<{ elegidos: number; enCuenta: number }> {
  const roles = plan && typeof plan === 'object' && !Array.isArray(plan)
    ? (plan as Record<string, unknown>).roles
    : null
  const seleccion = roles && typeof roles === 'object' && !Array.isArray(roles)
    ? (roles as Record<string, unknown>).seleccion
    : null
  if (!Array.isArray(seleccion)) return { elegidos: 0, enCuenta: 0 };

  const nombres: string[] = []
  for (const entrada of seleccion) {
    const id = typeof entrada === 'string' ? entrada : (entrada as { id?: unknown })?.id
    if (typeof id !== 'string') continue;
    const nombre = ROL_EQUIPO_POR_ID[id as RolEquipoId]?.nombre;
    if (nombre && !nombres.includes(nombre)) nombres.push(nombre);
  }

  if (nombres.length === 0) return { elegidos: 0, enCuenta: 0 };

  const sigue = await prisma.role.count({ where: { tenantId, nombre: { in: nombres } } });
  return { elegidos: nombres.length, enCuenta: sigue };
}

/**
 * «Fiscal listo para facturar» se cierra con datos, no con pasos: un impuesto
 * activo, un emisor principal y una moneda que el cliente confirmó al aplicar
 * (no la heredada por defecto).
 */
async function fiscalEnCuenta(
  tenantId: string,
  plan: unknown,
): Promise<{ tasasActivas: number; emisorPrincipal: boolean; monedaConfirmada: boolean }> {
  const [tasas, emisores] = await Promise.all([
    prisma.tasaImpuesto.count({ where: { tenantId, activo: true } }),
    prisma.configuracionFiscalEmisor.count({ where: { tenantId, esPrincipal: true, activo: true } }),
  ])

  const fiscal =
    plan && typeof plan === 'object' && !Array.isArray(plan)
      ? (plan as Record<string, unknown>).fiscal
      : null
  const moneda =
    fiscal && typeof fiscal === 'object' && !Array.isArray(fiscal)
      ? (fiscal as Record<string, unknown>).moneda
      : null

  return {
    tasasActivas: tasas,
    emisorPrincipal: emisores > 0,
    monedaConfirmada: typeof moneda === 'string' && moneda.length > 0,
  }
}

/**
 * «Marca y canales» se cierra con hechos: el nombre comercial escrito, el color
 * de marca guardado y una tarea por cada canal elegido. Proponerlos no escribe
 * nada y por eso no basta para tachar la línea.
 */
async function marcaYCanalesEnCuenta(
  tenantId: string,
  plan: unknown,
): Promise<{ aplicada: boolean; elegidos: number; enCuenta: number }> {
  const marca =
    plan && typeof plan === 'object' && !Array.isArray(plan)
      ? ((plan as Record<string, unknown>).marca as Record<string, unknown> | undefined)
      : undefined

  const seleccionBruta = marca?.seleccion
  const tareasBrutas = marca?.tareas
  const seleccion = Array.isArray(seleccionBruta) ? seleccionBruta : []
  const tareas = Array.isArray(tareasBrutas)
    ? tareasBrutas
        .map((tarea) => (tarea as { id?: unknown })?.id)
        .filter((id): id is string => typeof id === 'string')
    : []

  const [nombre, tenant, enCuenta] = await Promise.all([
    prisma.configuracion.findUnique({
      where: { tenantId_clave: { tenantId, clave: 'business_name' } },
      select: { valor: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { brandingConfig: true } }),
    tareas.length > 0 ? prisma.task.count({ where: { tenantId, id: { in: tareas } } }) : 0,
  ])

  const nombreOk = typeof nombre?.valor === 'string' && nombre.valor.trim().length > 0
  const color = (tenant?.brandingConfig as { primaryColor?: unknown } | null)?.primaryColor
  const colorOk = typeof color === 'string' && color.trim().length > 0

  return { aplicada: nombreOk && colorOk, elegidos: seleccion.length, enCuenta }
}

/**
 * «Datos cargados» se cierra con datos en la cuenta, no por llegar al paso: las
 * importaciones **confirmadas** (ni previsualizaciones ni lotes deshechos) o los
 * registros que ya existen, importados o creados a mano. Quien empezó antes del
 * alta también los tiene; si se deshace el último lote, la línea vuelve a abrirse.
 */
async function datosEnCuenta(
  tenantId: string,
): Promise<{ importaciones: number; registros: number }> {
  const [importaciones, leads, contactos, servicios] = await Promise.all([
    prisma.importLog.count({
      where: { tenantId, mode: 'commit', revertedAt: null, recordsImported: { gt: 0 } },
    }),
    prisma.lead.count({ where: { tenantId } }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.servicio.count({ where: { tenantId } }),
  ])

  return { importaciones, registros: leads + contactos + servicios }
}

interface DatosDelTenant {
  contexto: ContextoRecomendacion;
  modulosActivos: string[];
  nombrePlan: string;
}

async function datosDelTenant(tenantId: string): Promise<DatosDelTenant | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, enabledModules: true, subdomain: true },
  });
  if (!tenant) return null;

  const features = await prisma.tenantFeature.findMany({
    where: { tenantId },
    select: { feature: true, habilitado: true },
  });

  const planConfig = await getPlanConfig(tenant.plan);
  const modulosActivos = await resolverModulosTenant(tenant, features);
  const limites = (planConfig?.limites ?? {}) as { users?: number };

  return {
    nombrePlan: planConfig?.nombre ?? tenant.plan,
    modulosActivos,
    contexto: {
      plan: tenant.plan,
      modulosPlan: (planConfig?.modules ?? []) as string[],
      modulosActivos,
      limiteEmbudos: PIPELINE_LIMITS_BY_PLAN[tenant.plan],
      limiteUsuarios: typeof limites.users === 'number' ? limites.users : null,
    },
  };
}

function proponer(descubrimiento: Descubrimiento, contexto: ContextoRecomendacion): Recomendacion | null {
  if (!hayMaterialSuficiente(descubrimiento)) return null;
  return recomendar(descubrimiento, contexto);
}

/** Deja solo ids permitidos, sin duplicados y en el orden en que llegaron. */
function depurarIds(valor: unknown, permitidos: Set<string>): string[] {
  if (!Array.isArray(valor)) return [];
  const limpios: string[] = [];
  for (const v of valor) {
    if (typeof v !== 'string') continue;
    if (!permitidos.has(v)) continue;
    if (!limpios.includes(v)) limpios.push(v);
  }
  return limpios;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const datos = await datosDelTenant(tenantId);
    if (!datos) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

    const registro = await prisma.implantacionTenant.findUnique({ where: { tenantId } });
    const { descubrimiento } = normalizarDescubrimiento(registro?.descubrimiento);
    const fresca = proponer(descubrimiento, datos.contexto);
    // La redacción con IA se guardó con la propuesta: al releer se vuelve a
    // aplicar sobre el cálculo fresco (si el plan cambió, las tarjetas se
    // actualizan) sin llamar al modelo en cada carga de pantalla.
    const recomendacion = fresca
      ? aplicarRedaccion(fresca, leerRedaccion(registro?.recomendacion))
      : null;
    const estado = normalizarEstado(registro?.estado);
    const aceptados = registro?.aceptados ?? [];
    const descartados = registro?.descartados ?? [];
    const embudoAplicado = await embudoEnCuenta(tenantId, registro?.plan);
    const roles = await rolesDelAltaEnCuenta(tenantId, registro?.plan);
    const fiscal = await fiscalEnCuenta(tenantId, registro?.plan);
    const marca = await marcaYCanalesEnCuenta(tenantId, registro?.plan);
    const cargados = await datosEnCuenta(tenantId);

    return NextResponse.json({
      estado,
      pasos: PASOS,
      etiquetas: ETIQUETAS_ESTADO,
      descubrimiento,
      resumen: resumenDescubrimiento(descubrimiento),
      recomendacion,
      aceptados,
      descartados,
      firma: leerFirma(registro?.firmaGoLive ?? null),
      checklist: checklistDe(
        estado,
        aceptados,
        Boolean(recomendacion),
        registro,
        embudoAplicado,
        roles,
        fiscal,
        marca,
        cargados,
      ),
      cuenta: {
        plan: datos.contexto.plan,
        nombrePlan: datos.nombrePlan,
        limiteEmbudos: datos.contexto.limiteEmbudos ?? null,
        limiteUsuarios: datos.contexto.limiteUsuarios ?? null,
        modulosActivos: datos.modulosActivos,
      },
      catalogos: { informes: INFORMES, plantillas: PLANTILLAS },
      minimoRespuestas: MINIMO_RESPUESTAS_PARA_PROPONER,
    });
  } catch (error) {
    console.error('[Implantacion GET] Error:', error);
    return NextResponse.json({ error: 'Error al leer el alta guiada' }, { status: 500 });
  }
}, ['settings:read']);

// ─── POST: descubrimiento ────────────────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const datos = await datosDelTenant(tenantId);
    if (!datos) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

    const cuerpo = await request.json().catch(() => ({} as Record<string, unknown>));
    const { descubrimiento, avisos } = normalizarDescubrimiento(
      (cuerpo as Record<string, unknown>)?.descubrimiento ?? cuerpo,
    );

    const recomendacion = proponer(descubrimiento, datos.contexto);
    // R3: la IA redacta los motivos y busca contradicciones; si falla, la
    // propuesta sale igual con los textos plantilla (`fuente: 'plantilla'`).
    //
    // El modelo cuesta dinero y el cuestionario se puede guardar muchas veces
    // mientras el cliente corrige respuestas, así que cada reescritura consume
    // cupo del plan (`implantacion_ia_day`). Sin cupo no hay llamada: se avisa
    // en la respuesta y la propuesta sale con los motivos del motor.
    const cupo =
      recomendacion && recomendacion.modulos.length > 0
        ? await rateLimiter.checkLimit(tenantId, 'implantacion_ia_day')
        : null;

    const propuesta = recomendacion
      ? cupo && !cupo.allowed
        ? aplicarRedaccion(recomendacion, {
            ...REDACCION_VACIA,
            aviso: avisoDeTope(cupo.limit),
          })
        : await redactarPropuesta(descubrimiento, recomendacion)
      : null;
    const previo = await prisma.implantacionTenant.findUnique({ where: { tenantId } });
    const embudoAplicado = await embudoEnCuenta(tenantId, previo?.plan);

    // Al rehacer el descubrimiento la propuesta cambia: lo aceptado que ya no
    // se propone deja de contar y el cliente vuelve a confirmar. No se borra
    // el histórico de aceptados de módulos que siguen en la propuesta.
    const permitidos = new Set((recomendacion?.modulos ?? []).map((m) => m.id));
    const aceptados = (previo?.aceptados ?? []).filter((id) => permitidos.has(id));
    const descartados = (previo?.descartados ?? []).filter((id) => permitidos.has(id));
    const estado: EstadoImplantacion = recomendacion ? 'propuesta' : 'descubrimiento';

    // El aviso del cupo es de esta respuesta, no del alta: se guarda la
    // propuesta sin él para que la pantalla no repita el aviso mañana.
    const propuestaGuardada = propuesta
      ? { ...propuesta, redaccion: sinAviso(propuesta.redaccion) }
      : null

    await prisma.implantacionTenant.upsert({
      where: { tenantId },
      update: {
        estado,
        descubrimiento: descubrimiento as unknown as Prisma.InputJsonValue,
        recomendacion: propuestaGuardada
          ? (propuestaGuardada as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        aceptados,
        descartados,
      },
      create: {
        tenantId,
        estado,
        descubrimiento: descubrimiento as unknown as Prisma.InputJsonValue,
        recomendacion: propuestaGuardada
          ? (propuestaGuardada as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        aceptados,
        descartados,
      },
    });

    const resumen = resumenDescubrimiento(descubrimiento);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: auth.user?.id ?? null,
        accion: 'implantacion_descubrimiento',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: recomendacion
          ? `Descubrimiento guardado: ${resumen.contestadas}/${resumen.total} respuestas, ${recomendacion.modulos.length} módulos propuestos`
          : `Descubrimiento guardado: ${resumen.contestadas}/${resumen.total} respuestas, sin propuesta (faltan respuestas)`,
        metadata: {
          contestadas: resumen.contestadas,
          noSe: resumen.noSe,
          propuestos: recomendacion?.modulos.map((m) => m.id) ?? [],
          plan: datos.contexto.plan,
        },
      },
    });

    return NextResponse.json({
      estado,
      avisos,
      descubrimiento,
      resumen,
      recomendacion: propuesta,
      aceptados,
      descartados,
      // `previo` conserva los informes ya fijados: rehacer el descubrimiento
      // no los desfija.
      checklist: checklistDe(
        estado,
        aceptados,
        Boolean(recomendacion),
        previo,
        embudoAplicado,
        await rolesDelAltaEnCuenta(tenantId, previo?.plan),
        await fiscalEnCuenta(tenantId, previo?.plan),
        await marcaYCanalesEnCuenta(tenantId, previo?.plan),
        await datosEnCuenta(tenantId),
      ),
      faltanParaProponer: recomendacion
        ? 0
        : Math.max(0, MINIMO_RESPUESTAS_PARA_PROPONER - resumen.contestadas),
      cuenta: {
        plan: datos.contexto.plan,
        nombrePlan: datos.nombrePlan,
        limiteEmbudos: datos.contexto.limiteEmbudos ?? null,
        limiteUsuarios: datos.contexto.limiteUsuarios ?? null,
        modulosActivos: datos.modulosActivos,
      },
      catalogos: { informes: INFORMES, plantillas: PLANTILLAS },
      minimoRespuestas: MINIMO_RESPUESTAS_PARA_PROPONER,
    });
  } catch (error) {
    console.error('[Implantacion POST] Error:', error);
    return NextResponse.json({ error: 'Error al guardar el descubrimiento' }, { status: 500 });
  }
}, ['settings:write']);

// ─── PATCH: elección ─────────────────────────────────────────────────────────

export const PATCH = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const datos = await datosDelTenant(tenantId);
    if (!datos) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

    const registro = await prisma.implantacionTenant.findUnique({ where: { tenantId } });
    if (!registro) {
      return NextResponse.json(
        { error: 'Primero hay que completar el descubrimiento' },
        { status: 409 },
      );
    }

    const { descubrimiento } = normalizarDescubrimiento(registro.descubrimiento);
    const recomendacion = proponer(descubrimiento, datos.contexto);
    if (!recomendacion) {
      return NextResponse.json(
        { error: 'El descubrimiento aún no tiene respuestas suficientes para elegir módulos' },
        { status: 409 },
      );
    }

    const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const permitidos = new Set(recomendacion.modulos.map((m) => m.id));

    const aceptados = Array.isArray(cuerpo.aceptados)
      ? depurarIds(cuerpo.aceptados, permitidos)
      : (registro.aceptados ?? []).filter((id) => permitidos.has(id));
    const descartados = Array.isArray(cuerpo.descartados)
      ? depurarIds(cuerpo.descartados, permitidos).filter((id) => !aceptados.includes(id))
      : (registro.descartados ?? []).filter((id) => permitidos.has(id) && !aceptados.includes(id));

    const actual = normalizarEstado(registro.estado);
    let estado: EstadoImplantacion = actual;
    let aviso: string | null = null;

    // ─── Firma del go-live ───────────────────────────────────────────────────
    // Cerrar el alta no es un paso más: exige el checklist entero cumplido y
    // deja por escrito con qué se mide. Retirarla devuelve el alta a datos.
    const firmaPrevia = leerFirma(registro.firmaGoLive);
    let firma = firmaPrevia;
    const pideFirma = cuerpo.firma !== undefined;
    const pideRetirar = cuerpo.retirarFirma === true;

    if (pideFirma && pideRetirar) {
      return NextResponse.json(
        { error: 'No se puede firmar y retirar la firma en la misma petición' },
        { status: 400 },
      );
    }
    if (pideFirma && typeof cuerpo.estado === 'string') {
      return NextResponse.json(
        { error: 'La firma cierra el alta por sí sola: no se pide junto a un cambio de paso' },
        { status: 400 },
      );
    }
    if (pideRetirar && typeof cuerpo.estado === 'string') {
      return NextResponse.json(
        { error: 'Retirar la firma devuelve el alta a datos por sí solo: no se pide junto a un cambio de paso' },
        { status: 400 },
      );
    }

    if (typeof cuerpo.estado === 'string') {
      if (!(PASOS as readonly string[]).includes(cuerpo.estado)) {
        return NextResponse.json({ error: `Estado inválido: ${cuerpo.estado}` }, { status: 400 });
      }
      const objetivo = cuerpo.estado as EstadoImplantacion;
      if (!puedeTransicionar(actual, objetivo)) {
        return NextResponse.json(
          { error: `No se puede pasar de «${actual}» a «${objetivo}» sin cerrar los pasos intermedios` },
          { status: 400 },
        );
      }
      // El último paso no se alcanza cambiando el estado: se firma.
      if (objetivo === 'listo' && !firma) {
        return NextResponse.json(
          { error: 'El alta se cierra firmando el go-live, no cambiando de paso' },
          { status: 409 },
        );
      }
      // Y con la firma puesta no se vuelve atrás sin retirarla: el checklist ya
      // dice que el alta está cerrada.
      if (firma && objetivo !== 'listo') {
        return NextResponse.json(
          { error: 'El go-live está firmado: retira la firma antes de volver a un paso anterior' },
          { status: 409 },
        );
      }
      estado = objetivo;
    } else if (actual === 'propuesta' && aceptados.length + descartados.length > 0) {
      estado = 'seleccion';
    }

    if (pideRetirar) {
      if (!firmaPrevia) {
        return NextResponse.json({ error: 'El go-live no está firmado' }, { status: 409 });
      }
      firma = null;
      estado = 'datos';
    }

    if (pideFirma) {
      if (firmaPrevia) {
        return NextResponse.json(
          { error: 'El go-live ya está firmado: retira la firma antes de volver a firmarlo' },
          { status: 409 },
        );
      }
      if (actual !== 'datos') {
        return NextResponse.json(
          {
            error: `Para firmar el go-live el alta tiene que estar en el paso de datos (ahora está en «${actual}»).`,
          },
          { status: 409 },
        );
      }

      const normalizada = normalizarFirma(cuerpo.firma, new Date(), auth.user?.id ?? null);
      if (!normalizada.firma) {
        return NextResponse.json(
          { error: normalizada.errores[0], errores: normalizada.errores },
          { status: 400 },
        );
      }

      // El gate se calcula contra la cuenta, no contra lo que cree la pantalla:
      // firmar no puede tapar una pieza que alguien borró después.
      const checklist = checklistDe(
        actual,
        aceptados,
        true,
        registro,
        await embudoEnCuenta(tenantId, registro.plan),
        await rolesDelAltaEnCuenta(tenantId, registro.plan),
        await fiscalEnCuenta(tenantId, registro.plan),
        await marcaYCanalesEnCuenta(tenantId, registro.plan),
        await datosEnCuenta(tenantId),
      );
      const gate = puedeFirmar(checklist);
      if (!gate.listo) {
        return NextResponse.json(
          {
            error: `Todavía falta para firmar: ${gate.pendientes.join(', ')}.`,
            pendientes: gate.pendientes,
          },
          { status: 409 },
        );
      }

      firma = normalizada.firma;
      estado = 'listo';
    }

    if (estado === 'seleccion' && aceptados.length === 0 && descartados.length === 0) {
      aviso = 'Todavía no has aceptado ni descartado ningún módulo: el paso no se cierra solo.';
    }

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        estado,
        aceptados,
        descartados,
        // La firma entra y sale entera: no hay media firma ni fecha suelta.
        ...(pideFirma && firma ? { firmaGoLive: firma as unknown as Prisma.InputJsonValue } : {}),
        ...(pideRetirar ? { firmaGoLive: Prisma.DbNull, completadoEn: null } : {}),
        ...(estado === 'listo' && !pideRetirar ? { completadoEn: new Date() } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: auth.user?.id ?? null,
        accion: pideFirma
          ? 'implantacion_go_live'
          : pideRetirar
            ? 'implantacion_go_live_deshacer'
            : 'implantacion_seleccion',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: pideFirma
          ? `Go-live firmado con criterio de éxito: «${firma?.criterioExito}». Revisión a los 14 días.`
          : pideRetirar
            ? 'Firma del go-live retirada: el alta vuelve al paso de datos.'
            : `Elección de módulos guardada: ${aceptados.length} aceptados, ${descartados.length} descartados (estado ${estado})`,
        metadata: { aceptados, descartados, estado, criterioExito: firma?.criterioExito ?? null },
      },
    });

    return NextResponse.json({
      estado,
      aceptados,
      descartados,
      aviso,
      firma,
      checklist: checklistDe(
        estado,
        aceptados,
        true,
        { ...registro, firmaGoLive: firma },
        await embudoEnCuenta(tenantId, registro.plan),
        await rolesDelAltaEnCuenta(tenantId, registro.plan),
        await fiscalEnCuenta(tenantId, registro.plan),
        await marcaYCanalesEnCuenta(tenantId, registro.plan),
        await datosEnCuenta(tenantId),
      ),
    });
  } catch (error) {
    console.error('[Implantacion PATCH] Error:', error);
    return NextResponse.json({ error: 'Error al guardar la elección' }, { status: 500 });
  }
}, ['settings:write']);
