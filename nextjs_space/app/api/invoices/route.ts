import { NextRequest, NextResponse } from 'next/server'
export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { InvoicingService } from '@/lib/invoicing-service'
import { checkFeatureLimit } from '@/lib/subscription'

interface InvoiceItemInput {
  concepto: string
  descripcion?: string
  cantidad: number
  precioUnitario: number
  descuento?: number
  impuestos?: number
  tasaImpuestoPorcentaje?: number
  tasaImpuestoNombre?: string
  catalogoItemId?: string
}

interface CreateInvoiceBody {
  clienteNombre: string
  clienteEmail?: string
  clienteNif?: string
  clienteDireccion?: string
  items: InvoiceItemInput[]
  moneda?: string
  notas?: string
  tipoDescuento?: 'linea' | 'total'
  descuentoGlobal?: number
}

/**
 * GET /api/invoices
 * Lista facturas del tenant (ordenadas por fecha de emisión descendente)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['billing:read', 'invoices:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const search = url.searchParams.get('search') || ''

    const where: any = {
      tenantId: auth.tenant!.id
    }

    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { lead: { nombre: { contains: search, mode: 'insensitive' } } },
        { contact: { nombre: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { fechaEmision: 'desc' },
        take: limit,
        skip: offset,
        include: {
          lead: { select: { nombre: true, email: true, empresa: true } },
          contact: { select: { nombre: true, email: true } },
        }
      }),
      prisma.invoice.count({ where })
    ])

    return NextResponse.json({
      invoices,
      total,
      limit,
      offset
    })

  } catch (error: any) {
    console.error('[Invoices-API] Error listing:', error)
    return NextResponse.json(
      { error: error.message || 'Error al listar facturas' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/invoices
 * Crea una factura manual (sin orden de venta)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, ['billing:write', 'invoices:create'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    // Verificar límite de facturas emitidas
    const limitCheck = await checkFeatureLimit(auth.tenant!.id, 'invoices', 1)
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: `Has alcanzado el límite de ${limitCheck.limit} facturas emitidas en tu plan actual.` },
        { status: 403 }
      )
    }

    const body: CreateInvoiceBody = await request.json()

    // Validar campos requeridos
    if (!body.clienteNombre || !body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere nombre del cliente y al menos un item' },
        { status: 400 }
      )
    }

    // Calcular totales
    const moneda = body.moneda || 'EUR'
    const tipoDescuento = body.tipoDescuento || 'linea'
    const descuentoGlobal = body.descuentoGlobal || 0

    const subtotal = body.items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0)
    const descuentoLineas = body.items.reduce((sum, item) => {
      const base = item.cantidad * item.precioUnitario
      return sum + (base * (item.descuento || 0) / 100)
    }, 0)
    const baseImponible = tipoDescuento === 'total'
      ? subtotal * (1 - descuentoGlobal / 100)
      : subtotal - descuentoLineas
    const impuestos = body.items.reduce((sum, item) => {
      const base = item.cantidad * item.precioUnitario
      const dto = tipoDescuento === 'linea' ? base * (item.descuento || 0) / 100 : 0
      const tasa = item.tasaImpuestoPorcentaje || item.impuestos || 0
      return sum + (base - dto) * tasa / 100
    }, 0)
    const total = baseImponible + impuestos

    // Obtener número de factura
    const lastInvoice = await prisma.invoice.findFirst({
      where: { tenantId: auth.tenant!.id },
      orderBy: { fechaEmision: 'desc' }
    })

    const lastNumber = lastInvoice?.numero || 'F-0'
    const lastSeq = parseInt(lastNumber.split('-')[1] || '0', 10)
    const numero = `F-${String(lastSeq + 1).padStart(5, '0')}`

    // Crear la factura usando InvoicingService (para sellado Veri*factu si aplica)
    const invoiceOptions = {
      tenantId: auth.tenant!.id,
      amount: total,
      currency: moneda,
      description: `Factura manual: ${body.clienteNombre}`,
      items: body.items.map(item => ({
        name: item.concepto,
        quantity: item.cantidad,
        price: item.precioUnitario,
        description: item.descripcion,
        taxRate: item.tasaImpuestoPorcentaje ?? item.impuestos ?? 0
      }))
    }

    let invoice
    if (body.clienteEmail) {
      // Buscar o crear contacto para vincular la factura
      let contact = await prisma.contact.findFirst({
        where: { email: body.clienteEmail, tenantId: auth.tenant!.id }
      })

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            tenantId: auth.tenant!.id,
            nombre: body.clienteNombre,
            email: body.clienteEmail,
          }
        })
      }

      invoice = await InvoicingService.createInvoice({
        ...invoiceOptions,
        contactId: contact.id,
      })

      // Actualizar metadata con datos adicionales del cliente
      if (body.clienteNif || body.clienteDireccion || body.notas) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            metadata: {
              ...(invoice.metadata as any || {}),
              clienteNombre: body.clienteNombre,
              clienteNif: body.clienteNif,
              clienteDireccion: body.clienteDireccion,
              notas: body.notas,
              items: body.items,
              isManual: true,
              tipoDescuento: body.tipoDescuento,
              descuentoGlobal: body.descuentoGlobal
            }
          }
        })
      }
    } else {
      // Sin contacto asociado, crear factura directamente con metadata
      invoice = await InvoicingService.createInvoice(invoiceOptions)

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          metadata: {
            ...(invoice.metadata as any || {}),
            clienteNombre: body.clienteNombre,
            clienteNif: body.clienteNif,
            clienteDireccion: body.clienteDireccion,
            notas: body.notas,
            items: body.items,
            isManual: true,
            tipoDescuento: body.tipoDescuento,
            descuentoGlobal: body.descuentoGlobal
          },
          numero
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Factura manual creada correctamente',
      invoice
    })

  } catch (error: any) {
    console.error('[Invoices-API] Error creating:', error)
    return NextResponse.json(
      { error: error.message || 'Error al crear la factura' },
      { status: 500 }
    )
  }
}
