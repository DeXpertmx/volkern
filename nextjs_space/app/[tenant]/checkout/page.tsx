'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/lib/store/cart-store';
import { useCheckoutStore, CheckoutAddress } from '@/lib/store/checkout-store';

interface CheckoutPageProps {
  tenant: string;
}

export default function CheckoutPage({ tenant }: CheckoutPageProps) {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const subtotal = useCartStore((state) => state.subtotal());

  const {
    step, setStep,
    address, setAddress,
    shippingMethod, setShippingMethod,
    couponCode, setCouponCode,
    couponValid, couponDiscount, setCouponValid,
    paymentMethod, setPaymentMethod,
    isProcessing, setIsProcessing,
    error, setError,
    reset,
  } = useCheckoutStore();

  const [addressForm, setAddressForm] = useState<CheckoutAddress>({
    nombre: '',
    telefono: '',
    linea1: '',
    linea2: '',
    ciudad: '',
    estado: '',
    codigoPostal: '',
    pais: 'España',
    nif: '',
    emailFacturacion: '',
  });

  const [validatingCoupon, setValidatingCoupon] = useState(false);

  if (items.length === 0 && step < 4) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Tu carrito está vacío</h1>
        <button
          onClick={() => router.push(`/${tenant}/tienda`)}
          className="text-primary font-medium hover:underline"
        >
          Ir a la tienda
        </button>
      </div>
    );
  }

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    setValidatingCoupon(true);

    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant,
        code: couponCode,
        cartItems: items.map((i) => ({ catalogoItemId: i.catalogoItemId })),
        subtotal,
      }),
    });

    const data = await res.json();
    if (data.valid) {
      setCouponValid(true, data.discount);
    } else {
      setCouponValid(false, 0);
      setError(data.error);
    }
    setValidatingCoupon(false);
  };

  const handleCreateOrder = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const sessionId = localStorage.getItem('volkern-session-id') || `sess-${Date.now()}`;

      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant,
          sessionId,
          address: addressForm,
          shippingMethod,
          shippingCost: 0,
          couponCode: couponValid ? couponCode : undefined,
          couponDiscount,
          paymentMethod,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        setIsProcessing(false);
        return;
      }

      const paymentRes = await fetch('/api/checkout/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant,
          orderId: data.orderId,
          total: data.total,
          moneda: data.moneda,
          email: addressForm.emailFacturacion,
          address: addressForm,
        }),
      });

      const paymentData = await paymentRes.json();

      if (paymentData.sessionUrl) {
        clearCart();
        reset();
        window.location.href = paymentData.sessionUrl;
      } else {
        setError('Error al procesar el pago');
        setIsProcessing(false);
      }
    } catch (e) {
      setError('Error de conexión');
      setIsProcessing(false);
    }
  };

  const currencySymbol = items.length > 0
    ? (items[0].moneda === 'EUR' ? '€' : items[0].moneda === 'MXN' ? '$' : items[0].moneda)
    : '€';

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

      {/* Steps indicator */}
      <div className="flex items-center justify-center mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s <= step ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {s}
            </div>
            {s < 3 && (
              <div className={`w-16 h-0.5 ${s < step ? 'bg-primary' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main form */}
        <div className="lg:col-span-2">
          {step === 1 && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Dirección de envío</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    value={addressForm.nombre}
                    onChange={(e) => setAddressForm({ ...addressForm, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={addressForm.telefono}
                    onChange={(e) => setAddressForm({ ...addressForm, telefono: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección *</label>
                  <input
                    type="text"
                    value={addressForm.linea1}
                    onChange={(e) => setAddressForm({ ...addressForm, linea1: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección 2</label>
                  <input
                    type="text"
                    value={addressForm.linea2}
                    onChange={(e) => setAddressForm({ ...addressForm, linea2: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad *</label>
                  <input
                    type="text"
                    value={addressForm.ciudad}
                    onChange={(e) => setAddressForm({ ...addressForm, ciudad: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado/Provincia</label>
                  <input
                    type="text"
                    value={addressForm.estado}
                    onChange={(e) => setAddressForm({ ...addressForm, estado: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal *</label>
                  <input
                    type="text"
                    value={addressForm.codigoPostal}
                    onChange={(e) => setAddressForm({ ...addressForm, codigoPostal: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                  <select
                    value={addressForm.pais}
                    onChange={(e) => setAddressForm({ ...addressForm, pais: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  >
                    <option value="España">España</option>
                    <option value="México">México</option>
                    <option value="Argentina">Argentina</option>
                    <option value="Colombia">Colombia</option>
                    <option value="Chile">Chile</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NIF/RFC *</label>
                  <input
                    type="text"
                    value={addressForm.nif}
                    onChange={(e) => setAddressForm({ ...addressForm, nif: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email facturación *</label>
                  <input
                    type="email"
                    value={addressForm.emailFacturacion}
                    onChange={(e) => setAddressForm({ ...addressForm, emailFacturacion: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  if (addressForm.nombre && addressForm.linea1 && addressForm.ciudad && addressForm.codigoPostal && addressForm.nif && addressForm.emailFacturacion) {
                    setAddress(addressForm);
                    setStep(2);
                  }
                }}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                Continuar
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Método de envío</h2>

              <div className="space-y-3">
                {[
                  { id: 'standard', name: 'Estándar (3-5 días)', price: 'Gratis' },
                  { id: 'express', name: 'Express (1-2 días)', price: '+9.99€' },
                ].map((method) => (
                  <label
                    key={method.id}
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                      shippingMethod === method.id
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping"
                        value={method.id}
                        checked={shippingMethod === method.id}
                        onChange={() => setShippingMethod(method.id)}
                        className="w-4 h-4 text-primary"
                      />
                      <span className="font-medium">{method.name}</span>
                    </div>
                    <span className="text-gray-600">{method.price}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Pago</h2>

              {/* Coupon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cupón de descuento</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Código de cupón"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                  <button
                    onClick={handleValidateCoupon}
                    disabled={validatingCoupon || !couponCode}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {validatingCoupon ? '...' : 'Aplicar'}
                  </button>
                </div>
                {couponValid && (
                  <p className="text-green-600 text-sm mt-1">
                    Cupón aplicado: -{currencySymbol}{couponDiscount.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Método de pago</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer">
                    <input
                      type="radio"
                      name="payment"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={() => setPaymentMethod('card')}
                      className="w-4 h-4 text-primary"
                    />
                    <span>Tarjeta de crédito/débito</span>
                  </label>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Atrás
                </button>
                <button
                  onClick={handleCreateOrder}
                  disabled={isProcessing}
                  className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Procesando...' : `Pagar ${currencySymbol}${(subtotal - couponDiscount).toFixed(2)}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border p-6 sticky top-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen del pedido</h2>

            <div className="space-y-3 mb-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.nombre}</p>
                    <p className="text-xs text-gray-500">Cantidad: {item.cantidad}</p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {currencySymbol}{(item.precioUnitario * item.cantidad).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{currencySymbol}{subtotal.toFixed(2)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Descuento</span>
                  <span>-{currencySymbol}{couponDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span>{currencySymbol}{(subtotal - couponDiscount).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
