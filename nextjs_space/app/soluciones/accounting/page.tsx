import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import AccountingLanding from '@/components/public/AccountingLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern para Asesorías Contables | Controla tu operación contable',
  description: 'Gestiona clientes, documentos, pagos y procesos en un solo sistema. CRM, gestión documental, automatización y firma digital para despachos contables.',
  openGraph: {
    title: 'Volkern para Asesorías Contables — Controla tu operación contable',
    description: 'Gestiona clientes, documentos, pagos y procesos en un solo sistema. CRM, gestión documental, automatización y firma digital para despachos contables.',
    images: ['/og-contable.png'],
  },
};

export default function AccountingPage() {
  return (
    <PublicLayout>
      <AccountingLanding />
    </PublicLayout>
  );
}
