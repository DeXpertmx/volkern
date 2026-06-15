'use client'

import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PLANS, PLAN_PRICES, PLAN_FEATURES, PLAN_LIMITS } from '@/lib/plans'
import { Check, Loader2, ArrowRight } from 'lucide-react'

const PLANS_DATA = [
  {
    key: PLANS.ESENCIAL,
    name: 'Esencial',
    desc: 'Para autónomos y gestorías pequeñas que empiezan',
    price: PLAN_PRICES[PLANS.ESENCIAL],
    features: PLAN_FEATURES[PLANS.ESENCIAL],
    highlighted: false,
    badge: '',
    color: 'from-slate-50 to-white',
    border: 'border-slate-200',
    btnClass: 'bg-slate-900 text-white hover:bg-slate-800',
  },
  {
    key: PLANS.PROFESIONAL,
    name: 'Profesional',
    desc: 'Para PYMES y gestorías en crecimiento',
    price: PLAN_PRICES[PLANS.PROFESIONAL],
    features: PLAN_FEATURES[PLANS.PROFESIONAL],
    highlighted: true,
    badge: 'Más popular',
    color: 'from-indigo-50 to-white',
    border: 'border-indigo-500 ring-2 ring-indigo-500',
    btnClass: 'bg-indigo-600 text-white hover:bg-indigo-700',
  },
  {
    key: PLANS.INFINITY,
    name: 'Infinity',
    desc: 'Para empresas y despachos grandes',
    price: PLAN_PRICES[PLANS.INFINITY],
    features: PLAN_FEATURES[PLANS.INFINITY],
    highlighted: false,
    badge: '',
    color: 'from-slate-50 to-white',
    border: 'border-slate-200',
    btnClass: 'bg-slate-900 text-white hover:bg-slate-800',
  },
]

const COMPARISON_ROWS = [
  { label: 'Usuarios', esencial: '2', profesional: '5', infinity: '15' },
  { label: 'Contactos', esencial: '1.000', profesional: '5.000', infinity: 'Ilimitados' },
  { label: 'Emails marketing/mes', esencial: '2.500', profesional: '10.000', infinity: 'Ilimitados' },
  { label: 'AI conversaciones/mes', esencial: '500', profesional: '2.000', infinity: '10.000' },
  { label: 'Almacenamiento', esencial: '5 GB', profesional: '25 GB', infinity: '100 GB' },
  { label: 'Landing pages', esencial: '5', profesional: '20', infinity: 'Ilimitadas' },
  { label: 'Automatizaciones', esencial: '5 activas', profesional: '20 activas', infinity: 'Ilimitadas' },
  { label: 'Cursos LMS', esencial: '5', profesional: '20', infinity: 'Ilimitados' },
  { label: 'Estudiantes', esencial: '50', profesional: '500', infinity: 'Ilimitados' },
  { label: 'Facturas/mes', esencial: '50', profesional: '500', infinity: 'Ilimitadas' },
  { label: 'Dominio propio', esencial: '—', profesional: '—', infinity: '✅' },
  { label: 'Soporte', esencial: 'Email', profesional: 'Prioritario', infinity: 'Dedicado' },
]

const MODULE_GROUPS = [
  {
    group: 'CRM & Ventas',
    items: ['Leads y contactos', 'Pipeline de ventas', 'Cotizaciones y contratos', 'Órdenes de venta', 'Pronósticos y scoring', 'Tareas y analytics'],
  },
  {
    group: 'Marketing',
    items: ['Campañas multicanal', 'Email marketing', 'Redes sociales', 'Formularios inteligentes', 'Segmentación de audiencias'],
  },
  {
    group: 'Web Creator',
    items: ['Landing pages (Puck CMS)', 'Componentes visuales', 'SEO integrado', 'Dominio personalizado'],
  },
  {
    group: 'Chatbot IA',
    items: ['WhatsApp + Web + Telegram', 'Memoria persistente', 'RAG con base de conocimiento', 'Derivación a humano'],
  },
  {
    group: 'Contabilidad & Fiscal',
    items: ['PGC completo', 'Asientos contables', 'Balance y cuenta de resultados', 'IVA (4%, 10%, 21%)', 'Modelos AEAT (303, 130, 111, 390)', 'Verifactu', 'Conciliación bancaria', 'Importación Sage/Microdata'],
  },
  {
    group: 'LMS / Academia',
    items: ['Cursos con módulos', 'Quizzes y evaluaciones', 'Certificados digitales', 'Portal de estudiante'],
  },
  {
    group: 'RRHH',
    items: ['Empleados y organigrama', 'Control horario (GPS + selfie)', 'Nóminas España', 'Vacaciones y ausencias'],
  },
  {
    group: 'Logística & Producción',
    items: ['Flota y GPS', 'Almacenes e inventario', 'Envíos y tracking', 'BOM y órdenes de producción', 'Control de calidad'],
  },
  {
    group: 'Extras',
    items: ['Proyectos', 'Portal de cliente', 'Telefonía VoIP', 'API completa', 'Integraciones (n8n, webhooks)', 'Canva', 'Firma digital'],
  },
]

