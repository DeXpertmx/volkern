import { NextRequest, NextResponse } from 'next/server';
import { SignatureService } from '@/lib/signatures/SignatureService';

/**
 * Public Webhook endpoint for VolkernSign callbacks.
 * This endpoint should be registered in each client's VolkernSign instance.
 */
export async function POST(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenantId parameter' }, { status: 400 });
    }

    // 1. Get raw body for signature verification (if needed)
    const payload = await req.json();

    // 2. Validate Tenant Settings and Webhook Secret (Conceptual)
    const settings = await SignatureService.getTenantSettings(tenantId);
    
    // TODO: Verify payload signature using settings.webhookSecret
    // (VolkernSign usually sends a header to verify the source)
    // const signature = req.headers.get('x-libresign-signature');
    // if (!verify(payload, signature, settings.webhookSecret)) { ... }

    // 3. Process the event
    const auditEvent = await SignatureService.handleWebhook(tenantId, payload);

    console.info(`[SignatureWebhook] Event ${payload.event} processed for tenant ${tenantId}`);

    return NextResponse.json({ 
      success: true, 
      eventId: auditEvent.id 
    });

  } catch (error: any) {
    console.error('[SignatureWebhook] Error processing webhook:', error.message);
    return NextResponse.json({ 
      error: 'Failed to process signature event', 
      details: error.message 
    }, { status: 500 });
  }
}
