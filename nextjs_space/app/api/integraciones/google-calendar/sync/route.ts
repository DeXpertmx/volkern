export const dynamic = 'force-dynamic';
// 📅 SINCRONIZACIÓN BIDIRECCIONAL: Volkern ⇄ Google Calendar
// - Volkern → Google: Solo sincroniza citas originadas en Volkern, evita duplicados
// - Google → Volkern: Trae cambios desde Google Calendar usando syncToken

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { syncAllFutureCitas, syncFromGoogleToVolkern } from '@/lib/google-calendar';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any)?.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    console.log(`📅 Iniciando sincronización manual Volkern ⇄ Google Calendar para usuario ${userId}`);

    // PASO 1: Volkern → Google
    console.log('  📤 Sincronizando Volkern → Google Calendar...');
    const resultado = await syncAllFutureCitas(userId);
    console.log(`  ✅ ${resultado.creados + resultado.actualizados}/${resultado.total} citas sincronizadas a Google`);

    // PASO 2: Google → Volkern
    console.log('  📥 Sincronizando Google Calendar → Volkern...');
    await syncFromGoogleToVolkern(userId, false);
    console.log('  ✅ Eventos importados desde Google Calendar');

    console.log('✅ Sincronización bidireccional completada:', resultado);

    return NextResponse.json({
      success: true,
      message: 'Sincronización bidireccional completada',
      resultado: {
        total: resultado.total,
        creados: resultado.creados,
        actualizados: resultado.actualizados,
        omitidos: resultado.omitidos,
        errores: resultado.errores
      }
    });
  } catch (error: any) {
    console.error('❌ Error en sincronización bidireccional:', error.message);
    return NextResponse.json({
      error: 'Error en sincronización bidireccional',
      message: error.message
    }, { status: 500 });
  }
}
