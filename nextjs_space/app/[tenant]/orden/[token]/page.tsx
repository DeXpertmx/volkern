export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma, globalPrisma, getTenantDb, dbContext } from '@/lib/db';

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: { tenant: string; token: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const orderId = params.token;

  const tenant = await globalPrisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true }
  });

  if (!tenant) {
    notFound();
  }

  const tenantClient = await getTenantDb(tenant.id);

  const orden = await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
    return prisma.ordenVenta.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { catalogItem: true, variant: true } },
        shippingAddress: true,
        invoice: true,
      }
    });
  });

  if (!orden) {
    notFound();
  }

  const currencySymbol = orden.moneda === 'EUR' ? '€' : orden.moneda === 'MXN' ? '$' : orden.moneda;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">¡Pedido confirmado!</h1>
        <p className="text-gray-600 mt-2">
          Tu pedido #{orden.numero} ha sido procesado correctamente
        </p>
        {orden.paymentStatus === 'paid' && (
          <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
            Pagado
          </span>
        )}
      </div>

      {/* Order details */}
      <div className="bg-white rounded-xl border p-6 space-y-6">
        {/* Items */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Productos</h2>
          <div className="space-y-3">
            {orden.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <div>
                  <p className="font-medium text-gray-900">{item.concepto}</p>
                  <p className="text-sm text-gray-500">Cantidad: {item.cantidad}</p>
                </div>
                <p className="font-medium text-gray-900">
                  {currencySymbol}{item.total.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="border-t pt-4 space-y-2">
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
              <span className="text-gray-600">Envío</span>
              <span>{currencySymbol}{orden.shippingCost.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total</span>
            <span>{currencySymbol}{orden.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Shipping address */}
        {orden.shippingAddress && (
          <div className="border-t pt-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Dirección de envío</h2>
            <div className="text-gray-600">
              <p>{orden.shippingAddress.nombre}</p>
              <p>{orden.shippingAddress.linea1}</p>
              {orden.shippingAddress.linea2 && <p>{orden.shippingAddress.linea2}</p>}
              <p>{orden.shippingAddress.ciudad}, {orden.shippingAddress.codigoPostal}</p>
              <p>{orden.shippingAddress.pais}</p>
            </div>
          </div>
        )}

        {/* Invoice */}
        {orden.invoice && (
          <div className="border-t pt-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Factura</h2>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-gray-600">
                Factura {orden.invoice.numero} emitida con Veri*factu
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4 mt-8">
        <Link
          href={`/${params.tenant}/tienda`}
          className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors"
        >
          Continuar comprando
        </Link>
      </div>
    </div>
  );
}
