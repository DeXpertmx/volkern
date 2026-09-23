import React from 'react';
import PricingPage from '@/components/public/PricingPage';
import { Metadata } from 'next';
import { VERTICAL_PLANS } from '@/lib/vertical-plans';
import { TRIAL_DAYS } from '@/lib/plans';

// La lista de precios y los días de prueba se GENERAN desde la fuente real de la
// aplicación. Escribirlos aquí a mano es justo lo que dejó a la portada
// anunciando 49 € mientras el cobro leía una tabla distinta.
const PRECIO_MINIMO = Math.min(...VERTICAL_PLANS.map((v) => v.price));
const LISTA_DE_PRECIOS = VERTICAL_PLANS.map((v) => `${v.name} €${v.price}`).join(', ');

export const metadata: Metadata = {
  title: `Precios | Volkern — Planes claros por vertical desde €${PRECIO_MINIMO}/mes`,
  description: `Planes y precios de Volkern por vertical: ${LISTA_DE_PRECIOS}. ${TRIAL_DAYS} días gratis.`,
  openGraph: {
    title: 'Precios — Volkern',
    description: `Planes claros por vertical desde €${PRECIO_MINIMO}/mes. ${TRIAL_DAYS} días gratis, sin permanencia.`,
    images: ['/og-precios.png'],
  },
};

export default function PreciosPage() {
  return <PricingPage />;
}
