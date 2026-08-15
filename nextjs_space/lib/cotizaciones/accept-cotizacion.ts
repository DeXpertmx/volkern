import { prisma } from '@/lib/db'

export async function acceptCotizacionFromPublicLink({
  cotizacionId,
  tenantId,
  ip,
}: {
  cotizacionId: string
  tenantId: string
  ip: string
}) {
  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: { deal: true },
  })

  if (!cotizacion || cotizacion.tenantId !== tenantId) {
    return { ok: false as const, status: 404, error: 'Cotización no encontrada' }
  }

  if (['aceptada', 'rechazada'].includes(cotizacion.estado)) {
    return {
      ok: false as const,
      status: 400,
      error: `Esta cotización ya fue ${cotizacion.estado}`,
    }
  }

  if (cotizacion.fechaVencimiento && new Date(cotizacion.fechaVencimiento) < new Date()) {
    return { ok: false as const, status: 400, error: 'Esta cotización ha expirado' }
  }

  const now = new Date()
  const updated = await prisma.cotizacion.update({
    where: { id: cotizacion.id },
    data: {
      estado: 'aceptada',
      fechaAceptacion: now,
      firmadoPorCliente: true,
      fechaFirma: now,
      ipFirma: ip,
    },
  })

  if (cotizacion.dealId) {
    await prisma.deal.update({
      where: { id: cotizacion.dealId },
      data: { etapa: 'negociacion', probabilidad: 75 },
    })

    await prisma.dealActivity.create({
      data: {
        dealId: cotizacion.dealId,
        tenantId,
        userId: null,
        tipo: 'cotizacion_aceptada',
        titulo: 'Cotización aceptada por cliente',
        descripcion: `El cliente aceptó la cotización ${cotizacion.numero} después de verificar su identidad`,
        resultado: 'exitoso',
      },
    })
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: null,
      accion: 'aceptar',
      entidad: 'cotizacion',
      entidadId: cotizacion.id,
      descripcion: `Cliente aceptó la cotización ${cotizacion.numero} tras verificar un código desde IP: ${ip}`,
    },
  })

  return { ok: true as const, cotizacion: updated }
}
