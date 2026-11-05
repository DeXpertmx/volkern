export const dynamic = 'force-dynamic';

/**
 * Conectividad de Canales — configuración del CLIENTE.
 *
 * El proveedor emite un ID de socio (partner id) al registrarse cada hotel, y
 * ese id es la clave con la que el servicio devuelve SUS propiedades. Sin el
 * suyo, el hotel no puede ver su catálogo ni empujar inventario: la capa
 * funcionaba con un único ID de plataforma y todos los hoteles compartían
 * criterio, que es exactamente lo que no vale cuando cada uno se registra por
 * su cuenta.
 *
 * GET  /api/hospitality/conectividad
 *   Estado para el hotel: si la plataforma ya tiene cargado el acceso al
 *   servicio, si el hotel tiene ya su propio ID de socio y si con eso puede
 *   operar. Nunca devuelve valores, solo marcadores de presencia.
 *
 * PUT /api/hospitality/conectividad
 *   { partnerId: string | null }  guarda el ID de socio del hotel. `null` o
 *   vacío lo borra y devuelve al hotel al ID de plataforma.
 *
 * POST /api/hospitality/conectividad
 *   { accion: 'probar', hotelCode? }  comprueba contra el proveedor que ESE
 *   código de propiedad se ve con el ID de socio del hotel. Es la única forma
 *   de saber que el ID es el correcto antes de vincular unidades: el proveedor
 *   responde 403 «partner desconocido» si no lo es, y 403 «Access Denied -
 *   <hotelCode>» si el hotel no está asignado a la cuenta (que es otra cosa: el
 *   ID de socio sí es válido). Sin `hotelCode` se usa el de la propiedad que el
 *   hotel ya tenga vinculada.
 *
 * El usuario y la contraseña son de la plataforma y NO viajan por aquí: al
 * hotel solo le corresponde su ID de socio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import {
  getHotelVinculadoParaSonda,
  getTenantConnectivityPublic,
  saveTenantPartnerId,
  testConnectivityConnection,
} from '@/lib/hospitality/connectivity';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.ver');
    if (sinPermiso) return sinPermiso;

    const estado = await getTenantConnectivityPublic(auth.tenant!.id);
    return NextResponse.json(estado);
  } catch (error: unknown) {
    console.error('[Conectividad] Error en GET:', error);
    return NextResponse.json({ error: 'Error obteniendo la configuración de conectividad' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // La clave tiene que venir explícitamente: sin ella no se toca nada (un
    // cuerpo vacío no puede borrar el ID de socio por accidente).
    if (!('partnerId' in body)) {
      return NextResponse.json({ error: "Falta 'partnerId' (envía null para borrarlo)" }, { status: 400 });
    }
    if (body.partnerId !== null && typeof body.partnerId !== 'string') {
      return NextResponse.json({ error: "'partnerId' debe ser texto o null" }, { status: 400 });
    }

    const resultado = await saveTenantPartnerId(tenantId, body.partnerId as string | null);
    if (!resultado.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'El ID de socio no tiene el formato esperado. Revísalo: es el identificador que te dio el proveedor al registrarte, no tu correo.',
          avisos: resultado.avisos ?? [],
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, ...(await getTenantConnectivityPublic(tenantId)) });
  } catch (error: unknown) {
    console.error('[Conectividad] Error en PUT:', error);
    return NextResponse.json({ error: 'Error guardando el ID de socio' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const accion = String(body.accion ?? '').trim();
    if (accion !== 'probar') {
      return NextResponse.json({ error: "Acción no válida. Usa 'probar'." }, { status: 400 });
    }

    const hotelCodePedido = typeof body.hotelCode === 'string' ? body.hotelCode.trim() : '';
    // Sin código se usa el de la propiedad YA vinculada de este hotel: es el
    // mismo que viaja en cada push y el único sondeo que dice algo de SU cuenta.
    // El hotel de pruebas del contrato no sirve aquí: a un partner de producción
    // el proveedor le responde `403 Access Denied - sandbox-pms`. Sin vínculo no
    // se adivina: se pide el código.
    const hotelCode = hotelCodePedido || (await getHotelVinculadoParaSonda(tenantId));
    if (!hotelCode) {
      return NextResponse.json(
        {
          error:
            'Indica el código de propiedad del proveedor, o vincula antes una propiedad para usar el suyo.',
        },
        { status: 400 }
      );
    }

    // Siempre 200 con `ok` en el cuerpo: un 5xx lo reemplazaría el proxy por
    // «error code: 502» y se perdería la causa real del rechazo del proveedor.
    const resultado = await testConnectivityConnection(hotelCode, tenantId);
    return NextResponse.json({
      ok: resultado.ok,
      error: resultado.error ?? null,
      hotelCode: resultado.hotelCode ?? hotelCode,
      habitaciones: resultado.property?.rooms?.length ?? null,
      respuestaExterna: resultado.respuestaExterna ?? null,
    });
  } catch (error: unknown) {
    console.error('[Conectividad] Error en POST:', error);
    return NextResponse.json({ ok: false, error: 'Error comprobando la conexión' }, { status: 500 });
  }
}
