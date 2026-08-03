import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import SolucionesIndex from '@/components/public/SolucionesIndex';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern Soluciones | CRM, Marketing, Inmobiliario, RRHH y más',
  description:
    'Explora todas las soluciones verticales de Volkern: CRM & Ventas, Marketing, Inmobiliario, Contabilidad, RRHH, Industria, Academy, Logística, Facturación y Seguros. Un sistema para todo tu negocio.',
  openGraph: {
    title: 'Volkern Soluciones — CRM, Marketing, Inmobiliario, RRHH y más',
    description:
      'Explora todas las soluciones verticales de Volkern: CRM, Marketing, Inmobiliario, Contabilidad, RRHH, Industria, Academy, Logística, Facturación y Seguros.',
    images: ['/og-soluciones.png'],
  },
};

export default function SolucionesPage() {
  return (
    <PublicLayout>
      <SolucionesIndex />
    </PublicLayout>
  );
}
