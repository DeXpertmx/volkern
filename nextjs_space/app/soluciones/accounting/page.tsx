import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import AccountingLanding from '@/components/public/AccountingLanding';

export const metadata = {
  title: 'Volkern para Asesorías Contables | Controla tu operación contable',
  description: 'Gestiona clientes, documentos, pagos y procesos en un solo sistema. CRM, gestión documental, automatización y firma digital para despachos contables.',
};

export default function AccountingPage() {
  return (
    <PublicLayout>
      <AccountingLanding />
    </PublicLayout>
  );
}
