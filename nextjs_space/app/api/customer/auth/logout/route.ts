import { NextRequest, NextResponse } from 'next/server';
import { CustomerAuthService } from '@/lib/auth/customer-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/auth/logout
 * Logs out the customer and revokes the session.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('customer_token')?.value;

  if (token) {
    await CustomerAuthService.logout(token);
  }

  const response = NextResponse.json({ success: true, message: 'Sesión cerrada' });
  
  // Clear the cookie
  response.cookies.set('customer_token', '', { 
    maxAge: 0,
    path: '/'
  });

  return response;
}
