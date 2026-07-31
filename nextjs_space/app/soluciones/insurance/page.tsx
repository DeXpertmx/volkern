import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import InsuranceLanding from '@/components/public/InsuranceLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern Insurance | El primer agente IA que trabaja tu cartera de seguros',
  description: 'Centraliza pólizas, detecta renovaciones, encuentra oportunidades de venta cruzada y gestiona tu cartera con IA. CRM de seguros para agentes y corredurías.',
  openGraph: {
    title: 'Volkern Insurance — IA que trabaja tu cartera mientras duermes',
    description: 'Centraliza pólizas, detecta renovaciones, encuentra oportunidades de venta cruzada y gestiona tu cartera con IA. Desde €99/mes.',
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
