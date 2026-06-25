import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import MarketingLanding from '@/components/public/MarketingLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern para Agencias de Marketing | Lanza, automatiza y convierte',
  description: 'Gestiona leads, campañas, seguimiento y comunicación desde un solo sistema. Automatización de marketing, CRM y analítica integrados.',
  openGraph: {
    title: 'Volkern para Agencias de Marketing — Lanza, automatiza y convierte',
    description: 'Gestiona leads, campañas, seguimiento y comunicación desde un solo sistema. Automatización de marketing, CRM y analítica integrados.',
    images: ['/og-marketing.png'],
  },
};

export default function MarketingPage() {
  return (
    <PublicLayout>
      <MarketingLanding />
    </PublicLayout>
  );
}
