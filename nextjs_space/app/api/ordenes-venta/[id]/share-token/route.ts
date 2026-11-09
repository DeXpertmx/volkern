export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { randomBytes } from 'crypto'

/**
 * POST /api/ordenes-venta/[id]/share-token
 * Genera (o devuelve si ya existe) el token público de la orden de venta.
 * El token permite compartir la orden con el cliente sin autenticación:
 * /orden/[tokenPublico]
 */
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['deals:write', 'orders:write'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const orden = await prisma.ordenVenta.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      select: { id: true, tokenPublico: true }
    })

    if (!orden) {
      return NextResponse.json(
        { error: 'Orden de venta no encontrada' },
        { status: 404 }
      )
    }

    if (orden.tokenPublico) {
      return NextResponse.json({ token: orden.tokenPublico })
    }

    // Generar token criptográficamente seguro, con reintento por colisión
    for (let intento = 0; intento < 3; intento++) {
      const token = randomBytes(24).toString('base64url')
      try {
        const updated = await prisma.ordenVenta.update({
          where: { id: orden.id },
          data: { tokenPublico: token },
          select: { tokenPublico: true }
        })
        return NextResponse.json({ token: updated.tokenPublico })
      } catch (e: any) {
        // P2002 = colisión de unique; regenerar
        if (e?.code !== 'P2002') throw e
      }
    }

    return NextResponse.json(
      { error: 'No se pudo generar el enlace público' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Error al generar token público de orden de venta:', error)
    return NextResponse.json(
      { error: 'Error al generar el enlace público' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ordenes-venta/[id]/share-token
 * Devuelve el token público si existe (sin generarlo).
 */
export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(req, ['deals:read', 'orders:read'])
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const orden = await prisma.ordenVenta.findFirst({
      where: {
        id: params.id,
        tenantId: auth.tenant!.id
      },
      select: { tokenPublico: true }
    })

    if (!orden) {
      return NextResponse.json(
        { error: 'Orden de venta no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({ token: orden.tokenPublico })
  } catch (error) {
    console.error('Error al consultar token público:', error)
    return NextResponse.json(
      { error: 'Error al consultar el enlace público' },
      { status: 500 }
    )
  }
}
