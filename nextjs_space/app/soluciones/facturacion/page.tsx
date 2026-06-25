import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import FacturacionLanding from '@/components/public/FacturacionLanding';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern Factura | Factura electrónica y control de cobros para autónomos y pymes',
  description: 'Crea facturas electrónicas, controla cobros y envía a la AEAT. Facturación simple para autónomos, freelancers y microempresas.',
  openGraph: {
    title: 'Volkern Factura — Factura electrónica y control de cobros para autónomos y pymes',
    description: 'Crea facturas electrónicas, controla cobros y envía a la AEAT. Facturación simple para autónomos, freelancers y microempresas.',
    images: ['/og-facturacion.png'],
  },
};

export default function FacturacionPage() {
  return (
    <PublicLayout>
      <FacturacionLanding />
    </PublicLayout>
  );
}
