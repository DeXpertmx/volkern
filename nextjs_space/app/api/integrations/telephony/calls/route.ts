export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status'); // all, answered, missed
    const skip = (page - 1) * limit;
    
    const tenantId = auth.tenant!.id;

    // Filter by type 'phone_call' and tenant
    const where: any = {
      lead: {
        tenantId: tenantId
      },
      tipo: 'phone_call',
    };

    if (status === 'answered') {
      where.resultado = 'answered';
    } else if (status === 'missed') {
      where.resultado = { not: 'answered' };
    }

    const [calls, total] = await Promise.all([
      prisma.interaction.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              nombre: true,
              telefono: true,
              email: true
            }
          },
          creador: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          fechaCreacion: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.interaction.count({ where })
    ]);

    return NextResponse.json({
      calls,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Telephony Calls] GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}, ['telephony:read']);
