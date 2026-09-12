import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import InsuranceLanding from '@/components/public/InsuranceLanding';
import { MONEDA_PLATAFORMA, formatearImporte } from '@/lib/moneda';

import { Metadata } from 'next';

/** Precio de entrada del vertical, en la divisa en la que Volkern factura sus planes. */
const PRECIO_DESDE = formatearImporte(99, MONEDA_PLATAFORMA, 0);

export const metadata: Metadata = {
  title: 'Volkern Insurance | El agente IA para tu cartera de seguros',
  description: 'Centraliza pólizas, detecta renovaciones, gestiona tu cartera con briefing diario IA y forecast por ramo. CRM de seguros para agentes y corredurías.',
  openGraph: {
    title: 'Volkern Insurance — Briefing diario IA y forecast por ramo',
    description: `Centraliza pólizas, detecta renovaciones y gestiona tu cartera con IA. Briefing diario, forecast estacional y Mapa de Cartera. Desde ${PRECIO_DESDE}/mes.`,
    images: ['/og-insurance.png'],
  },
};

export default function InsurancePage() {
  return (
    <PublicLayout>
      <InsuranceLanding />
    </PublicLayout>
  );
}
