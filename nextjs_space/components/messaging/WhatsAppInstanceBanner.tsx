'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

type EstadoInstancia = 'conectada' | 'desconectada' | 'sin_instancia' | 'error';

/**
 * Banner global del panel: avisa de que el WhatsApp del negocio está caído
 * antes de que el agente lo descubra al enviar. Se refresca cada minuto y al
 * volver a la pestaña; el aviso de instancia caída también llega por Telegram
 * desde el webhook de Evolution.
 */
export function WhatsAppInstanceBanner() {
  const [estado, setEstado] = useState<EstadoInstancia | null>(null);
  const [detalle, setDetalle] = useState('');
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      try {
        const res = await fetch('/api/integraciones/whatsapp-negocio/estado', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelado) return;
        setEstado(data.estado ?? null);
        setDetalle(data.detalle || '');
        // Si vuelve a estar conectada, se rearma para una caída futura.
        if (data.estado === 'conectada') setOculto(false);
      } catch {
        /* sin estado: no se muestra nada */
      }
    };

    cargar();
    const id = setInterval(cargar, 60_000);
    const alVolver = () => cargar();
    window.addEventListener('focus', alVolver);

    return () => {
      cancelado = true;
      clearInterval(id);
      window.removeEventListener('focus', alVolver);
    };
  }, []);

  if (estado !== 'desconectada' || oculto) return null;

  return (
    <div className="flex items-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        <strong>WhatsApp del negocio desconectado.</strong> Los mensajes salientes fallarán
        hasta que se reconecte el número.
        {detalle ? <span className="hidden sm:inline"> {detalle}</span> : null}{' '}
        <Link
          href="/dashboard/configuracion/whatsapp-negocio"
          className="font-semibold underline underline-offset-2"
        >
          Reconectar con QR
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setOculto(true)}
        title="Ocultar aviso"
        aria-label="Ocultar aviso"
        className="rounded p-1 hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
