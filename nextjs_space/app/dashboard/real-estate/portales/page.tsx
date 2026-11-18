'use client';

/**
 * Volkern Real Estate — Portales (sindicación).
 *
 * Solo Kyero está activo en esta fase. La pantalla permite configurar la
 * conexión, copiar/rotar el feed y sincronizar a mano; no envía nada por sí
 * sola: el cron (cada 15 minutos) hace las sincronizaciones periódicas.
 */

import { Building2 } from 'lucide-react';
import { RealEstateModuleNav } from '@/components/real-estate/RealEstateModuleNav';
import { PortalesPanel } from '@/components/real-estate/PortalesPanel';

export default function PortalesPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Building2 className="h-6 w-6" /> Portales
        </h1>
        <p className="text-sm text-muted-foreground">
          Sindicación de inmuebles marcados como «publicable en portales». Las bajas
          (vendido, retirado…) salen del feed en la siguiente sincronización.
        </p>
      </div>

      <RealEstateModuleNav />
      <PortalesPanel />
    </div>
  );
}
