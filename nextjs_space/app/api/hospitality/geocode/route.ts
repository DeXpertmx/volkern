export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { buscarDireccion } from '@/lib/hospitality/geocoding';

/**
 * GET /api/hospitality/geocode?q=<dirección>
 *
 * Geocoding del editor de propiedades (sección Ubicación): delega en Nominatim
 * DESDE EL SERVIDOR (la política de uso exige User-Agent propio y un uso
 * discreto; también evita exponer la dependencia externa al navegador) y
 * devuelve resultados normalizados. Misma autenticación y permiso de lectura
 * que el resto de rutas de hospitality.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const consulta = (req.nextUrl.searchParams.get('q') || '').trim();
    if (consulta.length < 4) {
      return NextResponse.json(
        { error: 'Escribe al menos 4 caracteres de la dirección' },
        { status: 400 }
      );
    }

    const resultados = await buscarDireccion(consulta);
    return NextResponse.json({ resultados });
  } catch (error) {
    console.error('Error geocodificando dirección:', error);
    return NextResponse.json({ error: 'No se pudo consultar el geocoder' }, { status: 502 });
  }
}
