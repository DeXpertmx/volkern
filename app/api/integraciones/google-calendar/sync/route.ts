export const dynamic = 'force-dynamic';
// 📅 SINCRONIZACIÓN UNIDIRECCIONAL: Volkern → Google Calendar
// CORREGIDA: Solo sincroniza citas originadas en Volkern, evita duplicados

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { syncAllFutureCitas } from '@/lib/google-calendar';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any)?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    console.log(`📅 Iniciando sincronización manual Volkern → Google Calendar para usuario ${userId}`);

    const resultado = await syncAllFutureCitas(userId);

    console.log('✅ Sincronización completada:', resultado);

    return NextResponse.json({
      success: true,
      message: 'Sincronización completada',
      resultado: {
        total: resultado.total,
        creados: resultado.creados,
        actualizados: resultado.actualizados,
        omitidos: resultado.omitidos,
        errores: resultado.errores
      }
    });
  } catch (error: any) {
    console.error('❌ Error en sincronización manual:', error.message);
    return NextResponse.json({
      error: 'Error en sincronización',
      message: error.message
    }, { status: 500 });
  }
}
