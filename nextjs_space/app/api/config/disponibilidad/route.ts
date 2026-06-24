export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    let timezone = (auth.user as any).timezone || 'America/Mexico_City';

    const config = await prisma.configuracion.findMany({
      where: {
        tenantId,
        clave: { in: ['disponibilidad_horarios', 'timezone'] }
      }
    });

    let horarios = [
      { diaSemana: 0, activo: false, bloques: [] },
      { diaSemana: 1, activo: true, bloques: [{ inicio: '09:00', fin: '18:00' }] },
      { diaSemana: 2, activo: true, bloques: [{ inicio: '09:00', fin: '18:00' }] },
      { diaSemana: 3, activo: true, bloques: [{ inicio: '09:00', fin: '18:00' }] },
      { diaSemana: 4, activo: true, bloques: [{ inicio: '09:00', fin: '18:00' }] },
      { diaSemana: 5, activo: true, bloques: [{ inicio: '09:00', fin: '18:00' }] },
      { diaSemana: 6, activo: false, bloques: [] },
    ];

    const horariosConfig = config.find(c => c.clave === 'disponibilidad_horarios');
    if (horariosConfig?.valor) {
      try {
        const parsed = JSON.parse(horariosConfig.valor);
        if (parsed.dias && Array.isArray(parsed.dias)) {
          horarios = parsed.dias.map((d: any) => ({
            diaSemana: d.diaSemana,
            activo: d.activo,
            bloques: d.bloques || [{ inicio: '09:00', fin: '18:00' }]
          }));
        }
      } catch (e) {
        console.error('Error parsing horarios config:', e);
      }
    }

    const tzConfig = config.find(c => c.clave === 'timezone');
    if (tzConfig?.valor) {
      timezone = tzConfig.valor;
    }

    return NextResponse.json({ horarios, timezone });
  } catch (error: any) {
    console.error('Error fetching disponibilidad config:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración de disponibilidad' },
      { status: 500 }
    )
  }
}, ['config:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    const { timezone, horarios } = body;

    if (horarios) {
      const horariosData = JSON.stringify({
        dias: horarios.map((h: any) => ({
          diaSemana: h.diaSemana,
          activo: h.activo,
          bloques: h.bloques || [{ inicio: '09:00', fin: '18:00' }]
        }))
      });

      await prisma.configuracion.upsert({
        where: { tenantId_clave: { tenantId, clave: 'disponibilidad_horarios' } },
        update: { valor: horariosData },
        create: { tenantId, clave: 'disponibilidad_horarios', valor: horariosData }
      });
    }

    if (timezone) {
      await prisma.configuracion.upsert({
        where: { tenantId_clave: { tenantId, clave: 'timezone' } },
        update: { valor: timezone },
        create: { tenantId, clave: 'timezone', valor: timezone }
      });

      await prisma.user.update({
        where: { id: auth.user!.id },
        data: { timezone }
      });
    }

    return NextResponse.json({ success: true, message: 'Configuración guardada' });
  } catch (error: any) {
    console.error('Error saving disponibilidad config:', error);
    return NextResponse.json(
      { error: 'Error al guardar configuración' },
      { status: 500 }
    )
  }
}, ['config:write'])