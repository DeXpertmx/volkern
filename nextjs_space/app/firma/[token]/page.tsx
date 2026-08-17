import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import FirmaPortalView from './FirmaPortalView';

interface PageProps {
  params: { token: string };
}

export const dynamic = 'force-dynamic';

export default async function FirmaPortalPage({ params }: PageProps) {
  const contrato = await prisma.contrato.findUnique({
    where: { tokenPublico: params.token },
    include: {
      items: { orderBy: { orden: 'asc' } },
      signatureRequests: { orderBy: { createdAt: 'desc' }, take: 3 },
      timeline: { orderBy: { createdAt: 'desc' }, take: 20 },
      tenant: {
        select: {
          nombre: true,
          dominio: true,
          configuracion: true,
        },
      },
    },
  });

  if (!contrato) {
    notFound();
  }

  // Actualizar tracking
  await prisma.contrato
    .update({
      where: { id: contrato.id },
      data: {
        vecesVista: { increment: 1 },
        ultimaVista: new Date(),
        fechaPrimeraVista: contrato.fechaPrimeraVista || new Date(),
      },
    })
    .catch(() => {});

  const serialize = (c: typeof contrato) => ({
    id: c.id,
    numero: c.numero,
    titulo: c.titulo,
    descripcion: c.descripcion,
    tipo: c.tipo,
    estado: c.estado,
    subtotal: c.subtotal,
    descuentoPorcentaje: c.descuentoPorcentaje,
    descuentoMonto: c.descuentoMonto,
    impuestos: c.impuestos,
    total: c.total,
    moneda: c.moneda,
    condicionesPago: c.condicionesPago,
    clausulas: c.clausulas,
    notasCliente: c.notasCliente,
    fechaCreacion: c.fechaCreacion.toISOString(),
    fechaInicio: c.fechaInicio?.toISOString() || null,
    fechaFin: c.fechaFin?.toISOString() || null,
    fechaEnvio: c.fechaEnvio?.toISOString() || null,
    firmadoPorCliente: c.firmadoPorCliente,
    nombreFirmaCliente: c.nombreFirmaCliente,
    fechaFirmaCliente: c.fechaFirmaCliente?.toISOString() || null,
    firmadoPorEmpresa: c.firmadoPorEmpresa,
    nombreFirmaEmpresa: c.nombreFirmaEmpresa,
    fechaFirmaEmpresa: c.fechaFirmaEmpresa?.toISOString() || null,
    clienteNombre: c.clienteNombre,
    clienteEmpresa: c.clienteEmpresa,
    clienteEmail: c.clienteEmail,
    items: c.items,
    signatureRequests: c.signatureRequests.map((sr) => ({
      id: sr.id,
      title: sr.title,
      status: sr.status,
      sentAt: sr.sentAt?.toISOString() || null,
      completedAt: sr.completedAt?.toISOString() || null,
      signers: sr.signers as any[],
    })),
    timeline: c.timeline.map((t) => ({
      id: t.id,
      action: t.action,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    })),
    tenant: c.tenant,
  });

  return <FirmaPortalView contrato={serialize(contrato)} token={params.token} />;
}
