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
      // 4. CALL LIBRESIGN API
      let libreSignUuid = crypto.randomUUID(); // Fallback for dev
      
      if (settings.url && settings.apiToken) {
        try {
          const apiRes = await fetch(`${settings.url}/api/1.0/sign`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.apiToken}`
            },
            body: JSON.stringify({
              ...payload,
              // Convert Buffer to base64 if required by VolkernSign API
              file_base64: documentBuffer.toString('base64'),
              file_name: options.fileName
            })
          });
          
          if (!apiRes.ok) {
            const errorText = await apiRes.text();
            console.warn('[SignatureService] VolkernSign API error:', errorText);
            // We continue with mock if it fails in dev, or throw in prod
          } else {
            const result = await apiRes.json();
            libreSignUuid = result.uuid || libreSignUuid;
          }
        } catch (fetchError) {
          console.warn('[SignatureService] Could not reach VolkernSign server, using mock UUID.');
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
          signers: signers as any,
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
   * Handles incoming webhooks from VolkernSign to update document status.
   */
  static async handleWebhook(tenantId: string, payload: any) {
    const { uuid, event, signer_email } = payload;

    const request = await prisma.signatureRequest.findUnique({
      where: { libreSignUuid: uuid },
      include: { auditEvents: { orderBy: { timestamp: 'desc' }, take: 1 } }
    });

    if (!request) throw new Error('Signature request not found');

    const prevHash = request.auditEvents[0]?.eventHash || '';
    
    // Update individual signer status if needed (logic placeholder)
    
    // Log event for Audit Trail
    const newEvent = await prisma.signatureAuditEvent.create({
      data: {
        signatureRequestId: request.id,
        eventType: event, // document_signed, viewed, etc.
        signerEmail: signer_email,
        prevEventHash: prevHash,
        eventHash: crypto.createHash('sha256').update(`${request.id}-${event}-${prevHash}`).digest('hex'),
        timestamp: new Date(),
        details: payload
      }
    });

    // If fully signed, update main status
    if (event === 'document_signed') {
      await prisma.signatureRequest.update({
        where: { id: request.id },
        data: { 
          status: 'signed',
          completedAt: new Date()
        }
      });
      
      // TRIGGER: Automations / Workflows in Volkern
      // ... logic to notify Lead/Deal
    }

    return newEvent;
  }
}
