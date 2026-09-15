export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { bandejaDeRegistros, leerConfig } from '@/lib/hospitality/compliance-store';
import { ESTADOS_REGISTRO, FICHAS_ESTADO, type EstadoRegistro } from '@/lib/hospitality/compliance';
import { ENTORNOS, ESQUEMA_XML_DISPONIBLE, ENDPOINTS } from '@/lib/hospitality/ses-hospedajes/connector';

// GET /api/hospitality/compliance — la bandeja del registro de viajeros.
// Filtros: estado (uno de los siete), canal, q, desde, to (ISO), limite.
//
// Es solo lectura: el estado de cada reserva se calcula del derecho al revés
// (reserva + viajeros + registro guardado) y no se escribe nada. Crear el registro
// de una reserva es una acción, y las acciones van por POST.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);

    const estadoParam = searchParams.get('estado');
    const estado = ESTADOS_REGISTRO.includes(estadoParam as EstadoRegistro)
      ? (estadoParam as EstadoRegistro)
      : null;

    const desde = searchParams.get('desde');
    const hasta = searchParams.get('to');
    const limite = Number.parseInt(searchParams.get('limite') || '200', 10);

    const config = await leerConfig(tenantId);
    const datos = await bandejaDeRegistros(tenantId, {
      estado,
      canal: searchParams.get('canal'),
      texto: searchParams.get('q'),
      desde: desde ? new Date(desde) : null,
      hasta: hasta ? new Date(hasta) : null,
      limite: Number.isFinite(limite) ? limite : 200,
    });

    return NextResponse.json({
      filas: datos.filas,
      total: datos.total,
      conteo: datos.conteo,
      porcentajeEnviado: datos.porcentajeEnviado,
      estados: ESTADOS_REGISTRO.map((valor) => ({ valor, ...FICHAS_ESTADO[valor] })),
      configuracion: config,
      esquemaDisponible: ESQUEMA_XML_DISPONIBLE,
      entornos: ENTORNOS,
      endpoints: ENDPOINTS,
    });
  } catch (error) {
    console.error('[Hospitality] Error al leer la bandeja del registro de viajeros:', error);
    return NextResponse.json({ error: 'No se pudo leer el registro de viajeros' }, { status: 500 });
  }
}
