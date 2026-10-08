'use client';

/**
 * Puesta en marcha de Hospitality para un cliente que YA existe (panel de
 * plataforma → detalle de tenant).
 *
 * El wizard de partner cubre el tenant recién creado, pero un cliente
 * registrado hace meses —o uno al que se le enciende la vertical ahora— no
 * tiene por dónde dar el alta. Este bloque cierra ese hueco con las tres cosas
 * que el operador necesita, en este orden:
 *
 *   1. **Qué falta** — roles del catálogo ausentes o incompletos y si ya hay
 *      propiedades. Se lee del servidor (`GET /api/admin/hospitality/alta`),
 *      nunca se adivina en el cliente.
 *   2. **Darlo** — el mismo paso de alta del wizard (`AltaHospitalityPaso`),
 *      que ya es idempotente: repetirlo completa lo que falte sin duplicar ni
 *      quitar permisos.
 *   3. **Pasar la puerta** — el enlace exacto por donde el cliente continúa
 *      (unidades, tarifas, mapping y pruebas). Unidades y canales NO se tocan
 *      aquí: los pone el cliente contra el proveedor.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AltaHospitalityPaso } from './AltaHospitalityPaso';

interface RolEstado {
  nombre: string;
  descripcion: string;
  estado: 'al_dia' | 'incompleto' | 'ausente';
  faltantes: string[];
}

interface PropiedadEstado {
  id: string;
  nombre: string;
  ciudad: string | null;
  pais: string | null;
  estado: string;
  unidades: number;
  enlaceWizard: string;
}

export interface EstadoPuestaEnMarcha {
  ok?: boolean;
  error?: string;
  tenant?: { id: string; nombre: string };
  roles?: {
    catalogo: number;
    alDia: number;
    detalle: RolEstado[];
    completos: boolean;
  };
  propiedades?: PropiedadEstado[];
  enlaceWizard?: string;
  listo?: boolean;
}

type Carga =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; estado: EstadoPuestaEnMarcha };

function ubicacion(p: PropiedadEstado): string {
  return [p.ciudad, p.pais].filter(Boolean).join(', ');
}

export function PuestaEnMarchaHospitality({
  tenantId,
  moduloActivo = true,
}: {
  tenantId: string;
  /** Estado del módulo `hospitality` en el tenant, según la API de módulos. */
  moduloActivo?: boolean;
}) {
  const [carga, setCarga] = useState<Carga>({ kind: 'loading' });

  const cargar = useCallback(async () => {
    setCarga({ kind: 'loading' });
    try {
      const res = await fetch(
        `/api/admin/hospitality/alta?tenantId=${encodeURIComponent(tenantId)}`
      );
      const data: EstadoPuestaEnMarcha = await res
        .json()
        .catch((): EstadoPuestaEnMarcha => ({ ok: false, error: `HTTP ${res.status}` }));

      if (!res.ok || !data.ok) {
        setCarga({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setCarga({ kind: 'ok', estado: data });
    } catch (err: unknown) {
      setCarga({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error desconocido al consultar el estado',
      });
    }
  }, [tenantId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const estado = carga.kind === 'ok' ? carga.estado : null;
  const pendientes =
    estado?.roles?.detalle.filter((r) => r.estado !== 'al_dia') ?? [];
  const propiedades = estado?.propiedades ?? [];

  return (
    <div className="border border-indigo-200 bg-white rounded-xl overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-200">
        <div className="flex items-start gap-2.5 min-w-0">
          <Rocket size={16} className="text-indigo-700 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-black text-indigo-900 tracking-tight">
              Puesta en marcha de Hospitality
            </p>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              Deja el catálogo de roles y la primera propiedad, y pásale al cliente el enlace
              por donde continúa.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={carga.kind === 'loading'}
          className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-700 hover:text-indigo-900 disabled:opacity-40"
        >
          <RefreshCw size={12} className={carga.kind === 'loading' ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {!moduloActivo && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <p>
              El módulo <strong>Hospitality</strong> está apagado para este cliente. Enciéndelo
              en la lista de módulos de arriba: sin él, el cliente no verá nada de lo que se
              prepare aquí.
            </p>
          </div>
        )}

        {carga.kind === 'loading' && (
          <p className="flex items-center gap-2 text-xs text-gray-500" role="status">
            <Loader2 size={13} className="animate-spin" /> Consultando el estado de la cuenta…
          </p>
        )}

        {carga.kind === 'error' && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-rose-600" />
            <p>{carga.message}</p>
          </div>
        )}

        {estado && (
          <>
            {/* Resumen: lo que falta, de un vistazo */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className={`p-3 rounded-lg border ${
                  estado.roles?.completos
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <ShieldCheck size={12} /> Roles del catálogo
                </p>
                <p className="text-lg font-semibold mt-0.5">
                  {estado.roles?.alDia ?? 0}
                  <span className="text-sm text-gray-500">/{estado.roles?.catalogo ?? 0}</span>
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  {estado.roles?.completos
                    ? 'Todos al día'
                    : `${pendientes.length} por preparar`}
                </p>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  propiedades.length ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <Building2 size={12} /> Propiedades
                </p>
                <p className="text-lg font-semibold mt-0.5">{propiedades.length}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  {propiedades.length
                    ? `${propiedades.reduce((n, p) => n + p.unidades, 0)} unidades en total`
                    : 'Sin ninguna todavía'}
                </p>
              </div>
            </div>

            {pendientes.length > 0 && (
              <ul className="space-y-1.5">
                {pendientes.map((rol) => (
                  <li
                    key={rol.nombre}
                    className="flex items-start gap-2 text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <span
                      className={`mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${
                        rol.estado === 'ausente'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {rol.estado === 'ausente' ? 'Falta' : 'Incompleto'}
                    </span>
                    <span className="min-w-0">
                      <strong>{rol.nombre}</strong> — {rol.descripcion}
                      {rol.faltantes.length > 0 && (
                        <span className="block text-gray-500">
                          Le faltan: {rol.faltantes.join(', ')}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Propiedades: el operador necesita el enlace exacto por cada una */}
            {propiedades.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Continuar el onboarding
                </p>
                {propiedades.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{p.nombre}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {[ubicacion(p), `${p.unidades} unidad(es)`, p.estado]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Link
                      href={p.enlaceWizard}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#1A365D] hover:underline"
                    >
                      Wizard <ExternalLink size={11} />
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {estado.listo && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                <p>
                  Cuenta preparada: roles al día y {propiedades.length} propiedad(es). Pásale al
                  cliente el enlace de arriba para que ponga unidades, tarifas y canales.
                </p>
              </div>
            )}

            {/* El mismo paso del wizard de partner: idempotente */}
            <AltaHospitalityPaso tenantId={tenantId} onDone={() => void cargar()} />

            {!estado.listo && propiedades.length === 0 && (
              <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                <Sparkles size={12} className="mt-0.5 flex-shrink-0 text-indigo-500" />
                Con la primera propiedad y los roles al día, el cliente ya puede entrar a su panel
                de Hospitality y terminar el resto con el wizard guiado.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
