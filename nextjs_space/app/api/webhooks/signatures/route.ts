export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { SignatureService } from '@/lib/signatures/SignatureService';

/**
 * Public Webhook endpoint for VolkernSign callbacks.
 * This endpoint should be registered in each client's VolkernSign instance.
 *
 * Seguridad: verifica la firma HMAC-SHA256 del body crudo usando el
 * `webhookSecret` del tenant (comparación en tiempo constante). Cabeceras
 * aceptadas (por orden): `x-libresign-signature`, `x-signature`,
 * `x-hub-signature-256` (formato `sha256=<hex>`).
 *
 * Si la instancia LibreSign del tenant no firma sus webhooks, el admin puede
 * marcar `webhookSignatureOptional: true` en `ClientSignatureSettings.settings`
 * para aceptar peticiones sin firma (con warning en logs). Por defecto la
 * verificación es ESTRICTA: petición sin firma o con firma inválida → 401.
 */
export async function POST(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenantId parameter' }, { status: 400 });
    }

    // 1. Detectar el formato del body ANTES de leerlo (evita consumir el stream dos veces)
    const contentType = req.headers.get('content-type') || '';
    const isNativeMultipart = contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded');

    // 2. Validar Tenant Settings y obtener el webhookSecret descifrado
    const settings = await SignatureService.getTenantSettings(tenantId);

    // 3. Verificar firma HMAC-SHA256 (x-libresign-signature | x-signature | x-hub-signature-256)
    // NOTA: LibreSign envía el webhook como multipart/form-data SIN firma HMAC
    // (protocolo nativo). La verificación estricta aplica solo al formato JSON
    // interno de Volkern; para multipart (LibreSign real) se acepta como protocolo
    // nativo, avisando en logs. El opt-out webhookSignatureOptional sigue
    // disponible para instancias que no firmen ni siquiera en JSON.
    const signatureHeader =
      req.headers.get('x-libresign-signature') ||
      req.headers.get('x-signature') ||
      req.headers.get('x-hub-signature-256');

    // Opt-out por tenant: aceptar webhooks sin firma.
    const signatureOptional = !!(settings.settings as any)?.webhookSignatureOptional;

    // 4. Procesar el evento según el formato
    let payload: any;
    if (isNativeMultipart) {
      // Formato nativo de LibreSign: no firma los webhooks (multipart con uuid, status, file).
      if (signatureHeader && !SignatureService.verifyWebhookSignature(await req.text(), signatureHeader, settings.webhookSecret)) {
        console.warn(`[SignatureWebhook] Firma inválida rechazada para tenant ${tenantId}`);
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
      console.info(`[SignatureWebhook] Webhook multipart nativo aceptado para tenant ${tenantId}`);
      try {
        const formData = await req.formData();
        payload = {
          uuid: formData.get('uuid'),
          status: formData.get('status'),
          signer_email: formData.get('signer_email')
        };
      } catch {
        return NextResponse.json({ error: 'Invalid form body' }, { status: 400 });
      }
    } else {
      // Formato JSON interno de Volkern: verificación HMAC estricta.
      const rawBody = await req.text();
      if (!rawBody) {
        return NextResponse.json({ error: 'Empty body' }, { status: 400 });
      }
      if (!signatureHeader) {
        if (signatureOptional) {
          console.warn(`[SignatureWebhook] Petición SIN firma aceptada (modo opcional) para tenant ${tenantId}`);
        } else {
          console.warn(`[SignatureWebhook] Firma faltante rechazada para tenant ${tenantId}`);
          return NextResponse.json(
            { error: 'Missing signature header (x-libresign-signature)' },
            { status: 401 }
          );
        }
      } else if (!SignatureService.verifyWebhookSignature(rawBody, signatureHeader, settings.webhookSecret)) {
        console.warn(`[SignatureWebhook] Firma inválida rechazada para tenant ${tenantId}`);
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    const auditEvent = await SignatureService.handleWebhook(tenantId, payload);

    console.info(`[SignatureWebhook] Event ${payload?.event || payload?.status} processed for tenant ${tenantId}`);

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
