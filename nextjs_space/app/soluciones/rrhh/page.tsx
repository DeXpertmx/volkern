import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import RRHHLanding from '@/components/public/RRHHLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern para Recursos Humanos | Gestiona tu equipo sin caos',
  description: 'Centraliza empleados, procesos, comunicación y documentación en un solo sistema. Gestión de personal, documentación y automatización para RRHH.',
  openGraph: {
    title: 'Volkern para Recursos Humanos — Gestiona tu equipo sin caos',
    description: 'Centraliza empleados, procesos, comunicación y documentación en un solo sistema. Gestión de personal, documentación y automatización para RRHH.',
    images: ['/og-rrhh.png'],
  },
};

export default function RRHHPage() {
  return (
    <PublicLayout>
      <RRHHLanding />
    </PublicLayout>
  );
}
