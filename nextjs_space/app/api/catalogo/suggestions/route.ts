export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

/**
 * GET /api/catalogo/suggestions
 * Endpoint para autocompletado de items del catálogo en formularios de cotizaciones/contratos/órdenes
 * Parámetros:
 * - q: texto de búsqueda (nombre, SKU, descripción)
 * - tipo: filtrar por tipo (producto/servicio)
 * - limit: número de resultados (default 10, max 50)
 * - includeInactive: incluir items inactivos (default false)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['catalogo:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const tipo = searchParams.get('tipo')
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)

    const where: any = {
      tenantId: auth.tenant!.id,
    }

    if (!includeInactive) {
      where.activo = true
    }

    if (tipo) {
      where.tipo = tipo
    }

    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { descripcion: { contains: q, mode: 'insensitive' } },
      ]
    }

    const items = await prisma.catalogoItem.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        sku: true,
        tipo: true,
        precioBase: true,
        moneda: true,
        categoriaFiscal: true,
        tasaImpuestoId: true,
        duracionMinutos: true,
        modalidad: true,
        unidad: true,
        activo: true,
        // Campos Fase 1
        customFieldValues: true,
        categorias: true,
        etiquetas: true,
        metadata: true,
        media: true,
        pricing: true,
        // Tasa de impuesto relacionada
        tasaImpuesto: {
          select: {
            id: true,
            nombre: true,
            porcentaje: true,
            tipo: true,
          },
        },
      },
      take: limit,
      orderBy: [
        { destacado: 'desc' },
        { nombre: 'asc' },
      ],
    })

    // Formatear respuesta para fácil uso en formularios
    const suggestions = items.map((item) => {
      const pricing = item.pricing as any || {}
      const hasVolumeDiscount = pricing.descuentos && Array.isArray(pricing.descuentos) && pricing.descuentos.length > 0

      return {
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        sku: item.sku,
        tipo: item.tipo,
        unidad: item.unidad,
        // Datos de precio
        precioUnitario: item.precioBase,
        moneda: item.moneda,
        // Datos fiscales
        categoriaFiscal: item.categoriaFiscal,
        tasaImpuestoId: item.tasaImpuestoId,
        porcentajeImpuesto: item.tasaImpuesto?.porcentaje || 0,
        // Para cotizaciones/contratos/órdenes
        concepto: item.nombre,
        // Indicadores
        hasVolumeDiscount,
        duracionMinutos: item.duracionMinutos,
        modalidad: item.modalidad,
        // Metadata adicional
        categorias: item.categorias,
        etiquetas: item.etiquetas,
        customFieldValues: item.customFieldValues,
        pricing: item.pricing,
      }
    })

    return NextResponse.json({
      suggestions,
      count: suggestions.length,
    })
  } catch (error) {
    console.error('Error al obtener sugerencias del catálogo:', error)
    return NextResponse.json(
      { error: 'Error al obtener sugerencias del catálogo' },
      { status: 500 }
    )
  }
}
