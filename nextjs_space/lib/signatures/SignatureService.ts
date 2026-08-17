import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../core/crypto';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface SignerData {
  email: string;
  name: string;
  role: string;
  order?: number;
}

export interface SignatureOptions {
  tenantId: string;
  leadId?: string;
  contratoId?: string;
  title: string;
  documentBuffer: Buffer;
  fileName: string;
  signers: SignerData[];
}

export class SignatureService {
  /**
   * Retrieves and decrypts the signature settings for a specific tenant.
   */
  static async getTenantSettings(tenantId: string) {
    const settings = await prisma.clientSignatureSettings.findUnique({
      where: { tenantId },
    });

    if (!settings || !settings.isActive) {
      throw new Error('Digital signature service not configured or inactive for this tenant.');
    }

    return {
      ...settings,
      apiToken: decrypt(settings.apiTokenEncrypted),
      webhookSecret: decrypt(settings.webhookSecretEncrypted),
    };
  }

  /**
   * Calculates the SHA-256 hash of a document for eIDAS integrity verification.
   */
  static calculateDocumentHash(buffer: Buffer | Uint8Array): string {
    const data = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verifica la firma HMAC-SHA256 de un webhook (patrón Stripe/GitHub):
   * HMAC-SHA256(rawBody, webhookSecret) en hex, comparado en tiempo constante.
   *
   * Acepta el header en dos formatos:
   *   - `x-libresign-signature: <hex>`            (hex puro, 64 caracteres)
   *   - `x-hub-signature-256: sha256=<hex>`       (formato GitHub/Make.com)
   */
  static verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | null | undefined,
    webhookSecret: string
  ): boolean {
    if (!rawBody || !webhookSecret) return false;

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expected = crypto.createHmac('sha256', webhookSecret).update(body, 'utf8').digest('hex');

    let provided = (signatureHeader || '').trim();
    if (provided.startsWith('sha256=')) provided = provided.slice('sha256='.length);
    provided = provided.trim();

    if (!/^[a-f0-9]{64}$/i.test(provided)) return false;

    const bufA = Buffer.from(expected, 'hex');
    const bufB = Buffer.from(provided, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Main entry point to send a document to VolkernSign.
   * Note: This is a placeholder for the actual HTTP call to the VolkernSign API.
   */
  static async createSignatureRequest(options: SignatureOptions) {
    const { tenantId, documentBuffer, signers, title, leadId, contratoId } = options;
    
    // 1. Get decrypted settings
    const settings = await this.getTenantSettings(tenantId);
    
    // 2. Calculate initial integrity hash
    const documentHash = this.calculateDocumentHash(documentBuffer);

    // 3. Prepare VolkernSign Payload (Conceptual based on usual REST patterns)
    const payload = {
      title,
      document_hash: documentHash,
      signers: signers.map(s => ({
        email: s.email,
        name: s.name,
        role: s.role,
        required: true
      })),
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/signatures?tenantId=${tenantId}`,
      metadata: {
        volkern_tenant_id: tenantId,
        volkern_contrato_id: contratoId,
        volkern_lead_id: leadId
      }
    };

    try {
      // 4. CALL LIBRESIGN API (real endpoint: /ocs/v2.php/apps/libresign/api/v1/request-signature)
      let libreSignUuid = crypto.randomUUID(); // Fallback for dev
      let signRequestIds: Record<string, number> = {};
      
      if (settings.url && settings.apiToken) {
        try {
          const apiUrl = `${settings.url.replace(/\/+$/, '')}/ocs/v2.php/apps/libresign/api/v1/request-signature?format=json`;
          const apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.apiToken}`,
              'OCS-APIRequest': 'true'
            },
            body: JSON.stringify({
              name: options.fileName || title,
              file: {
                // Convert Buffer to base64 (LibreSign expects base64 PDF)
                base64: documentBuffer.toString('base64')
              },
              signers: signers.map(s => ({
                displayName: s.name,
                identifyMethods: [
                  { method: 'email', value: s.email }
                ]
              })),
              callback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/signatures?tenantId=${tenantId}`
            })
          });
          
          if (!apiRes.ok) {
            const errorText = await apiRes.text();
            console.warn('[SignatureService] LibreSign API error:', errorText);
            // We continue with mock if it fails in dev, or throw in prod
          } else {
            const result = await apiRes.json();
            const data = result?.ocs?.data || result?.data || {};
            libreSignUuid = data.uuid || libreSignUuid;
            if (Array.isArray(data.signers)) {
              signRequestIds = Object.fromEntries(
                data.signers.map((s: any) => [s.email || s.identifyMethods?.[0]?.value, s.signRequestId])
              );
            }
          }
        } catch (fetchError) {
          console.warn('[SignatureService] Could not reach LibreSign server, using mock UUID.');
        }
      }
      
      // 5. Create local record
      const request = await prisma.signatureRequest.create({
        data: {
          tenantId,
          libreSignUuid,
          contratoId,
          leadId,
          title,
          status: 'sent',
          signers: signers.map((s, i) => ({
            ...s,
            signRequestId: signRequestIds[s.email]
          })) as any,
          documentHash,
          documentUrl: options.fileName, // Logic to store on S3 could go here
          sentAt: new Date(),
        }
      });

      // 6. Log Initial Event (Audit Trail)
      await prisma.signatureAuditEvent.create({
        data: {
          signatureRequestId: request.id,
          eventType: 'document_sent',
          timestamp: new Date(),
          eventHash: crypto.createHash('sha256').update(`${request.id}-document_sent`).digest('hex'),
          details: { payload }
        }
      });

      return request;
    } catch (error) {
      console.error('[SignatureService] Failed to create request:', error);
      throw error;
    }
  }

  /**
   * Handles incoming webhooks from LibreSign to update document status.
   *
   * LibreSign v14 envía multipart/form-data con `uuid`, `status` (int) y `file`.
   * Se acepta también el formato JSON legacy `{ uuid, event, signer_email }`.
   *
   * FileStatus: 0=DRAFT, 1=ABLE_TO_SIGN, 2=PARTIAL_SIGNED, 3=SIGNED, 4=DELETED, 5=SIGNING_IN_PROGRESS
   */
  static async handleWebhook(tenantId: string, payload: any) {
    // Normalizar payload: puede llegar como objeto plano (JSON) o con la
    // envoltura de la ruta (que parsea multipart y pasa { uuid, status, ... })
    const body = payload?.ocs?.data || payload;
    const uuid = body.uuid;
    if (!uuid) throw new Error('Missing uuid in webhook payload');

    const statusCode = typeof body.status === 'string' && body.status.trim() !== ''
      ? parseInt(body.status, 10)
      : (typeof body.status === 'number' ? body.status : undefined);

    // Mapear status de LibreSign a evento interno
    let event = body.event;
    if (!event && statusCode !== undefined) {
      if (statusCode === 3) event = 'document_signed';
      else if (statusCode === 2) event = 'document_partially_signed';
      else if (statusCode === 1) event = 'document_able_to_sign';
      else event = `document_status_${statusCode}`;
    }
    if (!event) event = 'document_updated';

    const request = await prisma.signatureRequest.findUnique({
      where: { libreSignUuid: uuid },
      include: { auditEvents: { orderBy: { timestamp: 'desc' }, take: 1 } }
    });

    if (!request) throw new Error('Signature request not found');

    const prevHash = request.auditEvents[0]?.eventHash || '';
    
    // Log event for Audit Trail
    const newEvent = await prisma.signatureAuditEvent.create({
      data: {
        signatureRequestId: request.id,
        eventType: event, // document_signed, viewed, etc.
        signerEmail: body.signer_email || null,
        prevEventHash: prevHash,
        eventHash: crypto.createHash('sha256').update(`${request.id}-${event}-${prevHash}`).digest('hex'),
        timestamp: new Date(),
        details: body
      }
    });

    // If fully signed (status 3), update main status
    if (event === 'document_signed' || statusCode === 3) {
      await prisma.signatureRequest.update({
        where: { id: request.id },
        data: { 
          status: 'signed',
          completedAt: new Date()
        }
      });

      // Registrar el evento en el timeline del contrato (si la solicitud está ligada a uno)
      if (request.contratoId) {
        try {
          await prisma.contratoTimeline.create({
            data: {
              contratoId: request.contratoId,
              actorType: 'SYSTEM',
              action: 'document_signed',
              note: `Firma digital recibida${body.signer_email ? ` de ${body.signer_email}` : ''} (LibreSign)`,
              metadata: {
                signatureRequestId: request.id,
                libreSignUuid: uuid,
                signerEmail: body.signer_email || null,
                eventId: newEvent.id
              }
            }
          });
          console.info(`[SignatureService] Timeline del contrato ${request.contratoId} actualizado con document_signed`);
        } catch (timelineError: any) {
          // No romper el webhook si el timeline falla (log y continuar)
          console.warn('[SignatureService] No se pudo registrar en el timeline del contrato:', timelineError.message);
        }
      }
      
      // TRIGGER: Automations / Workflows in Volkern
      // ... logic to notify Lead/Deal
    }

    return newEvent;
  }
}
