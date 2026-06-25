import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import IndustriaLanding from '@/components/public/IndustriaLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern para Industria | Controla tu operación industrial con procesos claros',
  description: 'Gestiona tareas, equipos, procesos y documentación desde un solo sistema. Gestión de procesos, tareas y automatización para operaciones industriales.',
  openGraph: {
    title: 'Volkern para Industria — Controla tu operación industrial con procesos claros',
    description: 'Gestiona tareas, equipos, procesos y documentación desde un solo sistema. Gestión de procesos, tareas y automatización para operaciones industriales.',
    images: ['/og-industria.png'],
  },
};

export default function IndustriaPage() {
  return (
    <PublicLayout>
      <IndustriaLanding />
    </PublicLayout>
  );
}
