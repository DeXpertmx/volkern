'use client';

/**
 * app/dashboard/rrhh/mi-asistencia/AcknowledgmentButton.tsx
 *
 * Botón cliente que ejecuta la firma de la cláusula LOPDGDD Art. 88.
 * Hace POST a `/api/erp/attendance/acknowledge-notice` y muestra feedback
 * (loading, error, éxito). Al éxito, recarga la página server-side para
 * reflejar el nuevo estado `noticeAcknowledgedAt`/`noticeVersionAccepted`.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  employeeId: string;
  noticeVersion: string;
}

type Status = 'idle' | 'loading' | 'error' | 'success';

export default function AcknowledgmentButton({
  employeeId,
  noticeVersion,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleAccept() {
    setStatus('loading');
    setErrorMsg(null);
    try {
      // El timestamp de la firma es SIEMPRE server-side (LOPDGDD Art. 88).
      // El cliente sólo envía employeeId + noticeVersion + source.
      const res = await fetch('/api/erp/attendance/acknowledge-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          noticeVersion,
          source: 'self-service',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          body?.message ||
          body?.error ||
          `Error al firmar la cláusula (HTTP ${res.status}).`;
        setErrorMsg(message);
        setStatus('error');
        return;
      }

      setStatus('success');
      // Refrescar la página server-side para reflejar el nuevo estado.
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? `Error de red: ${err.message}`
          : 'Error de red desconocido al firmar la cláusula.';
      setErrorMsg(message);
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold shadow"
        role="status"
      >
        <ShieldCheck className="h-4 w-4" />
        Cláusula firmada correctamente.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAccept}
        disabled={status === 'loading'}
        className={[
          'inline-flex items-center gap-2 px-5 py-3 rounded-lg font-black text-sm tracking-wide shadow transition',
          'bg-[#1a3e6e] text-white hover:bg-[#2d5a8e]',
          status === 'loading' ? 'opacity-70 cursor-wait' : '',
        ].join(' ')}
        aria-busy={status === 'loading'}
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Firmando cláusula…
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" />
            Acepto la cláusula
          </>
        )}
      </button>
      <p className="text-[11px] text-slate-500">
        Versión firmada: <code>{noticeVersion}</code>
      </p>
      {status === 'error' && errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
