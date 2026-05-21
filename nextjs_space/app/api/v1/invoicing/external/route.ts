export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { InvoicingService } from '@/lib/invoicing-service';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { leadId, contactId, amount, currency, description, items, dueDate } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'amount debe ser un número positivo' }, { status: 400 });
    }

    if (!leadId && !contactId) {
      return NextResponse.json({ error: 'leadId o contactId es requerido' }, { status: 400 });
    }

    const tenantId = auth.tenant!.id;

    // Auto-configurar mock_billing si el tenant no tiene ninguna integración activa
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        tenantId,
        conectado: true,
        activo: true,
      }
    });

    if (!existingIntegration) {
      await prisma.integration.upsert({
        where: { tenantId_tipo: { tenantId, tipo: 'mock_billing' } },
        update: { conectado: true, activo: true },
        create: {
          tenantId,
          tipo: 'mock_billing',
          nombre: 'Facturación Volkern (Veri*factu)',
          conectado: true,
          activo: true,
          credenciales: {},
        }
      });
    }

    const invoice = await InvoicingService.createInvoice({
      tenantId,
      leadId: leadId || undefined,
      contactId: contactId || undefined,
      amount,
      currency: currency || 'EUR',
      description: description || 'Factura externa',
      items: items || [{ name: 'Servicio', quantity: 1, price: amount, taxRate: 21 }],
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Factura creada y sellada con Veri*factu',
      invoice: {
        id: invoice.id,
        numero: invoice.numero,
        monto: invoice.monto,
        moneda: invoice.moneda,
        estado: invoice.estado,
        fechaEmision: invoice.fechaEmision,
        fingerprint: invoice.fingerprint,
        parentFingerprint: invoice.parentFingerprint,
        sequenceNumber: invoice.sequenceNumber,
        verifactuVersion: invoice.verifactuVersion,
        signature: invoice.signature,
        urlPdf: invoice.urlPdf,
      }
    });

  } catch (error: any) {
    console.error('[External-Invoicing-API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar la facturación' },
      { status: 500 }
    );
  }
}, ['invoices:create']);
