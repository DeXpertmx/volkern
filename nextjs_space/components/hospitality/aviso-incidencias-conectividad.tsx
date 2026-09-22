'use client';

/**
 * Aviso de incidencias de conectividad para el dashboard de Hospitality.
 *
 * El panel completo vive en "Puesta en marcha" (donde se corrigen los
 * vínculos), pero el operador no entra ahí a diario: este aviso aparece en las
 * pantallas que sí visita y lleva a la incidencia concreta.
 *
 * Solo se pinta cuando hay algo que hacer:
 * - reservas rechazadas por falta de vínculo de unidad (ámbar);
 * - reservas que ya tienen vínculo pero siguen sin registrarse (azul), es decir
 *   pendientes de reenviar.
 *
 * Si la consulta falla no se muestra nada: es un aviso, no un dato de negocio.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Incidencia {
  hotelCode: string;
  propertyId: string | null;
  property: string | null;
  roomCode: string | null;
  rateplanCode: string | null;
  tipo: 'roomcode_sin_mapping' | 'propiedad_sin_mapping';
  intentos: number;
  ultimaFecha: string;
  vinculo: { unit: string | null } | null;
}

interface ResumenIncidencias {
  pendientes: number;
  vinculadas: number;
  resueltas: number;
  eventosAnalizados: number;
}

export default function AvisoIncidenciasConectividad() {
  const [resumen, setResumen] = useState<ResumenIncidencias | null>(null);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await fetch('/api/hospitality/incidencias');
        if (!res.ok) return;
        const data = await res.json();
        if (!activo) return;
        setResumen(data.resumen ?? null);
        setIncidencias(data.incidencias ?? []);
      } catch {
        // Aviso informativo: si no se puede consultar, no interrumpe la página.
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const pendientes = resumen?.pendientes ?? 0;
  const vinculadas = resumen?.vinculadas ?? 0;
  if (pendientes === 0 && vinculadas === 0) return null;

  const porVincular = pendientes > 0;
  const destacadas = incidencias.slice(0, 3);
  // Si todas las incidencias son de la misma propiedad, el enlace entra ya en ella.
  const propiedadUnica = new Set(incidencias.map((i) => i.propertyId).filter(Boolean));
  const href =
    propiedadUnica.size === 1
      ? `/dashboard/hospitality/onboarding?propertyId=${[...propiedadUnica][0]}`
      : '/dashboard/hospitality/onboarding';

  return (
    <Card className={porVincular ? 'border-amber-300 bg-amber-50' : 'border-sky-300 bg-sky-50'}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          {porVincular ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          ) : (
            <Send className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          )}
          <div className="space-y-1">
            <p className={`text-sm font-semibold ${porVincular ? 'text-amber-900' : 'text-sky-900'}`}>
              {porVincular
                ? `${pendientes} habitación(es) con reservas sin registrar por falta de vínculo`
                : `${vinculadas} habitación(es) con reservas pendientes de reenviar`}
            </p>
            <ul className={`space-y-0.5 text-xs ${porVincular ? 'text-amber-800' : 'text-sky-800'}`}>
              {destacadas.map((i) => (
                <li key={`${i.hotelCode}|${i.roomCode ?? ''}|${i.rateplanCode ?? ''}`}>
                  · {i.roomCode || 'sin roomCode'} · {i.property || i.hotelCode} ·{' '}
                  {i.vinculo ? 'lista para reenviar' : 'habitación sin vincular'} ·{' '}
                  {formatDistanceToNow(new Date(i.ultimaFecha), { addSuffix: true, locale: es })}
                </li>
              ))}
            </ul>
            {incidencias.length > destacadas.length && (
              <p className={`text-xs ${porVincular ? 'text-amber-800' : 'text-sky-800'}`}>
                y {incidencias.length - destacadas.length} más
              </p>
            )}
            {porVincular && vinculadas > 0 && (
              <p className="text-xs text-amber-800">
                Otras {vinculadas} ya tienen vínculo: solo falta reenviar la reserva.
              </p>
            )}
          </div>
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className={`shrink-0 bg-white ${porVincular ? 'border-amber-300' : 'border-sky-300'}`}
        >
          <Link href={href}>
            Revisar en Puesta en marcha
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
