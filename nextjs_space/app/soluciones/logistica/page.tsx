import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import LogisticaLanding from '@/components/public/LogisticaLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern para Logística | Controla tu operación logística en tiempo real',
  description: 'Gestiona rutas, vehículos, entregas y comunicación desde un solo sistema. Gestión logística, tracking y automatización para operaciones de transporte.',
  openGraph: {
    title: 'Volkern para Logística — Controla tu operación logística en tiempo real',
    description: 'Gestiona rutas, vehículos, entregas y comunicación desde un solo sistema. Gestión logística, tracking y automatización para operaciones de transporte.',
    images: ['/og-logistica.png'],
  },
};

export default function LogisticaPage() {
  return (
    <PublicLayout>
      <LogisticaLanding />
    </PublicLayout>
  );
}
