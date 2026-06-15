import { NextResponse } from 'next/server'
import { PLANS, PLAN_FEATURES, PLAN_PRICES } from '@/lib/plans'

export const dynamic = 'force-dynamic'

export async function GET() {
  const plans = [
    {
      slug: PLANS.ESENCIAL,
      name: 'Esencial',
      price: PLAN_PRICES[PLANS.ESENCIAL].monthly,
      priceYearly: PLAN_PRICES[PLANS.ESENCIAL].yearly,
      currency: 'EUR',
      features: PLAN_FEATURES[PLANS.ESENCIAL],
      popular: false,
    },
    {
      slug: PLANS.PROFESIONAL,
      name: 'Profesional',
      price: PLAN_PRICES[PLANS.PROFESIONAL].monthly,
      priceYearly: PLAN_PRICES[PLANS.PROFESIONAL].yearly,
      currency: 'EUR',
      features: PLAN_FEATURES[PLANS.PROFESIONAL],
      popular: true,
    },
    {
      slug: PLANS.INFINITY,
      name: 'Infinity',
      price: PLAN_PRICES[PLANS.INFINITY].monthly,
      priceYearly: PLAN_PRICES[PLANS.INFINITY].yearly,
      currency: 'EUR',
      features: PLAN_FEATURES[PLANS.INFINITY],
      popular: false,
    },
  ]

  return NextResponse.json(plans)
}
