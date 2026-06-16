import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import LogisticaLanding from '@/components/public/LogisticaLanding';

export const metadata = {
  title: 'Volkern para Logística | Controla tu operación logística en tiempo real',
  description: 'Gestiona rutas, vehículos, entregas y comunicación desde un solo sistema. Gestión logística, tracking y automatización para operaciones de transporte.',
};

export default function LogisticaPage() {
  return (
    <PublicLayout>
      <LogisticaLanding />
    </PublicLayout>
  );
}
