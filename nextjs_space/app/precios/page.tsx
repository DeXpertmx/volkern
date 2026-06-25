import React from 'react';
import PricingPage from '@/components/public/PricingPage';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Precios | Volkern — Planes claros por vertical desde €19/mes',
  description: 'Planes y precios de Volkern por vertical: CRM €49, Marketing €49, Academia €49, Contabilidad €59, RRHH €39, Inmobiliaria €59, Industria €59, Facturación €19. 14 días gratis.',
  openGraph: {
    title: 'Precios — Volkern',
    description: 'Planes claros por vertical desde €19/mes. 14 días gratis, sin permanencia.',
    images: ['/og-precios.png'],
  },
};

export default function PreciosPage() {
  return <PricingPage />;
}
