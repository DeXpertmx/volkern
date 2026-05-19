export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    // Obtener timezone del usuario
    let timezone = auth.user!.timezone || 'America/Mexico_City';

    // Obtener configuración de disponibilidad del tenant
    const config = await prisma.configuracion.findMany({
      where: {
        tenantId,
        clave: { in: ['disponibilidad_horarios', 'disponibilidad_dias', 'timezone'] }
      }
    });

    // Parsear horarios si existen
    let horarios = {
      timezone,
      diasLaborales: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
      horaInicio: '09:00',
      horaFin: '18:00',
      duracionMinima: 30,
      intervalMinutes: 30,
    };

    const horariosConfig = config.find(c => c.clave === 'disponibilidad_horarios');
    if (horariosConfig?.valor) {
      try {
        horarios = { ...horarios, ...JSON.parse(horariosConfig.valor) };
      } catch (e) {
        console.error('Error parsing horarios config:', e);
      }
    }

    // Obtener timezone del usuario si está definido
    const tzConfig = config.find(c => c.clave === 'timezone');
    if (tzConfig?.valor) {
      horarios.timezone = tzConfig.valor;
    }

    return NextResponse.json(horarios);
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
    const { timezone, diasLaborales, horaInicio, horaFin, duracionMinima, intervalMinutes } = body;

    // Guardar configuración de horarios
    const horariosData = JSON.stringify({
      diasLaborales: diasLaborales || ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
      horaInicio: horaInicio || '09:00',
      horaFin: horaFin || '18:00',
      duracionMinima: duracionMinima || 30,
      intervalMinutes: intervalMinutes || 30,
    });

    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'disponibilidad_horarios' } },
      update: { valor: horariosData },
      create: { tenantId, clave: 'disponibilidad_horarios', valor: horariosData }
    });

    // Guardar timezone si se proporciona
    if (timezone) {
      await prisma.configuracion.upsert({
        where: { tenantId_clave: { tenantId, clave: 'timezone' } },
        update: { valor: timezone },
        create: { tenantId, clave: 'timezone', valor: timezone }
      });

      // Actualizar también en el perfil del usuario
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