export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/production/bom - Listar recetas (Bill of Materials)
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const boms = await prisma.billOfMaterials.findMany({
      where: {
        tenantId: tenantId,
        isActive: true,
      },
      include: {
        catalogoItem: {
          select: {
            id: true,
            nombre: true,
            sku: true,
          }
        },
        components: {
          include: {
            component: {
              select: {
                id: true,
                nombre: true,
                sku: true,
                unidad: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(boms);
  } catch (error) {
    console.error('Error fetching BoMs:', error);
    return NextResponse.json({ error: 'Error al cargar recetas' }, { status: 500 });
  }
}, ['erp:read']);
