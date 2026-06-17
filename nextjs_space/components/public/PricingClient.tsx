'use client'

import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PLANS, PLAN_FEATURES } from '@/lib/plans'
import { Check, Loader2, ArrowRight, Zap, Shield } from 'lucide-react'
import { PublicLayout } from '@/components/public/PublicLayout'

const PLANS_DATA = [
  {
    id: PLANS.SCALE,
    nombre: 'Scale',
    descripcion: 'Escala tu operación sin límites. Precio dinámico según usuarios y contactos.',
    slug: PLANS.SCALE,
    precioLabel: 'Desde €50+/mes',
    precioYearlyLabel: 'Desde €40+/mes',
    icon: Zap,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
    badgeColor: 'bg-purple-600',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-900/10',
    shadowColor: 'shadow-purple-500/10',
    popular: true,
    features: PLAN_FEATURES[PLANS.SCALE],
  },
  {
    id: PLANS.COMPLIANCE,
    nombre: 'Compliance Pro',
    descripcion: 'Control total, trazabilidad y auditoría. Precio dinámico con +25% sobre Scale.',
    slug: PLANS.COMPLIANCE,
    precioLabel: 'Desde €62+/mes',
    precioYearlyLabel: 'Desde €50+/mes',
    icon: Shield,
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-400',
    badgeColor: 'bg-indigo-600',
    borderColor: 'border-indigo-500',
    bgColor: 'bg-indigo-900/10',
    shadowColor: 'shadow-indigo-500/10',
    popular: false,
    features: PLAN_FEATURES[PLANS.COMPLIANCE],
  },
  {
    id: 'compliance_pro',
    nombre: 'Compliance PRO',
    descripcion: 'Add-on de trazabilidad forense y auditoría avanzada para tu plan base',
    slug: 'compliance_pro',
    precioLabel: '€149/mes',
    precioYearlyLabel: '€1.430/año',
    icon: Shield,
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-400',
    badgeColor: 'bg-indigo-600',
    borderColor: 'border-indigo-500/50',
    bgColor: '',
    shadowColor: '',
    popular: false,
    isAddon: true,
    features: [
      'Compliance Gate (procesos obligatorios)',
      'Score de cumplimiento en tiempo real',
      'Alertas inteligentes con 4 detectores',
      'Trazabilidad SHA-256 encadenada',
      'Panel de auditoría para el cliente',
      'Exportación GDPR (acceso + olvido)',
      'PDF certificado descargable',
      'Webhooks auditables',
    ],
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
      if (plan.isAddon) {
        // Add-on: redirigir al dashboard de billing
        if (!session) {
          await signIn('credentials', { redirect: false })
          return
        }
        router.push('/dashboard/configuracion/billing')
        return
      }

      // Planes dinámicos: redirigir al configurador de precios
      router.push('/precios')
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
            <p className="text-slate-500 text-sm mt-2">
              Los precios se calculan en tiempo real según usuarios y contactos.
              <br />
              <a href="/precios" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">
                Usa el configurador dinámico
              </a>
              {' '}para ver tu precio exacto.
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
                Anual <span className="text-[10px] text-purple-300 ml-0.5">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PLANS_DATA.map((plan) => {
              const Icon = plan.icon

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border p-8 flex flex-col ${
                    plan.popular
                      ? `${plan.borderColor} ${plan.bgColor} ${plan.shadowColor} shadow-xl`
                      : plan.isAddon
                        ? `${plan.borderColor} bg-slate-900/50`
                        : 'border-slate-800 bg-slate-900/50'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                      RECOMENDADO
                    </span>
                  )}
                  {plan.isAddon && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                      ADD-ON
                    </span>
                  )}

                  {/* Icon & Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`h-10 w-10 rounded-xl ${plan.iconBg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${plan.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{plan.nombre}</h3>
                      {plan.isAddon && (
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">+ plan base requerido</p>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm mb-6">{plan.descripcion}</p>

                  {/* Price */}
                  <div className="mb-6">
                    {plan.isAddon ? (
                      <>
                        <span className="text-4xl font-bold">
                          {isAnnual ? plan.precioYearlyLabel : plan.precioLabel}
                        </span>
                      </>
                    ) : (
                      <div>
                        <span className="text-2xl font-bold text-purple-400">{isAnnual ? plan.precioYearlyLabel : plan.precioLabel}</span>
                        <p className="text-xs text-slate-500 mt-1">
                          Precio final según usuarios y contactos
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Features */}
                  <div className="flex-grow space-y-3 mb-8">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Incluye
                    </p>
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check className={`w-4 h-4 mt-0.5 shrink-0 ${
                          plan.isAddon ? 'text-green-400' : 'text-emerald-400'
                        }`} />
                        <span className="text-sm text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleSelect(plan)}
                    disabled={loadingPlan === plan.id}
                    className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                      plan.isAddon
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        : plan.popular
                          ? 'bg-purple-600 hover:bg-purple-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                    } disabled:opacity-50`}
                  >
                    {loadingPlan === plan.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        {plan.isAddon
                          ? 'Activar Compliance PRO'
                          : 'Ver precio exacto'
                        }
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Legacy note */}
          <div className="mt-12 text-center">
            <p className="text-xs text-slate-600">
              ¿Tienes un plan Esencial, Profesional o Infinity?{' '}
              <a href="/dashboard/configuracion/billing" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">
                Ver detalles en billing
              </a>
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
