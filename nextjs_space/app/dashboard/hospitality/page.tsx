'use client';

/**
 * Volkern Hospitality — Portada del módulo.
 *
 * Con `?edit=<propertyId>` muestra el editor por secciones (el mismo patrón
 * que Real Estate); con `?unit=<unitId>`, el editor guiado de UNIDAD (mismo
 * UX que el de propiedad: sidebar con progreso, secciones y vista global).
 * Sin query params, la portada de siempre. `useSearchParams` exige el límite
 * de Suspense para el prerender.
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PropertyEditorHospedaje } from '@/components/hospitality/PropertyEditorHospedaje';
import { UnitEditorHospedaje } from '@/components/hospitality/UnitEditorHospedaje';
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
  const unitId = searchParams.get('unit');

  // La unidad manda: es la ficha más granular y, si viene junto a ?edit=,
  // el usuario pidió expresamente la unidad (?edit=<prop>&unit=<unidad>).
  if (unitId) {
    return (
      <UnitEditorHospedaje
        unitId={unitId}
        onBack={() => {
          if (editId) {
            router.push(`/dashboard/hospitality?edit=${editId}`, { scroll: false });
          } else {
            router.push('/dashboard/hospitality', { scroll: false });
          }
        }}
      />
    );
  }

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
