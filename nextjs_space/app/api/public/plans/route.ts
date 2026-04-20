import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbPlans = await prisma.subscriptionPlan.findMany({
      where: { 
        activo: true,
        esPublico: true 
      },
      orderBy: { precio: 'asc' }
    });

    const plans = dbPlans.map(plan => {
      const features = (plan.features as any)?.ui_features || [];
      const displayFeatures = features.length > 0 ? features : [
        `${plan.limiteUsuarios === -1 ? 'Usuarios ilimitados' : 'Hasta ' + plan.limiteUsuarios + ' usuarios'}`,
        `${plan.limiteLeads === -1 ? 'Leads ilimitados' : 'Hasta ' + plan.limiteLeads + ' leads'}`,
        `${plan.limiteStorage} GB almacenamiento`,
      ];

      return {
        id: plan.id,
        name: plan.nombre,
        price: plan.precio,
        currency: plan.moneda === 'MXN' ? '$' : '€',
        period: plan.intervalo === 'mensual' ? 'mes' : 'año',
        description: plan.descripcion || '',
        features: displayFeatures,
        popular: plan.esPopular,
        slug: plan.slug
      };
    });

    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching plans API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
