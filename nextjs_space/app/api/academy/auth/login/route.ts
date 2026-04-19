import { NextRequest, NextResponse } from 'next/server';
import { AcademyAuthService } from '@/lib/auth/academy-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const deviceInfo = request.headers.get('user-agent') || 'unknown';
    const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1';

    const result = await AcademyAuthService.login(email, password, deviceInfo, ipAddress);

    const response = NextResponse.json({ 
      success: true, 
      user: result.user 
    });

    // Set HttpOnly cookie for the academy token
    response.cookies.set('academy_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    });

    return response;
  } catch (error: any) {
    console.error('Academy login error:', error);
    return NextResponse.json({ error: error.message || 'Error en la autenticación' }, { status: 401 });
  }
}
