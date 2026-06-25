import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import FacturacionLanding from '@/components/public/FacturacionLanding';

export const metadata = {
  title: 'Volkern Factura | Factura electrónica y control de cobros para autónomos y pymes',
  description: 'Crea facturas electrónicas, controla cobros y envía a la AEAT. Facturación simple para autónomos, freelancers y microempresas.',
};

export default function FacturacionPage() {
  return (
    <PublicLayout>
      <FacturacionLanding />
    </PublicLayout>
  );
}
