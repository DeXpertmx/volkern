import React from 'react';
import NetingLanding from '@/components/public/NetingLanding';
import { PublicLayout } from '@/components/public/PublicLayout';

export const metadata = {
  title: 'Neting · Promoción Exclusiva Volkern CRM | 20% OFF',
  description:
    'Promoción exclusiva para miembros de Neting: 20% OFF en el CRM y Ventas de Volkern. Plan anual €470/año o mensual €39/mes con Setup Asistido bonificado. Acceso exclusivo con recomendación.',
  keywords: [
    'CRM',
    'Neting',
    'Volkern',
    '20% descuento',
    'promoción CRM',
    'CRM ventas',
    'automatización ventas',
  ],
  openGraph: {
    title: 'Neting · Promoción Exclusiva Volkern CRM',
    description:
      '20% OFF exclusivo miembros Neting · Plan anual €470/año o mensual €39/mes · Setup Asistido bonificado.',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function NetingPage() {
  return (
    <PublicLayout>
      <NetingLanding />
    </PublicLayout>
  );
}
