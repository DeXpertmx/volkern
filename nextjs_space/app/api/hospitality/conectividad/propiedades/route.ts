export const dynamic = 'force-dynamic';

/**
 * Conectividad de Canales — credencial POR PROPIEDAD.
 *
 * El servicio de canales da un token **por hotel**, no uno por cuenta, y ese
 * token viaja en la ruta de cada petición. Guardarlo por propiedad es lo que
 * permite que dos hoteles del mismo cliente no compartan credencial ni se vean
 * el catálogo del otro.
 *
 * GET  /api/hospitality/conectividad/propiedades
 *   Todas las propiedades del hotel con el estado de su credencial. Nunca el
 *   token: solo `configurado`, que dice si existe. El valor no sale de aquí ni
 *   vuelve a entrar por aquí.
 *
 * PUT  /api/hospitality/conectividad/propiedades
 *   { propertyId, externalPropertyId, token?, activo?, modo? }  cifra y guarda
 *   (o rota) el token. Sin `token` se conserva el que hubiera: cambiar `activo`
 *   o `modo` no obliga a volver a pegarlo.
 *
 * La respuesta incluye `avisos` de la política de un solo escritor (dos
 * proveedores activos empujando la misma noche). Se guarda igual: el conflicto
 * se resuelve donde se decide quién escribe, no rechazando la credencial.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { NOBEDS_PROVIDER_KEY } from '@/lib/hospitality/nobeds/cliente';
import { guardarCredencialPropiedad } from '@/lib/hospitality/nobeds/config-propiedad';
import type { ModoProveedor } from '@/lib/hospitality/conectividad-proveedores';

interface FilaCredencial {
  externalPropertyId: string;
  tokenEnc: string | null;
  activo: boolean;
  modo: string;
  estado: string;
  ultimoChequeo: Date | null;
  ultimoError: string | null;
}

/** Proyección sin secretos: el token se convierte en un booleano y no viaja. */
function sinSecretos(fila: FilaCredencial | null | undefined) {
  return {
    configurado: Boolean(fila?.tokenEnc),
    activo: fila?.activo ?? false,
    modo: fila?.modo ?? 'escritura',
    estado: fila ? fila.estado : 'sin_configurar',
    externalPropertyId: fila?.externalPropertyId ?? null,
    ultimoChequeo: fila?.ultimoChequeo ?? null,
    ultimoError: fila?.ultimoError ?? null,
  };
}

const SELECCION: {
  externalPropertyId: true;
  tokenEnc: true;
  activo: true;
  modo: true;
  estado: true;
  ultimoChequeo: true;
  ultimoError: true;
} = {
  externalPropertyId: true,
  tokenEnc: true,
  activo: true,
  modo: true,
  estado: true,
  ultimoChequeo: true,
  ultimoError: true,
};

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.ver');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const [propiedades, configs] = await Promise.all([
      prisma.hospitalityProperty.findMany({
        where: { tenantId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.hospitalityConnectivityPropertyConfig.findMany({
        where: { tenantId, provider: NOBEDS_PROVIDER_KEY },
        select: { propertyId: true, ...SELECCION },
      }),
    ]);

    const porPropiedad = new Map(configs.map((c) => [c.propertyId, c]));

    return NextResponse.json({
      propiedades: propiedades.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        conectividad: sinSecretos(porPropiedad.get(p.id)),
      })),
    });
  } catch (error: unknown) {
    console.error('[Conectividad] Error en GET de credenciales por propiedad:', error);
    return NextResponse.json(
      { error: 'Error obteniendo la conectividad de las propiedades' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    if (!propertyId) {
      return NextResponse.json(
        { ok: false, campo: 'propertyId', error: 'Falta la propiedad.' },
        { status: 400 }
      );
    }
    if (body.token !== undefined && typeof body.token !== 'string') {
      return NextResponse.json(
        { ok: false, campo: 'token', error: 'El token debe ser texto.' },
        { status: 400 }
      );
    }

    // La propiedad tiene que ser de este hotel: sin esto, el id de otra cuenta
    // bastaría para escribirle una credencial.
    const propiedad = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true, nombre: true },
    });
    if (!propiedad) {
      return NextResponse.json(
        { ok: false, error: 'La propiedad no existe en tu cuenta.' },
        { status: 404 }
      );
    }

    const resultado = await guardarCredencialPropiedad({
      tenantId,
      propertyId,
      externalPropertyId:
        typeof body.externalPropertyId === 'string' ? body.externalPropertyId : '',
      token: body.token as string | undefined,
      activo: typeof body.activo === 'boolean' ? body.activo : undefined,
      modo:
        body.modo === undefined
          ? undefined
          : (String(body.modo) as ModoProveedor),
    });

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, campo: resultado.campo, error: resultado.error },
        { status: 400 }
      );
    }

    const fila = await prisma.hospitalityConnectivityPropertyConfig.findUnique({
      where: {
        tenantId_propertyId_provider: {
          tenantId,
          propertyId,
          provider: NOBEDS_PROVIDER_KEY,
        },
      },
      select: SELECCION,
    });

    return NextResponse.json({
      ok: true,
      avisos: resultado.avisos,
      propiedad: {
        id: propiedad.id,
        nombre: propiedad.nombre,
        conectividad: sinSecretos(fila),
      },
      // Redundante a propósito: `estado` es la forma que ya usa el lector y
      // confirma que lo guardado es lo que se leyó. Tampoco lleva el token.
      estado: resultado.estado,
    });
  } catch (error: unknown) {
    console.error('[Conectividad] Error en PUT de credencial por propiedad:', error);
    return NextResponse.json(
      { ok: false, error: 'Error guardando la credencial de la propiedad' },
      { status: 500 }
    );
  }
}
