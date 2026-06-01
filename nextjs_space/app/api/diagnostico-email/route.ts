export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, any> = {};
  
  // 1. Check if RESEND_API_KEY is set
  const apiKey = process.env.RESEND_API_KEY;
  results.hasApiKey = !!apiKey;
  results.apiKeyPrefix = apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET';
  
  // 2. Try to send a test email
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Volkern <noreply@admin.volkern.app>',
        to: ['bruno.hess@dimensionexpert.com'],
        subject: 'Test diagnóstico Volkern',
        html: '<p>Si ves esto, Resend funciona desde Vercel</p>',
      }),
    });
    
    const responseData = await response.json();
    results.resendStatus = response.status;
    results.resendResponse = responseData;
    results.resendOk = response.ok;
  } catch (error: any) {
    results.resendError = error.message;
    results.resendStack = error.stack?.substring(0, 200);
  }
  
  // 3. Check Resend domains
  try {
    const domainsResponse = await fetch('https://api.resend.com/domains', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    const domainsData = await domainsResponse.json();
    results.domains = (domainsData.data || []).map((d: any) => ({
      name: d.name,
      status: d.status,
    }));
  } catch (error: any) {
    results.domainsError = error.message;
  }

  return NextResponse.json(results);
}
