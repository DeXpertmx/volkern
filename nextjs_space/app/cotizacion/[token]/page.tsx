import { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { getEffectiveBranding } from '@/lib/branding'
import { getPublicUrl } from '@/lib/s3-public-url'
import CotizacionPublicView from './CotizacionPublicView'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const cotizacion = await prisma.cotizacion.findUnique({
    where: { tokenPublico: token },
    include: { tenant: true }
  })

  if (!cotizacion) {
    return { title: 'Cotización no encontrada' }
  }

  return {
    title: `${cotizacion.numero} - ${cotizacion.titulo}`,
    description: `Cotización de ${cotizacion.tenant.nombre}`,
  }
}

export default async function CotizacionPublicPage({ params }: Props) {
  const { token } = await params
  const cotizacion = await prisma.cotizacion.findUnique({
    where: { tokenPublico: token },
    include: {
      items: { orderBy: { orden: 'asc' } },
      tenant: {
        select: {
          nombre: true,
          dominio: true,
          configuracion: true,
        }
      },
    },
  })

  if (!cotizacion) {
    notFound()
  }

  // Actualizar tracking
  const now = new Date()
  await prisma.cotizacion.update({
    where: { id: cotizacion.id },
    data: {
      vecesVista: { increment: 1 },
      ultimaVista: now,
      fechaPrimeraVista: cotizacion.fechaPrimeraVista || now,
      estado: cotizacion.estado === 'enviada' ? 'vista' : cotizacion.estado,
    },
  })

  // Marca efectiva del tenant (Identidad Visual > Slot > Agencia > Volkern) para el logo
  const branding = await getEffectiveBranding(cotizacion.tenantId)
  let logoUrl = branding.logoUrl || '/volkern-logo.png'
  if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/')) {
    logoUrl = getPublicUrl(logoUrl)
  }

  // Serializar fechas para el componente cliente
  const serializedCotizacion = {
    ...cotizacion,
    fechaCreacion: cotizacion.fechaCreacion.toISOString(),
    fechaVencimiento: cotizacion.fechaVencimiento?.toISOString() || null,
    fechaEnvio: cotizacion.fechaEnvio?.toISOString() || null,
    fechaAceptacion: cotizacion.fechaAceptacion?.toISOString() || null,
    fechaActualizacion: cotizacion.fechaActualizacion.toISOString(),
    fechaPrimeraVista: cotizacion.fechaPrimeraVista?.toISOString() || null,
    ultimaVista: cotizacion.ultimaVista?.toISOString() || null,
    fechaFirma: cotizacion.fechaFirma?.toISOString() || null,
    items: cotizacion.items.map(item => ({
      ...item,
    })),
    tenant: {
      ...cotizacion.tenant,
      configuracion: cotizacion.tenant.configuracion,
    }
  }

  return (
    <CotizacionPublicView
      cotizacion={serializedCotizacion}
      logoUrl={logoUrl}
      companyName={branding.companyName || cotizacion.tenant.nombre}
    />
  )
}
