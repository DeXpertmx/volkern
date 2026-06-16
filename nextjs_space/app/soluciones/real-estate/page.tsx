import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import RealEstateLanding from '@/components/public/RealEstateLanding';

export const metadata = {
  title: 'Volkern para Inmobiliarias | Gestiona propiedades, clientes y cierres',
  description: 'Centraliza leads, propiedades, seguimiento y comunicación en un solo sistema. CRM inmobiliario, automatización y firma digital incluidos.',
};

export default function RealEstatePage() {
  return (
    <PublicLayout>
      <RealEstateLanding />
    </PublicLayout>
  );
}
