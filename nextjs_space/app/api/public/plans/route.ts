import { NextResponse } from 'next/server'
import { PLANS, PLAN_FEATURES } from '@/lib/plans'
import { MONEDA_PLATAFORMA } from '@/lib/moneda'
import { calcularPrecio } from '@/lib/pricing-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Usar configuración representativa para mostrar precios dinámicos
  const scalePrice = calcularPrecio({ usuarios: 5, contactos: 5000, plan: 'scale' })
  const compliancePrice = calcularPrecio({ usuarios: 5, contactos: 5000, plan: 'compliance' })

  const plans = [
    {
      slug: PLANS.SCALE,
      name: 'Scale',
      price: scalePrice.precio,
      priceYearly: Math.round(scalePrice.precio * 0.8 * 12),
      currency: MONEDA_PLATAFORMA,
      features: PLAN_FEATURES[PLANS.SCALE],
      popular: false,
    },
    {
      slug: PLANS.COMPLIANCE,
      name: 'Compliance Pro',
      price: compliancePrice.precio,
      priceYearly: Math.round(compliancePrice.precio * 0.8 * 12),
      currency: MONEDA_PLATAFORMA,
      features: PLAN_FEATURES[PLANS.COMPLIANCE],
      popular: true,
    },
  ]

  return NextResponse.json(plans)
}
