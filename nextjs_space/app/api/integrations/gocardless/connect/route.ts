import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const GOCARDLESS_PARTNER_ID = 'AP01KN49CNA5DMX5E80N95A98VFC';
const GOCARDLESS_CLIENT_ID = 'ZLJoa6pYTjWeup3H9U6tV7DLlMG0VqD9GOa3tuZ0yNU6nBbjUG7jI5ncBKSmVloY';

/**
 * Inicia el flujo OAuth de GoCardless Connect
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.redirect(new URL('/auth/login', process.env.NEXTAUTH_URL || 'https://volkern.app'));
    }

    const { searchParams } = new URL(request.url);
    const environment = searchParams.get('env') || 'sandbox'; // default sandbox for safety

    // Obtener el tenant y usuario
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { 
        tenantId: true, 
        email: true,
        tenant: {
          select: { nombre: true }
        }
      }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 403 });
    }

    // URL de GoCardless para autorización (Subdominio connect para Partners)
    const baseUrl = environment === 'live' 
      ? 'https://connect.gocardless.com/oauth/authorize' 
      : 'https://connect-sandbox.gocardless.com/oauth/authorize';

    const redirectUri = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/integrations/gocardless/callback`;

    const oauthParams = new URLSearchParams({
      client_id: GOCARDLESS_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'read_write',
      state: JSON.stringify({ tenantId: user.tenantId, environment }),
      // Prefill data for UX
      'prefill[email]': user.email || '',
      'prefill[organisation_name]': user.tenant?.nombre || '',
    });

    return NextResponse.redirect(`${baseUrl}?${oauthParams.toString()}`);
  } catch (error) {
    console.error('[GoCardless Connect] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
