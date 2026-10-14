export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { primeraMoneda, monedaEscritura } from '@/lib/moneda';
import { normalizarEstacionalidad, problemaEnTemporadas } from '@/lib/hospitality/estacionalidad';
import { normalizarAjustes, pidenAjustes } from '@/lib/hospitality/ajustes';
/**
 * Planes de tarifa y restricciones de venta (plan maestro §6, §15).
 *
 * GET  /api/hospitality/rateplans?propertyId=&unitId=&activo=
 * POST /api/hospitality/rateplans — crear un plan (dispara el push de tarifas)
 *
 * Un plan pertenece SIEMPRE a una unidad (y a su propiedad). `codigo` es el
 * rateplanCode externo solo si hay mapping; nunca es la identidad interna.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') || undefined;
    const unitId = searchParams.get('unitId') || undefined;
    const soloActivos = searchParams.get('activo') === 'true';

    const where: any = { tenantId: auth.tenant!.id };
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (soloActivos) where.activo = true;

    const plans = await prisma.hospitalityRatePlan.findMany({
      where,
      include: {
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
      },
      orderBy: [{ propertyId: 'asc' }, { unitId: 'asc' }, { nombre: 'asc' }],
    });

    return NextResponse.json({ ratePlans: plans, total: plans.length });
  } catch (error) {
    console.error('Error obteniendo planes tarifarios:', error);
    return NextResponse.json({ error: 'Error al obtener los planes tarifarios' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const { propertyId, unitId, nombre, codigo, tarifa, moneda, minNoches, maxNoches, checkInDias, checkOutDias, activo, temporadas, finDeSemana, ajustes } = body;

    if (!propertyId || !unitId || !nombre || tarifa == null) {
      return NextResponse.json(
        { error: 'propertyId, unitId, nombre y tarifa son obligatorios' },
        { status: 400 }
      );
    }
    if (typeof tarifa !== 'number' || tarifa <= 0) {
      return NextResponse.json({ error: 'La tarifa debe ser un número mayor a 0' }, { status: 400 });
    }
    // Estacionalidad: se normaliza UNA vez aquí y se guarda canónica — la base
    // nunca ve un rango malformado y toda la lectura (engine, push) puede
    // confiar en la forma. La tarifa base sigue siendo obligatoria: es el
    // "desde" de la unidad y el respaldo de las fechas sin temporada.
    const estacionalidad = normalizarEstacionalidad({ temporadas, finDeSemana });
    if (
      Array.isArray(temporadas) && temporadas.length > 0 &&
      !estacionalidad?.temporadas
    ) {
      return NextResponse.json(
        { error: 'Hay temporadas con datos inválidos (fechas YYYY-MM-DD, hasta ≥ desde, tarifa > 0)' },
        { status: 400 }
      );
    }
    if (
      finDeSemana != null && typeof finDeSemana === 'object' &&
      Array.isArray(finDeSemana.dias) && finDeSemana.dias.length > 0 &&
      !estacionalidad?.finDeSemana
    ) {
      return NextResponse.json(
        { error: 'El recargo de fin de semana es inválido (días 0-6, porcentaje > 0)' },
        { status: 400 }
      );
    }
    // Las reglas de venta de una temporada (mínimo, máximo, días de entrada y
    // salida) no vacían el plan cuando son inválidas — se ignoran—, así que un
    // 400 aquí es la única forma de que el hotel se entere de que la restricción
    // que acaba de configurar no existe: callarlo sería una regla de venta que
    // cree tener puesta.
    const problemaTemporadas = problemaEnTemporadas(temporadas);
    if (problemaTemporadas) {
      return NextResponse.json({ error: problemaTemporadas }, { status: 400 });
    }
    // Capa 2: se normaliza aquí y se guarda canónica, igual que la capa 1. Un
    // tramo con datos imposibles descarta la regla entera; si el cliente pedía
    // reglas y no queda ninguna, es un error suyo y no un plan sin ajustes.
    const ajustesLimpios = normalizarAjustes(ajustes);
    if (pidenAjustes(ajustes) && !ajustesLimpios) {
      return NextResponse.json(
        {
          error:
            'Hay ajustes con datos inválidos (porcentaje ≠ 0 y entre -90 y 500, días/ocupación/noches coherentes)',
        },
        { status: 400 }
      );
    }

    // La unidad debe existir y pertenecer al tenant (aislamiento multi-tenant).
    // Se trae su divisa: un plan tarifario hereda la de la unidad que tarifa.
    const unit = await prisma.hospitalityUnit.findFirst({
      where: { id: unitId, tenantId, propertyId },
      select: { id: true, moneda: true },
    });
    if (!unit) {
      return NextResponse.json({ error: 'La unidad no existe en este tenant' }, { status: 404 });
    }

    // Divisa del plan, por precedencia: la indicada gana sobre la de su unidad,
    // y sin ninguna de las dos cae a la moneda de reporte del tenant. El orden
    // importa —un plan en dólares sobre una unidad en euros es una decisión del
    // hotel, no un empate que se resuelva solo—, así que se usa `primeraMoneda`
    // y no `monedaPredominante`.
    const monedaDelPlan = primeraMoneda(moneda, unit.moneda) || auth.tenant!.moneda;

    const plan = await prisma.hospitalityRatePlan.create({
      data: {
        tenantId,
        propertyId,
        unitId,
        nombre: String(nombre).trim(),
        codigo: codigo ? String(codigo).trim() : null,
        tarifa,
        moneda: monedaEscritura(monedaDelPlan),
        minNoches: Math.max(1, parseInt(minNoches) || 1),
        maxNoches: maxNoches != null ? parseInt(maxNoches) : null,
        checkInDias: Array.isArray(checkInDias) && checkInDias.length ? checkInDias : Prisma.JsonNull,
        checkOutDias: Array.isArray(checkOutDias) && checkOutDias.length ? checkOutDias : Prisma.JsonNull,
        temporadas: estacionalidad?.temporadas
          ? (estacionalidad.temporadas as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        finDeSemana: estacionalidad?.finDeSemana
          ? (estacionalidad.finDeSemana as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ajustes: ajustesLimpios
          ? (ajustesLimpios as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        activo: activo !== false,
      },
    });

    // Push de tarifas hacia la capa de conectividad (upsert, no bloquea).
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    dispatchConnectivityPush(tenantId, propertyId, 'manual', { diasHorizonte: 180 })
      .catch((e: unknown) => console.error('[Hospitality] Push de tarifas falló:', e));

    return NextResponse.json({ ratePlan: plan }, { status: 201 });
  } catch (error) {
    console.error('Error creando plan tarifario:', error);
    return NextResponse.json({ error: 'Error al crear el plan tarifario' }, { status: 500 });
  }
}