export default function PreciosPage() {
  const [annual, setAnnual] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const { data: session } = useSession()
  const router = useRouter()

  const handleSubscribe = async (planKey: string) => {
    if (!session) {
      router.push(`/auth/login?callbackUrl=/precios`)
      return
    }

    setLoading(planKey)
    try {
      const res = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: planKey, interval: annual ? 'yearly' : 'monthly' }),
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        alert(data.error || 'Error al crear la suscripción')
      }
    } catch {
      alert('Error de conexión')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950">
      {/* Nav placeholder */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="text-white font-bold text-xl">Volkern</span>
          <a href="/auth/login" className="text-sm text-slate-400 hover:text-white transition-colors">
            Iniciar sesión
          </a>
        </div>
      </div>

      {/* Hero */}
      <div className="relative pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Un solo plan.
            <br />
            <span className="text-indigo-400">Todo incluido.</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            CRM, Ventas, Marketing, Contabilidad, LMS, RRHH, Logística, Producción...
            <br />
            Todas las herramientas en un solo lugar. Solo escalas en capacidad.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-4 bg-slate-900/50 rounded-full p-1.5 border border-slate-800">
            <button
              onClick={() => setAnnual(false)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${!annual ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${annual ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Anual
              <span className="ml-1.5 text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">-20%</span>
            </button>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {PLANS_DATA.map((plan) => {
            const price = annual ? plan.price.yearly : plan.price.monthly
            const periodLabel = annual ? '/año' : '/mes'
            const monthlyEquivalent = annual ? Math.round(plan.price.yearly / 12) : null

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border ${plan.border} bg-gradient-to-b ${plan.color} p-8 flex flex-col transition-all duration-300 hover:shadow-2xl hover:-translate-y-1`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg">
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-2xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                <p className="text-sm text-slate-500 mb-6">{plan.desc}</p>

                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-slate-900">€{price}</span>
                  <span className="text-slate-500 ml-1">{periodLabel}</span>
                  {annual && monthlyEquivalent && (
                    <p className="text-sm text-slate-500 mt-1">
                      €{monthlyEquivalent}/mes facturado anual
                    </p>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.key)}
                  disabled={loading === plan.key}
                  className={`w-full py-3.5 px-6 rounded-xl text-center font-semibold transition-all flex items-center justify-center gap-2 ${plan.btnClass} disabled:opacity-50`}
                >
                  {loading === plan.key ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Comenzar ahora
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="bg-white py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-4">
            Comparativa completa
          </h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
            Todas las funcionalidades están incluidas en todos los planes.
            Solo cambian los límites.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-4 pr-4 font-semibold text-slate-900">Feature</th>
                  <th className="text-center py-4 px-4 font-semibold text-slate-900">Esencial</th>
                  <th className="text-center py-4 px-4 font-semibold text-indigo-600 bg-indigo-50/50">Profesional</th>
                  <th className="text-center py-4 pl-4 font-semibold text-slate-900">Infinity</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100">
                    <td className="py-3.5 pr-4 text-slate-700">{row.label}</td>
                    <td className="py-3.5 px-4 text-center text-slate-600">{row.esencial}</td>
                    <td className="py-3.5 px-4 text-center text-indigo-700 bg-indigo-50/30 font-medium">{row.profesional}</td>
                    <td className="py-3.5 pl-4 text-center text-slate-600">{row.infinity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div className="bg-slate-50 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-4">
            Todos los módulos incluidos
          </h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">
            No hay módulos bloqueados ni versiones limitadas.
            Cada plan accede a la misma plataforma completa.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULE_GROUPS.map((group) => (
              <div key={group.group} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-3">{group.group}</h3>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
            Preguntas frecuentes
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">¿Puedo cambiar de plan después?</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Sí. Puedes subir o bajar de plan en cualquier momento. Al subir, se prorratea el coste del mes en curso.
                Al bajar, el nuevo precio aplica desde el siguiente ciclo de facturación.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">¿Hay periodo de prueba?</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Sí, 14 días gratuitos con acceso completo a todas las funcionalidades. Sin compromiso ni datos de tarjeta.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Si soy gestoría, ¿puedo gestionar varios clientes?</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Sí. Cada cliente se gestiona como un contacto con su contabilidad independiente.
                El plan limita el número de contactos, pero cada contacto puede tener su propio PGC, asientos y modelos fiscales.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">¿Ofrecen descuento para agencias?</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Sí. Tenemos planes específicos para agencias con slots de cliente y marca blanca.
                Contáctanos para más información.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA final */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Empieza hoy. Cancela cuando quieras.
          </h2>
          <p className="text-indigo-200 mb-8 text-lg">
            Sin contratos largos. Sin sorpresas. Todo incluido desde el día 1.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="/signup"
              className="bg-white text-indigo-700 px-8 py-3.5 rounded-xl font-semibold hover:bg-indigo-50 transition-colors shadow-lg"
            >
              Probar gratis 14 días
            </a>
            <a
              href="/#demo"
              className="text-white border border-indigo-400 px-8 py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
            >
              Solicitar demo
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
