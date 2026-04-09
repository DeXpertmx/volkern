export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

/**
 * Unified API for Template Management (Emails & Documents)
 * GET /api/cms/templates?type=email|document
 * POST /api/cms/templates
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado - Sin sesión' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant asociado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'email'; // 'email' or 'document'
    const id = searchParams.get('id');

    if (id && id !== 'new') {
        if (type === 'email') {
            const template = await prisma.emailTemplate.findFirst({
                where: { id, tenantId: user.tenantId }
            });
            if (!template) return NextResponse.json({ error: 'Plantilla de email no encontrada' }, { status: 404 });
            return NextResponse.json(template);
        } else {
            const template = await prisma.contrato.findFirst({
                where: { id, tenantId: user.tenantId }
            });
            if (!template) return NextResponse.json({ error: 'Plantilla de documento no encontrada' }, { status: 404 });
            return NextResponse.json(template);
        }
    }

    if (type === 'email') {
      const templates = await prisma.emailTemplate.findMany({
        where: {
          OR: [
            { tenantId: user.tenantId },
            { esOficial: true }
          ]
        },
        orderBy: { fechaActualizacion: 'desc' }
      });
      return NextResponse.json({ templates });
    } else {
      const templates = await prisma.contrato.findMany({
        where: { tenantId: user.tenantId, estado: 'template' },
        orderBy: { fechaActualizacion: 'desc' }
      });
      return NextResponse.json({ templates });
    }
  } catch (error: any) {
    console.error('[CMS Templates] GET Error:', error);
    return NextResponse.json({ error: 'Error al obtener plantillas', details: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado - Sesión expirada' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
        return NextResponse.json({ error: 'No tienes permisos de tenant para guardar' }, { status: 403 });
    }

    const data = await request.json();
    const { type, nombre, projectData, html, css, id } = data;

    if (type === 'email') {
      if (id && id !== 'new') {
        // Update
        const updated = await prisma.emailTemplate.update({
          where: { id },
          data: {
            nombre,
            contenidoHTML: html,
            contenidoJSON: projectData as any,
            fechaActualizacion: new Date()
          }
        });
        return NextResponse.json(updated);
      } else {
        // Create
        const created = await prisma.emailTemplate.create({
          data: {
            tenantId: user.tenantId,
            nombre: nombre || 'Nueva Plantilla Email',
            asuntoPorDefecto: 'Nueva Campaña',
            contenidoHTML: html,
            contenidoJSON: projectData as any,
            creadoPor: user.id
          }
        });
        return NextResponse.json(created, { status: 201 });
      }
    } else if (type === 'document') {
        if (id && id !== 'new') {
            // Update Contract Template
            const updated = await prisma.contrato.update({
                where: { id },
                data: {
                    titulo: nombre,
                    clausulas: html,
                    templateData: projectData as any,
                    fechaActualizacion: new Date()
                }
            });
            return NextResponse.json(updated);
        } else {
            // Create Contract Template
            const created = await prisma.contrato.create({
                data: {
                    tenantId: user.tenantId,
                    titulo: nombre || 'Nueva Plantilla Documento',
                    numero: `TPL-${Date.now()}`,
                    estado: 'template',
                    clausulas: html,
                    templateData: projectData as any,
                    total: 0,
                    subtotal: 0,
                    creadoPorId: user.id
                }
            });
            return NextResponse.json(created, { status: 201 });
        }
    }

    return NextResponse.json({ error: 'Tipo de plantilla no válido' }, { status: 400 });
  } catch (error: any) {
    console.error('[CMS Templates] POST Error:', error);
    return NextResponse.json({ 
        error: 'Error al procesar plantilla en servidor', 
        details: error.message,
        code: error.code
    }, { status: 500 });
  }
}
