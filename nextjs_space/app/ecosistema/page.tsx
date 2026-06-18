import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import EcosistemaLanding from '@/components/public/EcosistemaLanding';

export const metadata = {
  title: 'Volkern Ecosistema | Un solo sistema para gestionar todo tu negocio',
  description:
    'Volkern conecta todas las áreas de tu empresa en una sola plataforma: CRM, ventas, marketing, real estate, accounting, RRHH, industria y academy. Escala sin cambiar de sistema.',
};

export default function EcosistemaPage() {
  return (
    <PublicLayout>
      <EcosistemaLanding />
    </PublicLayout>
  );
}
