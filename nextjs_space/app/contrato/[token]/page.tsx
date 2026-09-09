import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { getEffectiveBranding } from '@/lib/branding'
import { getPublicUrl } from '@/lib/s3-public-url'
import ContratoPublicView from './ContratoPublicView'

interface PageProps {
  params: { token: string }
}

export default async function ContratoPublicPage({ params }: PageProps) {
  const contrato = await prisma.contrato.findUnique({
    where: { tokenPublico: params.token },
    include: {
      items: { orderBy: { orden: 'asc' } },
      tenant: {
        select: {
          nombre: true,
          dominio: true,
          configuracion: true
        }
      }
    }
  })

  if (!contrato) {
    notFound()
  }

  // Update tracking
  await prisma.contrato.update({
    where: { id: contrato.id },
    data: {
      vecesVista: { increment: 1 },
      ultimaVista: new Date(),
      fechaPrimeraVista: contrato.fechaPrimeraVista || new Date()
    }
  })

  // Marca efectiva del tenant (Identidad Visual > Slot > Agencia > Volkern) para el logo
  const branding = await getEffectiveBranding(contrato.tenantId)
  let logoUrl = branding.logoUrl || '/volkern-logo.png'
  if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/')) {
    logoUrl = getPublicUrl(logoUrl)
  }

  // Serialize dates for client component
  const serializedContrato = {
    ...contrato,
    fechaCreacion: contrato.fechaCreacion.toISOString(),
    fechaEnvio: contrato.fechaEnvio?.toISOString() || null,
    fechaFirmaCliente: contrato.fechaFirmaCliente?.toISOString() || null,
    fechaFirmaEmpresa: contrato.fechaFirmaEmpresa?.toISOString() || null,
    fechaInicio: contrato.fechaInicio?.toISOString() || null,
    fechaFin: contrato.fechaFin?.toISOString() || null,
    fechaActualizacion: contrato.fechaActualizacion.toISOString(),
    fechaPrimeraVista: contrato.fechaPrimeraVista?.toISOString() || null,
    ultimaVista: contrato.ultimaVista?.toISOString() || null
  }

  return <ContratoPublicView contrato={serializedContrato} logoUrl={logoUrl} companyName={branding.companyName || contrato.tenant.nombre} />
}
