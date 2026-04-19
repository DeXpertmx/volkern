import { NextRequest, NextResponse } from 'next/server';
import { InboundInvoiceService } from '@/lib/finance/inbound-invoice-service';

/**
 * Webhook de Recepción Proactiva de Facturas
 * POST /api/webhooks/fiscal/inbound-invoice
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, format, data } = body;

    // Validación básica de seguridad (En producción usar X-Volkern-Signature)
    if (!tenantId || !data) {
      return NextResponse.json({ error: 'tenantId y data son requeridos' }, { status: 400 });
    }

    const selectedFormat = format || 'volkern_json';
    
    // Procesar la factura usando el service adaptativo
    const expense = await InboundInvoiceService.processInboundInvoice(tenantId, selectedFormat, data);

    return NextResponse.json({
      success: true,
      message: 'Factura procesada y encadenada en Veri*factu exitosamente.',
      expenseId: expense.id,
      fingerprint: expense.fingerprint
    });

  } catch (error: any) {
    console.error('[InboundInvoiceWebhook] Error:', error.message);
    return NextResponse.json({ 
      error: 'Error procesando la factura entrante', 
      details: error.message 
    }, { status: 500 });
  }
}
