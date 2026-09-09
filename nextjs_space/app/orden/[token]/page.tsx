import { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { getEffectiveBranding } from '@/lib/branding'
import { getPublicUrl } from '@/lib/s3-public-url'
import OrdenPublicView from './OrdenPublicView'

// La página es dinámica por token (nunca prerenderizar/cachear a nivel de ruta).
export const dynamic = 'force-dynamic'

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const orden = await prisma.ordenVenta.findUnique({
    where: { tokenPublico: params.token },
    include: { tenant: { select: { nombre: true } } }
  })

  if (!orden) {
    return { title: 'Orden no encontrada' }
  }

  return {
    title: `Orden de Venta ${orden.numero} - ${orden.tenant.nombre}`,
    description: `Comprobante de orden de venta de ${orden.tenant.nombre}`,
  }
}

export default async function OrdenPublicPage({ params }: Props) {
  const orden = await prisma.ordenVenta.findUnique({
    where: { tokenPublico: params.token },
    include: {
      items: { orderBy: { orden: 'asc' } },
      lead: { select: { id: true, nombre: true, email: true, empresa: true } },
      contact: { select: { id: true, nombre: true, email: true, tipo: true } },
      emisor: {
        select: {
          id: true, razonSocial: true, nombreComercial: true,
          idFiscal: true, tipoIdFiscal: true, pais: true,
          direccion: true, ciudad: true, codigoPostal: true,
          email: true, telefono: true, logoUrl: true
        }
      },
      tenant: {
        select: { nombre: true, brandingConfig: true }
      },
    },
  })

  if (!orden) {
    notFound()
  }

  // Marca efectiva del tenant (Slot > Agencia > Volkern) para el logo
  const branding = await getEffectiveBranding(orden.tenantId)
  let logoUrl = branding.logoUrl || '/volkern-logo.png'
  // Convertir clave S3 a URL pública si aplica
  if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/')) {
    logoUrl = getPublicUrl(logoUrl)
  }

  // Serializar fechas para el componente cliente
  const serialized = {
    numero: orden.numero,
    estado: orden.estado,
    fechaOrden: orden.fechaOrden.toISOString(),
    fechaEntrega: orden.fechaEntrega?.toISOString() || null,
    fechaConfirmacion: null as string | null,
    subtotal: orden.subtotal,
    descuentoGlobal: orden.descuentoGlobal,
    totalImpuestos: orden.totalImpuestos,
    totalRetenciones: orden.totalRetenciones,
    total: orden.total,
    moneda: orden.moneda,
    notas: orden.notas,
    condicionesVenta: orden.condicionesVenta,
    referenciaCliente: orden.referenciaCliente,
    cliente: {
      nombre: orden.lead?.nombre || orden.contact?.nombre || 'Cliente',
      empresa: orden.lead?.empresa || null,
      email: orden.lead?.email || orden.contact?.email || null,
    },
    emisor: orden.emisor ? {
      razonSocial: orden.emisor.razonSocial,
      idFiscal: orden.emisor.idFiscal,
      direccion: [orden.emisor.direccion, orden.emisor.ciudad, orden.emisor.codigoPostal].filter(Boolean).join(', ') || null,
      email: orden.emisor.email,
      telefono: orden.emisor.telefono,
    } : null,
    items: orden.items.map(item => ({
      concepto: item.concepto,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      descuento: item.descuento,
      total: item.total,
    })),
    tenantNombre: orden.tenant.nombre,
  }

  return <OrdenPublicView orden={serialized} logoUrl={logoUrl} companyName={branding.companyName || orden.tenant.nombre} />
}
