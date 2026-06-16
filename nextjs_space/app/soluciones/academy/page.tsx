import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import AcademyLanding from '@/components/public/AcademyLanding';

export const metadata = {
  title: 'Volkern para Academias | Crea, vende y automatiza tu academia online',
  description: 'Crea cursos, vende con pagos integrados y automatiza tu academia desde un solo sistema. LMS, CRM y automatización para creadores de contenido.',
};

export default function AcademyPage() {
  return (
    <PublicLayout>
      <AcademyLanding />
    </PublicLayout>
  );
}
