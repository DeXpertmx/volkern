import { NextRequest, NextResponse } from 'next/server';
import { AcademyAuthService } from '@/lib/auth/academy-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('academy_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const session = await AcademyAuthService.validateToken(token);

    if (!session) {
      return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: 'Error al validar sesión' }, { status: 500 });
  }
}
