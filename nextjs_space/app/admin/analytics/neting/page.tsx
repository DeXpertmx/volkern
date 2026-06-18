'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  RefreshCcw,
  MousePointerClick,
  Eye,
  Percent,
  Calendar,
  Monitor,
  MapPin,
  Trash2,
  Filter,
} from 'lucide-react';

interface AnalyticsEvent {
  event: string;
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  referer: string;
  timestamp: string;
}

interface NetingAnalytics {
  events: AnalyticsEvent[];
  counts: Record<string, number>;
  summary: {
    modalShown: number;
    standardPriceClicked: number;
    conversionRate: number;
    totalEvents: number;
  };
}

const EVENT_LABELS: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  neting_promo_expired_modal_shown: {
    label: 'Modal "Promo expirada" visto',
    icon: Eye,
    color: 'text-amber-500 bg-amber-50',
  },
  neting_promo_expired_standard_price_clicked: {
    label: 'Clic "Activar precio estándar"',
    icon: MousePointerClick,
    color: 'text-emerald-500 bg-emerald-50',
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortUA(ua: string): string {
  if (ua === 'unknown') return '—';
  if (ua.length > 50) return ua.slice(0, 47) + '…';
  return ua;
}

export default function NetingAnalyticsPage() {
  const [data, setData] = useState<NetingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [since, setSince] = useState<string>(''); // ISO string, '' = sin filtro

  const DATE_PRESETS = [
    { label: '7 días', days: 7 },
    { label: '30 días', days: 30 },
    { label: '90 días', days: 90 },
    { label: 'Todo', days: 0 },
  ] as const;

  const applyPreset = (days: number) => {
    if (days === 0) {
      setSince('');
    } else {
      const d = new Date();
      d.setDate(d.getDate() - days);
      d.setHours(0, 0, 0, 0);
      setSince(d.toISOString());
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (since) params.set('since', since);
      const qs = params.toString();
      const res = await fetch(`/api/admin/analytics/neting${qs ? '?' + qs : ''}`);
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 403) {
        setError('Acceso denegado. Requiere rol Superadmin o Admin.');
      } else {
        setError('Error al cargar los datos de analytics.');
      }
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [since]);

  const clearAll = async () => {
    if (!confirm('¿Estás seguro? Esto eliminará todos los eventos de analytics del store en memoria.')) return;
    try {
      setClearing(true);
      const res = await fetch('/api/admin/analytics/neting', { method: 'DELETE' });
      if (res.ok) {
        await load();
      } else {
        setError('Error al limpiar los eventos.');
      }
    } catch {
      setError('Error de conexión al limpiar eventos.');
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#1A365D]/20" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Cargando analytics de Neting…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
        <div className="p-4 bg-rose-50 rounded-full text-rose-600">
          <RefreshCcw size={32} />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-black text-[#1A365D] uppercase tracking-tighter">
            Error al cargar datos
          </h3>
          <p className="text-sm text-slate-500 font-medium">{error}</p>
        </div>
        <button
          onClick={load}
          className="px-6 py-2 bg-[#1A365D] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-105 transition-transform"
        >
          Reintentar
        </button>
      </div>
    );
  }

const ACTIVE_PRESET_CLASS =
    'bg-[#1A365D] text-white border-[#1A365D] shadow-md';
  const INACTIVE_PRESET_CLASS =
    'bg-white text-slate-500 border-slate-200 hover:border-[#1A365D]/30 hover:text-[#1A365D]';

  const s = data!.summary;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">
            Neting Analytics
          </h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">
            Eventos de la landing de promoción Neting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clearAll}
            disabled={clearing || !data || data.summary.totalEvents === 0}
            className="p-3 rounded-2xl bg-white border border-slate-100 text-rose-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all group disabled:opacity-30 disabled:cursor-not-allowed"
            title="Limpiar todos los eventos"
          >
            <Trash2
              size={18}
              className={clearing ? 'animate-pulse' : ''}
            />
          </button>
          <button
            onClick={load}
            className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-[#1A365D] hover:border-[#1A365D]/20 transition-all group"
          >
            <RefreshCcw
              size={18}
              className="group-hover:rotate-180 transition-transform duration-500"
            />
          </button>
        </div>
      </div>

      {/* Date filter bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-100">
          <Filter size={14} className="text-slate-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Período
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {DATE_PRESETS.map((preset) => {
            const presetSince =
              preset.days === 0
                ? ''
                : (() => {
                    const d = new Date();
                    d.setDate(d.getDate() - preset.days);
                    d.setHours(0, 0, 0, 0);
                    return d.toISOString();
                  })();
            const isActive = since === presetSince;
            return (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.days)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  isActive ? ACTIVE_PRESET_CLASS : INACTIVE_PRESET_CLASS
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        {since && (
          <span className="text-[10px] text-slate-400 font-medium">
            Desde {new Date(since).toLocaleDateString('es-ES')}
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-500">
              <Eye size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Modal visto
            </span>
          </div>
          <p className="text-4xl font-black text-[#1A365D] tabular-nums">
            {s.modalShown}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Usuarios que perdieron la promo
          </p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-500">
              <MousePointerClick size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Precio estándar
            </span>
          </div>
          <p className="text-4xl font-black text-[#1A365D] tabular-nums">
            {s.standardPriceClicked}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Aceptaron precio sin promo
          </p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-500">
              <Percent size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Conversión
            </span>
          </div>
          <p className="text-4xl font-black text-[#1A365D] tabular-nums">
            {s.conversionRate}%
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Tasa post-promo
          </p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-100 rounded-xl text-slate-500">
              <Calendar size={20} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total eventos
            </span>
          </div>
          <p className="text-4xl font-black text-[#1A365D] tabular-nums">
            {s.totalEvents}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Eventos Neting registrados
          </p>
        </div>
      </div>

      {/* Event Timeline */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">
              Timeline de eventos
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Últimos eventos registrados en orden cronológico inverso
            </p>
          </div>
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {data!.events.length === 0 ? (
          <div className="p-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 mb-4">
              <Eye size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-400">
              No hay eventos registrados aún
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Los eventos aparecerán aquí cuando el countdown de Neting expire y
              los usuarios interactúen con el modal.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {data!.events.map((ev, i) => {
              const meta = EVENT_LABELS[ev.event] || {
                label: ev.event,
                icon: Calendar,
                color: 'text-slate-400 bg-slate-50',
              };
              const Icon = meta.icon;
              return (
                <div
                  key={i}
                  className="p-5 hover:bg-slate-50 transition-colors flex items-start gap-4"
                >
                  <div className={`p-2 rounded-xl shrink-0 ${meta.color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-[#1A365D] uppercase tracking-tight">
                        {meta.label}
                      </p>
                      <span className="text-[10px] font-black text-slate-300">
                        {formatDate(ev.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Monitor size={10} />
                        {shortUA(ev.userAgent)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <MapPin size={10} />
                        {ev.ip}
                      </span>
                      {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          {Object.entries(ev.metadata)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Counts Breakdown */}
      {Object.keys(data!.counts).length > 0 && (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50">
            <h3 className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">
              Desglose por tipo de evento
            </h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Conteo acumulado de cada evento
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(data!.counts).map(([eventName, count]) => {
              const meta = EVENT_LABELS[eventName] || {
                label: eventName,
                icon: Calendar,
                color: 'text-slate-400',
              };
              const Icon = meta.icon;
              return (
                <div
                  key={eventName}
                  className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} className={meta.color.split(' ')[0]} />
                    <span className="text-xs font-bold text-[#1A365D]">
                      {meta.label}
                    </span>
                  </div>
                  <span className="text-lg font-black text-[#1A365D] tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
