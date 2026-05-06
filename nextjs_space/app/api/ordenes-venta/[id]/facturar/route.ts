import { NextRequest, NextResponse } from 'next/server'
export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { InvoicingService } from '@/lib/invoicing-service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(req, ['orders:write', 'billing:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    // 1. Obtener la orden con sus items
    const orden = await prisma.ordenVenta.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      include: {
        items: true,
        lead: true,
        contact: true
      }
    })

    if (!orden) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (orden.estado !== 'pendiente_finanzas') {
      return NextResponse.json(
        { error: 'La orden debe estar en revisión financiera para ser facturada' },
        { status: 400 }
      )
    }

    // 2. Preparar datos para InvoicingService
    const invoiceOptions = {
      tenantId: auth.tenant!.id,
      leadId: orden.leadId || undefined,
      contactId: orden.contactId || undefined,
      ordenVentaId: orden.id,
      amount: orden.total,
      currency: orden.moneda,
      description: `Factura de Orden ${orden.numero}`,
      items: orden.items.map(item => ({
        name: item.concepto,
        quantity: item.cantidad,
        price: item.precioUnitario,
        description: item.descripcion || undefined,
        taxRate: item.porcentajeImpuesto
      }))
    }

    // 3. Crear factura legal (Integración externa + Verifactu)
    const invoice = await InvoicingService.createInvoice(invoiceOptions as any)

    // 4. Actualizar estado de la orden
    const updatedOrden = await prisma.ordenVenta.update({
      where: { id: orden.id },
      data: {
        estado: 'facturada',
        fechaFacturacion: new Date(),
        invoiceId: invoice.id
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Factura generada correctamente',
      invoice,
      orden: updatedOrden
    })

  } catch (error: any) {
    console.error('[Facturacion-API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error al procesar la facturación' },
      { status: 500 }
    )
  }
}
