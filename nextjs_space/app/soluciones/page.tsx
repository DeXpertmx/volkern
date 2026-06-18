import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import SolucionesIndex from '@/components/public/SolucionesIndex';

export const metadata = {
  title: 'Volkern Soluciones | CRM, Marketing, Real Estate y más',
  description:
    'Explora todas las soluciones verticales de Volkern: CRM & Ventas, Marketing, Real Estate, Accounting, RRHH, Industria y Academy. Un sistema para todo tu negocio.',
};

export default function SolucionesPage() {
  return (
    <PublicLayout>
      <SolucionesIndex />
    </PublicLayout>
  );
}
