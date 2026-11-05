export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { DEFAULT_TEMPLATES, seedDefaultTemplates } from '@/lib/contratos/plantillas-por-defecto';

/**
 * Actualiza las plantillas de sistema (esPorDefecto) que quedaron con el
 * clausulado anterior (sin placeholders) para que reciban las cláusulas
 * dinámicas actuales. No toca plantillas personalizadas del tenant.
 */
async function upgradeDefaultTemplates(tenantId: string) {
  try {
    const deSistema = await prisma.contratoTemplate.findMany({
      where: { tenantId, esPorDefecto: true },
    });
    for (const plantilla of deSistema) {
      // Solo actualizar si aún no trae placeholders (es la versión vieja)
      if (plantilla.clausulas && !plantilla.clausulas.includes('{{')) {
        const nueva = DEFAULT_TEMPLATES.find((t) => t.nombre === plantilla.nombre);
        if (nueva) {
          await prisma.contratoTemplate.update({
            where: { id: plantilla.id },
            data: {
              descripcion: nueva.descripcion,
              clausulas: nueva.clausulas,
              condicionesPago: nueva.condicionesPago,
            },
          });
        }
      }
    }
  } catch (error: any) {
    console.warn('No se pudieron actualizar las plantillas por defecto:', error.message);
  }
}

// GET /api/contratos/plantillas - Listar plantillas del tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Primera visita: sembrar las plantillas por defecto del sistema
    const existentes = await prisma.contratoTemplate.count({ where: { tenantId } });
    if (existentes === 0) {
      await seedDefaultTemplates(tenantId);
    } else {
      // Tenants ya existentes: actualizar las de sistema que quedaron viejas
      await upgradeDefaultTemplates(tenantId);
    }

    const plantillas = await prisma.contratoTemplate.findMany({
      where: { tenantId, activo: true },
      orderBy: [{ esPorDefecto: 'desc' }, { nombre: 'asc' }],
    });
    return NextResponse.json({ plantillas });
  } catch (error: any) {
    console.error('Error listando plantillas de contrato:', error.message);
    return NextResponse.json({ error: 'Error al listar plantillas' }, { status: 500 });
  }
}, ['contratos:read']);

// POST /api/contratos/plantillas - Crear plantilla
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    const nombre = (body.nombre || '').trim();
    if (!nombre) {
      return NextResponse.json({ error: 'El nombre de la plantilla es requerido' }, { status: 400 });
    }

    const plantilla = await prisma.contratoTemplate.create({
      data: {
        tenantId,
        nombre,
        tipo: body.tipo || 'servicio',
        descripcion: body.descripcion || null,
        clausulas: body.clausulas || null,
        condicionesPago: body.condicionesPago || null,
      },
    });

    return NextResponse.json({ plantilla }, { status: 201 });
  } catch (error: any) {
    console.error('Error creando plantilla de contrato:', error.message);
    return NextResponse.json({ error: 'Error al crear la plantilla' }, { status: 500 });
  }
}, ['contratos:write']);
