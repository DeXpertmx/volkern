
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, ArrowLeft, Shield, CreditCard, Zap, Clock } from 'lucide-react';
import { toast } from 'sonner';

const PLANS = {
  STARTER: {
    name: '🟢 Starter',
    price: 49,
    priceYearly: 490,
    features: [
      '2 usuarios incluidos',
      'Leads, Contactos, Empresas',
      'Pipeline de ventas',
      'Tareas y Analytics',
      'Mensajes y Citas',
      'Catálogo y Mi Tarjeta',
      'Campañas básicas',
      '3 automatizaciones'
    ]
  },
  GROWTH: {
    name: '🔵 Growth',
    price: 99,
    priceYearly: 990,
    features: [
      '5 usuarios incluidos',
      'Todo en Starter +',
      'Cotizaciones y Contratos',
      'Órdenes de venta y Pronósticos',
      'Scoring de leads',
      'Chatbot WhatsApp básico',
      'CMS / Landing Pages',
      'Academia (cursos + estudiantes)',
      '20 automatizaciones'
    ]
  },
  PRO: {
    name: '🟣 Pro',
    price: 199,
    priceYearly: 1990,
    features: [
      '10 usuarios incluidos',
      'Todo incluido',
      'Chatbot WhatsApp avanzado',
      'Campañas y email avanzados',
      'Automatizaciones ilimitadas',
      'Academia ilimitada',
      'Integraciones completas + API',
      'Soporte prioritario'
    ]
  }
};

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const planId = searchParams.get('plan')?.toUpperCase() as keyof typeof PLANS;
  const plan = PLANS[planId];

  useEffect(() => {
    if (!planId || !plan) {
      toast.error('Plan no válido');
      router.push('/');
    }
  }, [planId, plan, router]);

  if (!plan) {
    return null;
  }

  const price = billingCycle === 'monthly' ? plan.price : plan.priceYearly;
  const savings = billingCycle === 'yearly' ? (plan.price * 12 - plan.priceYearly) : 0;

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          planId: planId,
          billingCycle 
        })
      });

      const data = await response.json();

      if (response.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(data.error || 'Error al crear checkout');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al procesar el pago');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Image 
              src="/volkern-logo.png" 
              alt="Volkern CRM Logo" 
              width={150} 
              height={40} 
              className="h-10 w-auto"
            />
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4 text-sm">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-[#1a3e6e] text-white rounded-full flex items-center justify-center font-semibold">
                  1
                </div>
                <span className="ml-2 font-medium">Seleccionar Plan</span>
              </div>
              <div className="h-1 w-12 bg-[#1a3e6e]" />
              <div className="flex items-center">
                <div className="h-8 w-8 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center font-semibold">
                  2
                </div>
                <span className="ml-2 text-gray-500">Pago</span>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Left Column - Plan Summary */}
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Resumen del Plan</CardTitle>
                  <CardDescription>
                    Has seleccionado el plan {plan.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Plan Features */}
                  <div>
                    <h3 className="font-semibold mb-3">Características incluidas:</h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-start">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-700">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Billing Cycle Selection */}
                  <div>
                    <h3 className="font-semibold mb-3">Ciclo de facturación:</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setBillingCycle('monthly')}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          billingCycle === 'monthly'
                            ? 'border-[#1a3e6e] bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-semibold">Mensual</div>
                        <div className="text-2xl font-bold text-[#1a3e6e]">
                          {plan.price}€
                        </div>
                        <div className="text-sm text-gray-500">por mes</div>
                      </button>

                      <button
                        onClick={() => setBillingCycle('yearly')}
                        className={`p-4 border-2 rounded-lg transition-all relative ${
                          billingCycle === 'yearly'
                            ? 'border-[#1a3e6e] bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Badge className="absolute -top-2 -right-2 bg-green-500">
                          Ahorra {savings}€
                        </Badge>
                        <div className="font-semibold">Anual</div>
                        <div className="text-2xl font-bold text-[#1a3e6e]">
                          {plan.priceYearly}€
                        </div>
                        <div className="text-sm text-gray-500">por año</div>
                      </button>
                    </div>
                  </div>

                  <Separator />

                  {/* Benefits */}
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600">
                      <Zap className="h-5 w-5 text-[#1a3e6e] mr-3" />
                      <span>Acceso inmediato a todas las funciones</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="h-5 w-5 text-[#1a3e6e] mr-3" />
                      <span>14 días de prueba gratis - cancela cuando quieras</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Shield className="h-5 w-5 text-[#1a3e6e] mr-3" />
                      <span>Pago seguro procesado por Stripe</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Security Notice */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-start space-x-3">
                    <Shield className="h-6 w-6 text-[#1a3e6e] flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-[#1a3e6e] mb-1">
                        Tu información está segura
                      </h4>
                      <p className="text-sm text-gray-700">
                        Utilizamos encriptación SSL de 256 bits y Stripe para procesar pagos de forma segura. 
                        Nunca almacenamos datos de tarjetas de crédito en nuestros servidores.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Order Summary */}
            <div className="md:col-span-1">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Resumen de Pago</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Plan {plan.name}</span>
                      <span className="font-medium">{price}€</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento anual</span>
                        <span>-{savings}€</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-[#1a3e6e]">
                      {price}€
                    </span>
                  </div>

                  <p className="text-xs text-gray-500">
                    {billingCycle === 'monthly' 
                      ? 'Facturado mensualmente' 
                      : 'Facturado anualmente'}
                  </p>

                  <Button
                    onClick={handleCheckout}
                    disabled={loading}
                    className="w-full bg-[#1a3e6e] hover:bg-[#152f54] h-12 text-lg"
                  >
                    {loading ? (
                      'Procesando...'
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-5 w-5" />
                        Proceder al Pago
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-gray-500">
                    Al continuar, aceptas nuestros{' '}
                    <a href="#" className="text-[#1a3e6e] hover:underline">
                      Términos de Servicio
                    </a>
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
