export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '30'; // 1, 7, 30
    const tenantId = auth.tenant!.id;

    const ahora = new Date();
    const diasRange = parseInt(range);
    const haceX_Dias = subDays(ahora, diasRange);

    // Filter interactions of type 'phone_call'
    const interactions = await prisma.interaction.findMany({
      where: {
        lead: {
          tenantId: tenantId
        },
        tipo: 'phone_call',
        fechaCreacion: {
          gte: haceX_Dias
        }
      },
      select: {
        metadatos: true,
        resultado: true,
        fechaCreacion: true
      }
    });

    let incoming = 0;
    let outgoing = 0;
    let missed = 0;
    let totalDuration = 0;
    let answeredCount = 0;

    interactions.forEach((inter) => {
      const meta = inter.metadatos as any;
      const direction = meta?.direction || 'inbound';
      const disposition = meta?.disposition || inter.resultado;
      const duration = meta?.duration || 0;

      if (direction === 'inbound') {
        incoming++;
      } else {
        outgoing++;
      }

      if (disposition !== 'answered') {
        missed++;
      } else {
        answeredCount++;
        totalDuration += duration;
      }
    });

    const avgDuration = answeredCount > 0 ? Math.round(totalDuration / answeredCount) : 0;

    return NextResponse.json({
      total: interactions.length,
      incoming,
      outgoing,
      missed,
      avgDuration,
      answeredCount,
      range: diasRange
    });
  } catch (error) {
    console.error('[Telephony Stats] GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
