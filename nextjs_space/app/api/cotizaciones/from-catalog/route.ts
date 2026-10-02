export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-key-auth'
import { validateBody } from '@/lib/validation'
import { z } from 'zod'
import { crearCotizacionDesdeCatalogo } from '@/lib/cotizaciones/from-catalog'

const CatalogItemSchema = z.object({
  catalogoItemId: z.string().min(1),
  cantidad: z.coerce.number().min(1),
  descuento: z.coerce.number().min(0).optional(),
  precioOverride: z.coerce.number().min(0).optional(),
  descripcionOverride: z.string().max(2000).optional(),
});

const CatalogCotizacionCreateSchema = z.object({
  dealId: z.string().min(25).optional(),
  leadId: z.string().min(25).optional(),
  contactId: z.string().min(25).optional(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional(),
  catalogItems: z.array(CatalogItemSchema).min(1, 'Se requiere al menos un item').max(200),
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  moneda: z.string().length(3).optional(),
  validezDias: z.coerce.number().int().min(1).max(365).default(30),
  terminosPago: z.string().max(500).optional(),
  notasCliente: z.string().max(5000).optional(),
  notasInternas: z.string().max(5000).optional(),
  clienteNombre: z.string().max(500).optional(),
  clienteEmail: z.string().email().optional(),
  clienteEmpresa: z.string().max(255).optional(),
  clienteTelefono: z.string().max(30).optional(),
  emisorId: z.string().min(25).optional(),
});
/**
 * POST /api/cotizaciones/from-catalog
 * Crear cotización pre-poblada desde items del catálogo.
 * La lógica vive en lib/cotizaciones/from-catalog.ts (compartida con el
 * skill MCP create_cotizacion, contrato catalogItems del catálogo standalone).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'quotes:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const raw = await req.json()
    const parsed = validateBody(CatalogCotizacionCreateSchema, raw)
    if (parsed instanceof NextResponse) return parsed

    const {
      dealId,
      leadId,
      contactId,
      titulo,
      descripcion,
      catalogItems,
      descuentoPorcentaje,
      moneda,
      validezDias,
      terminosPago,
      notasCliente,
      notasInternas,
      clienteNombre,
      clienteEmail,
      clienteEmpresa,
      clienteTelefono,
      emisorId,
    } = parsed

    const { cotizacion } = await crearCotizacionDesdeCatalogo({
      tenantId: auth.tenant!.id,
      userId: auth.user?.id || null,
      titulo,
      catalogItems,
      dealId: dealId || null,
      leadId: leadId || null,
      contactId: contactId || null,
      descripcion: descripcion || null,
      descuentoPorcentaje,
      moneda: moneda || null,
      validezDias,
      terminosPago: terminosPago || null,
      notasCliente: notasCliente || null,
      notasInternas: notasInternas || null,
      clienteNombre: clienteNombre || null,
      clienteEmail: clienteEmail || null,
      clienteEmpresa: clienteEmpresa || null,
      clienteTelefono: clienteTelefono || null,
      emisorId: emisorId || null,
    })

    return NextResponse.json({ cotizacion }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear cotización desde catálogo:', error)
    const status = error?.message?.startsWith('Item del catálogo no encontrado') ? 404 : 500
    return NextResponse.json(
      { error: 'Error al crear cotización', details: error.message },
      { status }
    )
  }
}
