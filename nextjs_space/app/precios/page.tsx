import React from 'react';
import PricingPage from '@/components/public/PricingPage';
import { Metadata } from 'next';
import { VERTICAL_PLANS } from '@/lib/vertical-plans';
import { TRIAL_DAYS } from '@/lib/plans';
import { MONEDA_PLATAFORMA, simboloMoneda } from '@/lib/moneda';

// La lista de precios y los días de prueba se GENERAN desde la fuente real de la
// aplicación, y el signo de la divisa sale de `lib/moneda`. Escribirlos aquí a
// mano es justo lo que dejó a la portada anunciando un precio viejo mientras el
// cobro leía una tabla distinta.
const SIGNO = simboloMoneda(MONEDA_PLATAFORMA);
const PRECIO_MINIMO = Math.min(...VERTICAL_PLANS.map((v) => v.price));
const LISTA_DE_PRECIOS = VERTICAL_PLANS.map((v) =>
  v.id === 'crm_ventas'
    ? `${v.name} desde ${SIGNO}${v.price}/usuario`
    : `${v.name} ${SIGNO}${v.price}`,
).join(', ');

export const metadata: Metadata = {
  title: `Precios | Volkern — CRM desde ${SIGNO}${PRECIO_MINIMO}/usuario/mes`,
  description: `Planes y precios de Volkern por vertical: ${LISTA_DE_PRECIOS}. ${TRIAL_DAYS} días gratis.`,
  openGraph: {
    title: 'Precios — Volkern',
    description: `Planes claros por vertical desde ${SIGNO}${PRECIO_MINIMO}/mes. ${TRIAL_DAYS} días gratis, sin permanencia.`,
    images: ['/og-precios.png'],
  },
};

export default function PreciosPage() {
  return <PricingPage />;
}
