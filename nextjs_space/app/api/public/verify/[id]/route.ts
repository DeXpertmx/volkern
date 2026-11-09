export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const { id } = params

    const signature = await (prisma as any).erp_digital_signatures.findUnique({
      where: { id },
      include: {
        Tenant: {
          select: {
            nombre: true,
            razonSocial: true,
            nifCif: true,
            slug: true
          }
        }
      }
    })

    if (!signature) {
      return NextResponse.json(
        { error: 'Firma no encontrada o documento inválido' },
        { status: 404 }
      )
    }

    // Respuesta limitada para uso público
    return NextResponse.json({
      id: signature.id,
      documentType: signature.documentType,
      documentHash: signature.documentHash,
      signatureHash: signature.signatureHash,
      createdAt: signature.createdAt,
      metadata: signature.metadata,
      tenantName: signature.Tenant.razonSocial || signature.Tenant.nombre,
      tenantNif: signature.Tenant.nifCif,
      tenantSlug: signature.Tenant.slug
    })
  } catch (error) {
    console.error('[PublicVerify] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
