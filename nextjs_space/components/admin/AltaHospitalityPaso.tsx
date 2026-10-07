'use client';

/**
 * Paso de Hospitality del alta guiada (panel de plataforma).
 *
 * El wizard de partner crea el tenant con su plan y su vertical. Este bloque
 * —hermano del que conecta Telegram cuando se dejó pendiente— remata el alta de
 * un cliente de Hospitality: catálogo de roles y primera propiedad vacía, para
 * que el cliente no entre a una cuenta sin estructura.
 *
 * No reimplementa nada: llama a `/api/admin/hospitality/alta`, que es el mismo
 * camino que usan la ruta y los scripts. Y por eso es idempotente: si el
 * operador pulsa dos veces, la segunda responde «ya existía» en lugar de crear
 * una «Villa Mar Azul (2)».
 *
 * Lo que NO hace, a propósito: no crea unidades, tarifas ni vínculos con el
 * proveedor. Eso es el wizard del cliente, donde el catálogo externo se valida
 * contra el proveedor y nada se inventa. Aquí solo se deja la puerta abierta;
 * el botón final le pasa el enlace exacto por donde continuar.
 */

import { useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, ChevronRight, Loader2, Sparkles } from 'lucide-react';

interface RespuestaAlta {
  ok?: boolean;
  error?: string;
  roles?: {
    creados: string[];
    completados: { nombre: string; faltantes: string[] }[];
    catalogo: string[];
  };
  propiedad?: { id: string; nombre: string; estado: string; creada: boolean };
  enlaceWizard?: string;
}

type Estado =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; respuesta: RespuestaAlta }
  | { kind: 'error'; message: string };

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-black uppercase tracking-widest text-slate-700">{label}</span>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </label>
  );
}

export function AltaHospitalityPaso({ tenantId }: { tenantId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ kind: 'idle' });
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [pais, setPais] = useState('');
  const [timezone, setTimezone] = useState('');

  const envio = estado.kind === 'submitting';
  const puedeEnviar = nombre.trim().length > 0 && !envio;

  async function preparar() {
    setEstado({ kind: 'submitting' });
    try {
      const res = await fetch('/api/admin/hospitality/alta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          propiedad: {
            nombre: nombre.trim(),
            ciudad: ciudad.trim() || undefined,
            pais: pais.trim() || undefined,
            timezone: timezone.trim() || undefined,
          },
        }),
      });
      const data: RespuestaAlta = await res
        .json()
        .catch((): RespuestaAlta => ({ ok: false, error: `HTTP ${res.status}` }));

      if (!res.ok || !data.ok) {
        setEstado({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setEstado({ kind: 'success', respuesta: data });
    } catch (err: unknown) {
      setEstado({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error desconocido al preparar Hospitality',
      });
    }
  }

  const exito = estado.kind === 'success' ? estado.respuesta : null;

  return (
    <div className="border border-indigo-200 bg-indigo-50 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Building2 size={16} className="text-indigo-700" />
          <div>
            <p className="text-sm font-black text-indigo-900 tracking-tight">
              {exito ? 'Hospitality preparado' : abierto ? 'Ocultar el paso de Hospitality' : 'Preparar Hospitality ahora'}
            </p>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              {exito
                ? 'Roles y primera propiedad listos. El cliente ya puede entrar a completarlo.'
                : 'Deja al cliente los roles del catálogo y su primera propiedad. Unidades, tarifas y canales los pone él en el wizard.'}
            </p>
          </div>
        </div>
        <ChevronRight
          size={14}
          className={`text-indigo-700 transition-transform ${abierto ? 'rotate-90' : ''}`}
        />
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-indigo-200 pt-3">
          {exito ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-emerald-900">
                  <p className="text-sm font-bold">
                    Propiedad «{exito.propiedad?.nombre}»{' '}
                    {exito.propiedad?.creada ? 'creada' : 'ya existía'}
                  </p>
                  <p className="mt-1">
                    {exito.roles?.creados.length
                      ? `Roles creados: ${exito.roles.creados.join(', ')}.`
                      : 'Los roles del catálogo ya estaban en la cuenta.'}
                    {exito.roles?.completados.length
                      ? ` Completados: ${exito.roles.completados.map((r) => r.nombre).join(', ')}.`
                      : ''}
                  </p>
                </div>
              </div>

              {exito.enlaceWizard && (
                <a
                  href={exito.enlaceWizard}
                  className="w-full px-4 py-2 bg-[#1A365D] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-[1.01] transition-transform inline-flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={14} /> Abrir el wizard del cliente
                </a>
              )}

              <button
                type="button"
                onClick={() => setEstado({ kind: 'idle' })}
                className="w-full text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700"
              >
                Añadir otra propiedad de arranque
              </button>
            </div>
          ) : (
            <>
              <Campo label="Primera propiedad" hint="El nombre con el que el cliente la reconoce. Es el paso 1 de su wizard.">
                <input
                  type="text"
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Villa Mar Azul"
                  disabled={envio}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm disabled:opacity-50"
                />
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Ciudad">
                  <input
                    type="text"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    placeholder="Algeciras"
                    disabled={envio}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm disabled:opacity-50"
                  />
                </Campo>
                <Campo label="País">
                  <input
                    type="text"
                    value={pais}
                    onChange={(e) => setPais(e.target.value)}
                    placeholder="España"
                    disabled={envio}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm disabled:opacity-50"
                  />
                </Campo>
              </div>

              <Campo
                label="Zona horaria"
                hint="Identificador IANA (Europe/Madrid). De aquí salen las ventanas de día de la propiedad: un valor inventado descuadra llegadas y holds."
              >
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Europe/Madrid"
                  disabled={envio}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1A365D]/30 text-sm font-mono disabled:opacity-50"
                />
              </Campo>

              {estado.kind === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-rose-600" />
                  <p>{estado.message}</p>
                </div>
              )}

              <button
                type="button"
                onClick={preparar}
                disabled={!puedeEnviar}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-[1.01] transition-transform disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center justify-center gap-1.5"
              >
                {envio ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Preparando…
                  </>
                ) : (
                  <>
                    <Building2 size={14} /> Preparar roles y primera propiedad
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
