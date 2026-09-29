'use client';

/**
 * Volkern Hospitality — Portada del módulo.
 *
 * Con `?edit=<propertyId>` muestra el editor por secciones (el mismo patrón
 * que Real Estate); sin él, la portada de siempre. `useSearchParams` exige el
 * límite de Suspense para el prerender.
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PropertyEditorHospedaje } from '@/components/hospitality/PropertyEditorHospedaje';
import PortadaHospitality from './PortadaHospitality';

export default function HospitalityPage() {
  return (
    <Suspense fallback={null}>
      <HospitalityInner />
    </Suspense>
  );
}

function HospitalityInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  if (editId) {
    return (
      <PropertyEditorHospedaje
        propertyId={editId}
        onBack={() => router.push('/dashboard/hospitality', { scroll: false })}
      />
    );
  }

  return <PortadaHospitality />;
}
