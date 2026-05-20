export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma, globalPrisma, getTenantDb, dbContext } from '@/lib/db';

export default async function OrderDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true }
  });

  if (!tenant) notFound();

  const tenantClient = await getTenantDb(tenant.id);

  const orden = await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
    return prisma.ordenVenta.findUnique({
      where: { id: params.id },
      include: {
        items: { include: { catalogItem: true, variant: true } },
        shippingAddress: true,
        invoice: true,
        coupon: true,
      }
    });
  });

  if (!orden) notFound();

  const currencySymbol = orden.moneda === 'EUR' ? '€' : orden.moneda === 'MXN' ? '$' : orden.moneda;

  const estadoLabels: Record<string, string> = {
    borrador: 'Borrador',
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    en_proceso: 'En proceso',
    completada: 'Completada',
    cancelada: 'Cancelada',
  };

  const paymentLabels: Record<string, string> = {
    pending: 'Pendiente de pago',
    paid: 'Pagado',
    failed: 'Pago fallido',
    refunded: 'Reembolsado',
  };

  // Order timeline
  const timeline = [
    { label: 'Pedido creado', date: orden.fechaCreacion, done: true },
    { label: 'Pago confirmado', date: orden.paidAt, done: orden.paymentStatus === 'paid' },
    { label: 'Enviado', date: orden.trackingNumber ? orden.fechaCreacion : null, done: !!orden.trackingNumber },
    { label: 'Entregado', date: orden.estado === 'completada' ? orden.fechaActualizacion : null, done: orden.estado === 'completada' },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/${params.tenant}/mis-ordenes`} className="text-primary hover:underline text-sm mb-4 inline-block">
          ← Volver a mis pedidos
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Pedido #{orden.numero}
          </h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            orden.estado === 'completada' ? 'bg-green-100 text-green-800' :
            orden.estado === 'cancelada' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {estadoLabels[orden.estado] || orden.estado}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            orden.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {paymentLabels[orden.paymentStatus] || orden.paymentStatus}
          </span>
        </div>
        <p className="text-gray-500 mt-2">
          Realizado el {new Date(orden.fechaCreacion).toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seguimiento</h2>
        <div className="flex items-center justify-between">
          {timeline.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                step.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
              }`}>
                {step.done ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-sm">{idx + 1}</span>
                )}
              </div>
              <p className={`text-xs mt-2 text-center ${step.done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {step.label}
              </p>
              {step.date && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(step.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              )}
              {idx < timeline.length - 1 && (
                <div className={`absolute h-0.5 w-1/4 ${
                  step.done ? 'bg-green-500' : 'bg-gray-200'
                }`} style={{ left: `${(idx + 0.5) * 25}%`, top: '20px' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Productos</h2>
            <div className="space-y-4">
              {orden.items.map((item) => {
                const media = item.catalogItem?.media;
                const imagen = media && Array.isArray(media)
                  ? media[0]?.url || media[0]?.src
                  : media && typeof media === 'object'
                    ? (media as any).url || (media as any).src
                    : null;

                return (
                  <div key={item.id} className="flex gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      {imagen ? (
                        <img src={imagen} alt={item.concepto} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.concepto}</p>
                      <p className="text-sm text-gray-500">Cantidad: {item.cantidad}</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {currencySymbol}{item.total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          {/* Totals */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{currencySymbol}{orden.subtotal.toFixed(2)}</span>
              </div>
              {orden.couponDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Descuento ({orden.couponCode})</span>
                  <span>-{currencySymbol}{orden.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {orden.shippingCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Envío ({orden.shippingMethod})</span>
                  <span>{currencySymbol}{orden.shippingCost.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span>{currencySymbol}{orden.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping */}
          {orden.shippingAddress && (
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Envío</h2>
              <p className="text-sm text-gray-600">
                {orden.shippingAddress.nombre}<br />
                {orden.shippingAddress.linea1}<br />
                {orden.shippingAddress.ciudad}, {orden.shippingAddress.codigoPostal}<br />
                {orden.shippingAddress.pais}
              </p>
            </div>
          )}

          {/* Tracking */}
          {orden.trackingNumber && (
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Tracking</h2>
              <p className="text-sm text-gray-600 mb-2">
                {orden.shippingCarrier || 'Estándar'}
              </p>
              <p className="text-sm font-mono bg-gray-100 p-2 rounded">
                {orden.trackingNumber}
              </p>
              {orden.trackingUrl && (
                <a
                  href={orden.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  Rastrear paquete →
                </a>
              )}
            </div>
          )}

          {/* Invoice */}
          {orden.invoice && (
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Factura</h2>
              <p className="text-sm text-gray-600 mb-2">
                {orden.invoice.numero}
              </p>
              {orden.invoice.aeatStatus && (
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                  orden.invoice.aeatStatus === 'ACCEPTED'
                    ? 'bg-green-100 text-green-800'
                    : orden.invoice.aeatStatus === 'PENDING'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                }`}>
                  AEAT: {orden.invoice.aeatStatus}
                </span>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Factura emitida con Veri*factu (cadena inmutable)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
