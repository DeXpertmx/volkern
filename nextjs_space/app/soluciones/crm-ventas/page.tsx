import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import CrmVentasLanding from '@/components/public/CrmVentasLanding';

export const metadata = {
  title: 'Volkern CRM Ventas | Convierte más oportunidades en ventas',
  description: 'Gestiona leads, pipeline y cierra más ventas con un sistema claro y automatizado. CRM, automatización y seguimiento comercial integrados.',
};

export default function CrmVentasPage() {
  return (
    <PublicLayout>
      <CrmVentasLanding />
    </PublicLayout>
  );
}
