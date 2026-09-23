export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/reviews/import — CSV de reseñas históricas del canal.
 *
 * La web pública no arranca vacía: el hotel importa el CSV de reseñas de su
 * OTA (Booking.com, Airbnb…) y esas reseñas nacen PUBLICADA — ya pasaron el
 * filtro real: el canal las mostró al público. El módulo puro
 * (`resenas-import.ts`) parsea, valida fila a fila y calcula la huella
 * sha256: importar el mismo CSV dos veces no duplica reseñas
 * (skipDuplicates sobre `huellaImport`).
 *
 * La propiedad es REQUERIDA: una reseña histórica es de una propiedad concreta
 * — el canal las lista por alojamiento y la web las pinta por propiedad.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { parseImportResenas } from '@/lib/hospitality/resenas-import';

const LIMITE_FILAS = 2000;

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.gestionar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => null);
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId.trim() : '';
    const csv = typeof body?.csv === 'string' ? body.csv : '';
    if (!propertyId || !csv.trim()) {
      return NextResponse.json(
        { error: 'Se requieren propertyId y csv (contenido del archivo)' },
        { status: 400 },
      );
    }

    // La propiedad existe y es DEL tenant: sin esto, un id mal copiado crearía
    // reseñas huérfanas (o peores, de otro hotel).
    const propiedad = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true, nombre: true },
    });
    if (!propiedad) {
      return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });
    }

    const parseado = parseImportResenas(csv);
    if (!parseado.ok) {
      return NextResponse.json({ error: parseado.error }, { status: 400 });
    }
    if (parseado.filas.length > LIMITE_FILAS) {
      return NextResponse.json(
        { error: `El CSV trae ${parseado.filas.length} reseñas: el límite por importación es ${LIMITE_FILAS}` },
        { status: 413 },
      );
    }
    if (parseado.filas.length === 0) {
      return NextResponse.json(
        { error: 'El CSV no trae reseñas válidas', errores: parseado.errores },
        { status: 400 },
      );
    }

    const resultado = await prisma.hospitalityReview.createMany({
      data: parseado.filas.map((f) => ({
        tenantId,
        propertyId,
        origen: 'importada',
        fechaEstancia: new Date(`${f.fechaEstancia}T12:00:00Z`),
        huellaImport: f.huella,
        canal: f.canal,
        estado: 'publicada',
        puntuacion: f.puntuacion,
        comentario: f.comentario || null,
        nombreHuesped: f.nombreHuesped,
        respuestaHotel: f.respuestaHotel || null,
      })),
      skipDuplicates: true,
    });

    // El conteo de duplicados es real: filas válidas menos filas creadas
    // (createMany no las cuenta; la huella única las rechazó en silencio).
    const duplicadas = parseado.filas.length - resultado.count;

    // Trazabilidad de la importación: qué se trajo, de qué propiedad y cuánto.
    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_reviews_import',
      'property',
      propiedad.id,
      `Importadas ${resultado.count} reseñas históricas (de ${parseado.filas.length} filas; ${duplicadas} duplicadas, ${parseado.errores.length} con error)`,
      null,
      { propertyId: propiedad.id, creadas: resultado.count, duplicadas, errores: parseado.errores.length },
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      import: {
        creadas: resultado.count,
        duplicadas,
        errores: parseado.errores,
        total: parseado.filas.length,
      },
    });
  } catch (error) {
    console.error('[Hospitality Reviews] Error importando reseñas:', error);
    return NextResponse.json({ error: 'Error al importar las reseñas' }, { status: 500 });
  }
}
