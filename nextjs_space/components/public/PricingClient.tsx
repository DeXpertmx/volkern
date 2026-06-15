'use client'

import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PLANS, PLAN_PRICES, PLAN_FEATURES, PLAN_LIMITS } from '@/lib/plans'
import { Check, Loader2, ArrowRight } from 'lucide-react'
import { PublicLayout } from '@/components/public/PublicLayout'

const PLANS_DATA = [
  {
    id: PLANS.ESENCIAL,
    nombre: 'Esencial',
    descripcion: 'Para autónomos y gestorías pequeñas que empiezan',
    slug: PLANS.ESENCIAL,
    precio: PLAN_PRICES[PLANS.ESENCIAL].monthly,
    precioYearly: PLAN_PRICES[PLANS.ESENCIAL].yearly,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: PLAN_LIMITS[PLANS.ESENCIAL].users,
    limiteLeads: PLAN_LIMITS[PLANS.ESENCIAL].leads,
    popular: false,
  },
  {
    id: PLANS.PROFESIONAL,
    nombre: 'Profesional',
    descripcion: 'Para PYMES y gestorías en crecimiento',
    slug: PLANS.PROFESIONAL,
    precio: PLAN_PRICES[PLANS.PROFESIONAL].monthly,
    precioYearly: PLAN_PRICES[PLANS.PROFESIONAL].yearly,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: PLAN_LIMITS[PLANS.PROFESIONAL].users,
    limiteLeads: PLAN_LIMITS[PLANS.PROFESIONAL].leads,
    popular: true,
  },
  {
    id: PLANS.INFINITY,
    nombre: 'Infinity',
    descripcion: 'Para empresas y despachos grandes',
    slug: PLANS.INFINITY,
    precio: PLAN_PRICES[PLANS.INFINITY].monthly,
    precioYearly: PLAN_PRICES[PLANS.INFINITY].yearly,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: PLAN_LIMITS[PLANS.INFINITY].users,
    limiteLeads: PLAN_LIMITS[PLANS.INFINITY].leads,
    popular: false,
  },
]

export default function PricingClient() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const { data: session } = useSession()
  const router = useRouter()

  const handleSelect = async (plan: typeof PLANS_DATA[0]) => {
    setLoadingPlan(plan.id)
    try {
      if (!session) {
        await signIn('credentials', {
          redirect: false,
          plan: plan.slug,
        })
        return
      }
      const res = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          interval: isAnnual ? 'yearly' : 'monthly',
        }),
      })
      if (!res.ok) throw new Error('Error creating subscription')
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      // Fallback redirect or show error
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <PublicLayout>
      <div className="min-h-screen bg-slate-950 pt-28 pb-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Planes</h1>
            <p className="text-slate-400 text-lg">
              Elige el plan que mejor se adapte a tu negocio
            </p>
          </div>

          <div className="flex justify-center mb-10">
            <div className="bg-slate-800/50 rounded-full p-1 flex gap-1">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  !isAnnual ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  isAnnual ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Anual
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {PLANS_DATA.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-8 flex flex-col ${
                  plan.popular
                    ? 'border-purple-500 bg-purple-900/10 shadow-xl shadow-purple-500/10'
                    : 'border-slate-800 bg-slate-900/50'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                )}

                <h3 className="text-2xl font-bold mb-2">{plan.nombre}</h3>
                <p className="text-slate-400 text-sm mb-6">{plan.descripcion}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    {isAnnual ? plan.precioYearly : plan.precio}
                  </span>
                  <span className="text-slate-400 ml-2">
                    {plan.moneda}/{isAnnual ? 'año' : 'mes'}
                  </span>
                </div>

                <div className="flex-grow space-y-3 mb-8">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Incluye
                  </p>
                  {(PLAN_FEATURES[plan.id as keyof typeof PLAN_FEATURES] || []).map(
                    (feature: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-slate-300">{feature}</span>
                      </div>
                    )
                  )}
                </div>

                <button
                  onClick={() => handleSelect(plan)}
                  disabled={loadingPlan === plan.id}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                    plan.popular
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  } disabled:opacity-50`}
                >
                  {loadingPlan === plan.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {session ? 'Suscribirse' : 'Comenzar gratis'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
