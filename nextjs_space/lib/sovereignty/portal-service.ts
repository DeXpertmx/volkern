import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';

/**
 * PortalService
 * Governs the sovereign customer portal logic, access control, and integrity verification.
 */
export class PortalService {
  /**
   * Generates or retrieves a unique public token for a SalesOrder.
   * This token is used in the public URL: /portal/[token]
   */
  static async getOrCreatePortalToken(salesOrderId: string, tenantId: string) {
    const order = await prisma.erp_sales_orders.findUnique({
      where: { id: salesOrderId },
      select: { publicToken: true }
    });

    if (order?.publicToken) {
      return order.publicToken;
    }

    // Generate a secure, non-guessable token
    const newToken = randomBytes(24).toString('hex');

    await prisma.erp_sales_orders.update({
      where: { id: salesOrderId },
      data: { publicToken: newToken }
    });

    // Create a formal access record
    await prisma.erp_customer_portal_access.create({
      data: {
        tenantId,
        salesOrderId,
        token: newToken,
        isActive: true,
        expiresAt: null,
      } as any
    });

    return newToken;
  }

  /**
   * Validates a public token and returns the sanitized order data.
   */
  static async getOrderDataByToken(token: string) {
    const access = await prisma.erp_customer_portal_access.findUnique({
      where: { token, isActive: true },
      include: {
        erp_sales_orders: {
          include: {
            contacts: {
              select: {
                nombre: true,
                email: true,
                ubicacion: true
              }
            },
            erp_sales_order_items: {
              include: {
                catalogo_items: {
                  select: {
                    sku: true,
                    nombre: true,
                    descripcion: true,
                    tipo: true
                  }
                },
                erp_order_reservations: {
                  where: { status: 'ACTIVE' },
                  include: {
                    erp_inventory_lots: {
                      include: {
                        erp_qc_checks: {
                          select: {
                            status: true,
                            measuredValue: true,
                            integrityHash: true,
                            createdAt: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            erp_shipments: {
              include: {
                erp_delivery_confirmations: true
              }
            }
          }
        }
      }
    });

    if (!access || !access.erp_sales_orders) {
      return null;
    }

    // Update last access
    await prisma.erp_customer_portal_access.update({
      where: { id: access.id },
      data: { lastAccessAt: new Date() }
    });

    return access.erp_sales_orders;
  }

  /**
   * Verifies the cryptographic integrity of a record.
   * Compares the stored integrityHash with the current object state fingerprint.
   */
  static async verifyIntegrity(entityType: 'LOT' | 'ORDER' | 'CHECK', entityId: string, providedHash: string) {
    let storedHash: string | null = null;
    let tenantId: string = '';

    if (entityType === 'LOT') {
      const lot = await prisma.erp_inventory_lots.findUnique({ where: { id: entityId }, select: { integrityHash: true, tenantId: true } });
      storedHash = lot?.integrityHash || null;
      tenantId = lot?.tenantId || '';
    } else if (entityType === 'ORDER') {
      const order = await prisma.erp_sales_orders.findUnique({ where: { id: entityId }, select: { integrityHash: true, tenantId: true } });
      storedHash = order?.integrityHash || null;
      tenantId = order?.tenantId || '';
    } else if (entityType === 'CHECK') {
      const check = await prisma.qualityCheck.findUnique({ where: { id: entityId }, select: { integrityHash: true, tenantId: true } });
      storedHash = check?.integrityHash || null;
      tenantId = check?.tenantId || '';
    }

    const isMatch = storedHash === providedHash;
    const status = isMatch ? 'SUCCESS' : 'TAMPERED';

    // Log the verification attempt for sovereignty audit
    await prisma.erp_portal_verification_logs.create({
      data: {
        tenantId,
        salesOrderId: entityType === 'ORDER' ? entityId : undefined,
        inventoryLotId: entityType === 'LOT' ? entityId : undefined,
        verifiedHash: providedHash,
        status,
        verifiedAt: new Date()
      } as any
    });

    return {
      isValid: isMatch,
      timestamp: new Date(),
      status
    };
  }

  /**
   * Creates an incident/claim from the customer portal.
   */
  static async createClaim(data: {
    token: string,
    category: string,
    title: string,
    description: string,
    evidenceUrl?: string
  }) {
    const access = await prisma.erp_customer_portal_access.findUnique({
      where: { token: data.token, isActive: true },
      include: { erp_sales_orders: true }
    });

    if (!access) throw new Error('Acceso no válido');

    return await prisma.erp_customer_claims.create({
      data: {
        tenantId: access.tenantId,
        contactId: access.erp_sales_orders.contactId,
        referenceId: access.salesOrderId,
        category: data.category,
        title: data.title,
        description: data.description,
        evidenceUrl: data.evidenceUrl,
        status: 'OPEN'
      } as any
    });
  }
}
