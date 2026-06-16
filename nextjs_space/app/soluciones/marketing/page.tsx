import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import MarketingLanding from '@/components/public/MarketingLanding';

export const metadata = {
  title: 'Volkern para Agencias de Marketing | Lanza, automatiza y convierte',
  description: 'Gestiona leads, campañas, seguimiento y comunicación desde un solo sistema. Automatización de marketing, CRM y analítica integrados.',
};

export default function MarketingPage() {
  return (
    <PublicLayout>
      <MarketingLanding />
    </PublicLayout>
  );
}
