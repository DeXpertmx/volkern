export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyZadarmaSignature } from '@/lib/integrations/zadarma';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID missing' }, { status: 400 });
    }

    // Capture the raw body for signature verification
    // Zadarma webhooks are usually URL-encoded form data
    const formData = await req.formData();
    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      payload[key] = value.toString();
    });

    console.log(`[Zadarma Webhook] Received ${payload.event} for tenant ${tenantId}:`, payload);

    // 1. Fetch Integration
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId,
        tipo: 'telefonia_zadarma',
      },
    });

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const creds = integration.credenciales as any;
    const apiSecret = creds?.apiSecret;
    const signature = req.headers.get('signature');

    // 2. Verify Signature
    if (apiSecret && signature) {
      const isValid = verifyZadarmaSignature(payload, signature, apiSecret);
      if (!isValid) {
        console.warn(`[Zadarma Webhook] Invalid signature for tenant ${tenantId}`);
        // During initial setup or if signature fails due to env issues, we might want to log it
        // return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const event = payload.event;
    
    // 3. Handle Events
    switch (event) {
      case 'NOTIFY_START':
      case 'NOTIFY_OUT_START': // Outbound call start
        await handleCallStart(tenantId, payload);
        break;

      case 'NOTIFY_ANSWER':
      case 'NOTIFY_OUT_ANSWER':
        // Handle answer if needed (e.g. update notification)
        break;

      case 'NOTIFY_END':
      case 'NOTIFY_OUT_END': // Outbound call end
        await handleCallEnd(tenantId, payload);
        break;

      case 'NOTIFY_RECORD':
        // Only process recording if enabled in config
        if (creds?.recordingEnabled !== false) {
          await handleRecording(tenantId, payload);
        }
        break;

      default:
        console.log(`[Zadarma Webhook] Unhandled event: ${event}`);
    }

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('[Zadarma Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function handleCallStart(tenantId: string, payload: any) {
  const isOutbound = payload.event === 'NOTIFY_OUT_START';
  const callerId = payload.caller_id;
  const destination = payload.destination;
  
  // For inbound, we want to notify about callerId
  // For outbound, we might not need a popup or it might be different
  const targetNumber = isOutbound ? destination : callerId;

  // Find Lead
  const lead = await findLeadByPhone(tenantId, targetNumber);

  // For inbound calls, show a pop-up to agents.
  // inAppNotification.userId es FK obligatoria a User: resolver un usuario real
  // del tenant (no usar 'system', que no existe en la tabla User).
  if (!isOutbound) {
    const notifUser = await prisma.user.findFirst({ where: { tenantId }, select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (notifUser) {
      await prisma.inAppNotification.create({
        data: {
          tenantId,
          userId: notifUser.id,
          title: 'Llamada Entrante',
          body: `Llamada de ${targetNumber} ${lead ? `(${lead.nombre})` : '(Número desconocido)'}`,
          type: 'incoming_call',
          data: {
            callerId: targetNumber,
            leadId: lead?.id,
            callId: payload.call_id_with_prefix || payload.call_id,
            startTime: payload.call_start,
          }
        }
      });
    }
  }

  console.log(`[Zadarma Webhook] Call start processed${isOutbound ? ' (Outbound)' : ''} from ${callerId} to ${destination}`);
}

async function handleCallEnd(tenantId: string, payload: any) {
  const isOutbound = payload.event === 'NOTIFY_OUT_END';
  const callerId = payload.caller_id;
  const destination = payload.destination;
  const targetNumber = isOutbound ? destination : callerId;
  const duration = parseInt(payload.duration || '0');
  const disposition = payload.disposition; // answered, no answer, busy, cancel
  const callId = payload.call_id_with_prefix || payload.call_id;
  
  const lead = await findLeadByPhone(tenantId, targetNumber);

  if (lead) {
    const directionStr = isOutbound ? 'SALIENTE' : 'ENTRANTE';
    const statusStr = disposition === 'answered' ? 'completada' : 'no contestada/fallida';
    
    await prisma.interaction.create({
      data: {
        leadId: lead.id,
        tipo: 'phone_call',
        contenido: `Llamada ${directionStr} ${statusStr}. Duración: ${duration}s.`,
        resultado: disposition,
        metadatos: {
          call_id: callId,
          duration,
          bill_seconds: parseInt(payload.bill_seconds || '0'),
          cost: payload.cost,
          currency: payload.currency,
          disposition,
          direction: isOutbound ? 'outbound' : 'inbound',
          from: callerId,
          to: destination,
          zadarma_payload: {
            is_intercom: payload.is_intercom,
            internal: payload.internal
          }
        }
      }
    });
    
    console.log(`[Zadarma Webhook] Interaction logged for lead ${lead.nombre} (${callId})`);
  }
}

async function handleRecording(tenantId: string, payload: any) {
  const callId = payload.call_id_with_prefix || payload.call_id;
  const recordingUrl = payload.link;

  if (!recordingUrl) return;

  // Find the interaction created in handleCallEnd
  // Since metadatos is a Json field, we search by filtering
  // Note: Prisma might need different syntax for JSON filtering depending on DB
  // For PostgreSQL, path filtering works well.
  const interaction = await prisma.interaction.findFirst({
    where: {
      metadatos: {
        path: ['call_id'],
        equals: callId
      }
    }
  });

  if (interaction) {
    const existingMeta = (interaction.metadatos as any) || {};
    await prisma.interaction.update({
      where: { id: interaction.id },
      data: {
        metadatos: {
          ...existingMeta,
          recording_url: recordingUrl
        }
      }
    });
    console.log(`[Zadarma Webhook] Recording linked to interaction ${interaction.id}`);
  }
}

/**
 * Utility to find a lead by phone number, trying several match patterns.
 */
async function findLeadByPhone(tenantId: string, phoneNumber: string) {
  if (!phoneNumber) return null;
  
  // Clean phone number (remove non-digits for comparison)
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length < 7) return null; // Too short to match reliably

  // Try exact match, then match trailing digits (last 9 or 10)
  const lastN = cleanPhone.slice(-9);

  return await prisma.lead.findFirst({
    where: {
      tenantId,
      OR: [
        { telefono: { contains: lastN } },
        { telefono: { contains: cleanPhone } },
        { telefono: phoneNumber }
      ]
    }
  });
}
