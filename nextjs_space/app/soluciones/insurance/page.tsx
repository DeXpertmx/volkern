import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import InsuranceLanding from '@/components/public/InsuranceLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern Insurance | El agente IA para tu cartera de seguros',
  description: 'Centraliza pólizas, detecta renovaciones, gestiona tu cartera con briefing diario IA y forecast por ramo. CRM de seguros para agentes y corredurías.',
  openGraph: {
    title: 'Volkern Insurance — Briefing diario IA y forecast por ramo',
    description: 'Centraliza pólizas, detecta renovaciones y gestiona tu cartera con IA. Briefing diario, forecast estacional y Mapa de Cartera. Desde €99/mes.',
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
