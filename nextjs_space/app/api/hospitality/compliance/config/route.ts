export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { borrarCredenciales, guardarConfig, leerConfig } from '@/lib/hospitality/compliance-store';
import { probarAlcance, ENDPOINTS, ENTORNOS, ESQUEMA_XML_DISPONIBLE } from '@/lib/hospitality/ses-hospedajes/connector';

// GET /api/hospitality/compliance/config — la configuración de la entidad.
//
// Devuelve los datos públicos y **nunca** las credenciales: de ellas solo se dice
// si están puestas. La interfaz necesita saber si hay algo guardado para saber si
// puede ofrecer el envío, y nada más.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const config = await leerConfig(auth.tenant!.id);
    return NextResponse.json({
      configuracion: config,
      entornos: ENTORNOS,
      endpoints: ENDPOINTS,
      esquemaDisponible: ESQUEMA_XML_DISPONIBLE,
    });
  } catch (error) {
    console.error('[Hospitality] Error al leer la configuración del registro de viajeros:', error);
    return NextResponse.json({ error: 'No se pudo leer la configuración' }, { status: 500 });
  }
}

// PUT /api/hospitality/compliance/config — guardar la configuración y las credenciales.
//
// Las credenciales son POR TENANT porque cada cuenta se registra como entidad ante
// el Ministerio. Solo se sobrescriben si llegan en el cuerpo, para poder cambiar el
// entorno sin volver a teclear la contraseña.
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const cuerpo = await req.json().catch(() => null);
    if (!cuerpo || typeof cuerpo !== 'object') {
      return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
    }

    if (auth.user?.role?.nombre && !['Superadmin', 'Admin'].includes(auth.user.role.nombre)) {
      return NextResponse.json(
        { error: 'Solo la administración de la cuenta puede cambiar las credenciales' },
        { status: 403 }
      );
    }

    const config = await guardarConfig(
      auth.tenant!.id,
      {
        activo: typeof cuerpo.activo === 'boolean' ? cuerpo.activo : undefined,
        entorno: typeof cuerpo.entorno === 'string' ? cuerpo.entorno : undefined,
        entidadNombre: typeof cuerpo.entidadNombre === 'string' ? cuerpo.entidadNombre : undefined,
        entidadNif: typeof cuerpo.entidadNif === 'string' ? cuerpo.entidadNif : undefined,
        codigoArrendador: typeof cuerpo.codigoArrendador === 'string' ? cuerpo.codigoArrendador : undefined,
        usuario: typeof cuerpo.usuario === 'string' ? cuerpo.usuario : undefined,
        password: typeof cuerpo.password === 'string' ? cuerpo.password : undefined,
        certificado: typeof cuerpo.certificado === 'string' ? cuerpo.certificado : undefined,
      },
      auth.user?.id ?? auth.apiKey?.id ?? 'sistema'
    );

    return NextResponse.json({ ok: true, configuracion: config });
  } catch (error) {
    console.error('[Hospitality] Error al guardar la configuración del registro de viajeros:', error);
    return NextResponse.json({ error: 'No se pudo guardar la configuración' }, { status: 500 });
  }
}

// DELETE /api/hospitality/compliance/config — retirar las credenciales guardadas.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    if (auth.user?.role?.nombre && !['Superadmin', 'Admin'].includes(auth.user.role.nombre)) {
      return NextResponse.json(
        { error: 'Solo la administración de la cuenta puede retirar las credenciales' },
        { status: 403 }
      );
    }

    const config = await borrarCredenciales(
      auth.tenant!.id,
      auth.user?.id ?? auth.apiKey?.id ?? 'sistema'
    );

    return NextResponse.json({ ok: true, configuracion: config });
  } catch (error) {
    console.error('[Hospitality] Error al retirar las credenciales del registro de viajeros:', error);
    return NextResponse.json({ error: 'No se pudieron retirar las credenciales' }, { status: 500 });
  }
}

// POST /api/hospitality/compliance/config — probar el ALCANCE del servicio.
//
// Comprueba que el endpoint del Ministerio responde (DNS, TLS, HTTP) sin enviar
// ninguna comunicación: la validación de credenciales exige el esquema oficial y
// llegar hasta aquí solo separa «el Ministerio no me responde» de «mi mensaje está
// mal», que son los dos fallos que se confunden.
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const cuerpo = await req.json().catch(() => null);
    const config = await leerConfig(auth.tenant!.id);
    const entorno = typeof cuerpo?.entorno === 'string' ? cuerpo.entorno : config?.entorno;

    const alcance = await probarAlcance(entorno);
    return NextResponse.json({ ok: alcance.alcanzable, alcance });
  } catch (error) {
    console.error('[Hospitality] Error al probar el alcance del servicio del Ministerio:', error);
    return NextResponse.json({ error: 'No se pudo probar la conexión' }, { status: 500 });
  }
}
