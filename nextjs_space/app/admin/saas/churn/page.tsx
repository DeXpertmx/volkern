'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingDown, ShieldAlert, Activity, ArrowRight, Frown, Users } from 'lucide-react';
import { toast } from 'sonner';

interface KpisPlataforma {
  periodoDias: number;
  moneda: string;
  churnRate: number | null;
  detalle: {
    baseChurn: number;
    cancelados: number;
  };
}

interface FilaChurn {
  month: string;
  churnRate: number | null;
  churned: number;
  total: number;
}

interface TenantAdmin {
  id: string;
  nombre: string;
  plan: string;
  mrr: number;
  _count?: { users?: number; apiKeys?: number };
}

function formatearPorcentaje(valor: number | null): string {
  if (valor === null) return '—';
  return `${valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })}%`;
}

function formatearDinero(valor: number, moneda: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: 0,
    }).format(valor);
  } catch {
    return `${moneda} ${Math.round(valor).toLocaleString('es-MX')}`;
  }
}

/**
 * Riesgo de una cuenta según datos que ya existen (nada aleatorio): sin MRR es
 * riesgo alto; con MRR pero con una sola persona en el equipo, riesgo medio.
 */
function riesgoDeCuenta(tenant: TenantAdmin): { nivel: 'alto' | 'medio' | null; motivo: string } {
  if ((tenant.mrr || 0) <= 0) return { nivel: 'alto', motivo: 'Sin MRR' };
  if ((tenant._count?.users ?? 0) <= 1) return { nivel: 'medio', motivo: 'Un solo usuario' };
  return { nivel: null, motivo: 'Con actividad' };
}

export default function ChurnManagementPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpisPlataforma | null>(null);
  const [historico, setHistorico] = useState<FilaChurn[]>([]);
  const [definicion, setDefinicion] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantAdmin[]>([]);

  const cargar = useCallback(async () => {
    try {
      const [resKpis, resHistorico, resTenants] = await Promise.all([
        fetch('/api/admin/saas-metrics/kpis?periodDays=30', { cache: 'no-store' }),
        fetch('/api/admin/saas-metrics/churn-metrics?periodDays=90', { cache: 'no-store' }),
        fetch('/api/admin/tenants?status=activo&limit=100', { cache: 'no-store' }),
      ]);

      if (!resKpis.ok) throw new Error('No se pudieron cargar los KPIs');
      setKpis(await resKpis.json());

      if (resHistorico.ok) {
        const json = await resHistorico.json();
        setHistorico(Array.isArray(json.metrics) ? json.metrics : []);
        setDefinicion(typeof json.definicion === 'string' ? json.definicion : null);
      }

      if (resTenants.ok) {
        const json = await resTenants.json();
        if (Array.isArray(json.tenants)) setTenants(json.tenants);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar el radar de churn');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enRiesgo = useMemo(
    () =>
      tenants
        .map((t) => ({ tenant: t, ...riesgoDeCuenta(t) }))
        .filter((t) => t.nivel !== null)
        .sort((a, b) => (a.nivel === b.nivel ? b.tenant.mrr - a.tenant.mrr : a.nivel === 'alto' ? -1 : 1)),
    [tenants],
  );

  const mrrEnRiesgo = useMemo(
    () => enRiesgo.reduce((suma, t) => suma + (t.tenant.mrr || 0), 0),
    [enRiesgo],
  );

  const criticos = enRiesgo.filter((t) => t.nivel === 'alto').length;
  const sanas = tenants.length - enRiesgo.length;
  const porcentajeSanas = tenants.length > 0 ? (sanas / tenants.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Activity className="h-10 w-10 animate-spin text-rose-500" />
      </div>
    );
  }

  const moneda = kpis?.moneda || 'EUR';

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Churn Radar</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">
            Prevención proactiva de cancelaciones
          </p>
        </div>
        <Badge className="bg-rose-500 text-white font-black text-[10px] uppercase px-4 py-1 border-none">
          {criticos} {criticos === 1 ? 'cuenta sin MRR' : 'cuentas sin MRR'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-rose-100 shadow-sm rounded-3xl overflow-hidden">
          <CardContent className="pt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                <Frown size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  Churn · últimos 30 días
                </p>
                <h2 className="text-3xl font-black text-rose-600 tracking-tighter">
                  {formatearPorcentaje(kpis?.churnRate ?? null)}
                </h2>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {kpis?.churnRate === null || kpis === null
                ? 'Sin cuentas previas que medir'
                : `${kpis.detalle.cancelados} bajas sobre ${kpis.detalle.baseChurn} cuentas`}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border-amber-100 shadow-sm rounded-3xl overflow-hidden">
          <CardContent className="pt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                <ShieldAlert size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                  Cuentas en riesgo
                </p>
                <h2 className="text-3xl font-black text-amber-600 tracking-tighter">{enRiesgo.length}</h2>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              MRR expuesto: {formatearDinero(mrrEnRiesgo, moneda)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#1A365D] text-white shadow-xl rounded-3xl overflow-hidden border-none relative group">
          <CardContent className="pt-8">
            <TrendingDown className="absolute top-[-10px] right-[-10px] h-32 w-32 opacity-10 group-hover:rotate-12 transition-transform duration-700" />
            <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">
              Cuentas sin riesgo detectado
            </p>
            <h2 className="text-3xl font-black text-white tracking-tighter">
              {formatearPorcentaje(porcentajeSanas)}
            </h2>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1">
              {sanas} de {tenants.length} cuentas activas
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem]">
        <CardHeader className="p-8">
          <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">
            Evolución mensual del churn
          </CardTitle>
          <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {definicion ||
              'Bajas del periodo sobre las cuentas que ya eran clientes al inicio del periodo.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 pt-0">
          {historico.length === 0 ? (
            <p className="text-sm font-bold text-slate-400">Sin histórico disponible.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {historico.map((fila) => (
                <div key={fila.month} className="flex items-center justify-between py-3">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    {fila.month}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {fila.churned} bajas / {fila.total} cuentas
                  </span>
                  <span className="text-sm font-black text-[#1A365D]">
                    {formatearPorcentaje(fila.churnRate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-[2.5rem] overflow-hidden">
        <div className="p-8 border-b border-slate-50">
          <h3 className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">
            Radar de riesgo
          </h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Criterio: sin MRR (riesgo alto) o con un solo usuario (riesgo medio)
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {enRiesgo.length === 0 ? (
            <div className="p-8 flex items-center gap-3 text-slate-400">
              <Users size={18} />
              <p className="text-sm font-bold">Ninguna cuenta cumple el criterio de riesgo.</p>
            </div>
          ) : (
            enRiesgo.map(({ tenant, nivel, motivo }) => (
              <div
                key={tenant.id}
                className="p-6 hover:bg-slate-50 transition-all flex flex-col md:flex-row items-center justify-between gap-6 group"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg text-[10px] uppercase ${
                      nivel === 'alto' ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                  >
                    {nivel}
                  </div>
                  <div>
                    <h4 className="font-black text-[#1A365D] uppercase tracking-tight group-hover:text-primary transition-colors">
                      {tenant.nombre}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {tenant.plan} · {motivo}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 items-center">
                  <div className="text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      MRR en riesgo
                    </p>
                    <p className="text-sm font-black text-[#1A365D]">
                      {formatearDinero(tenant.mrr || 0, moneda)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="rounded-xl h-10 px-4 text-[#1A365D] font-black uppercase text-[9px] hover:bg-white border border-transparent hover:border-slate-200"
                    onClick={() => (window.location.href = `/admin/saas/tenants/${tenant.id}`)}
                  >
                    Intervenir <ArrowRight size={12} className="ml-2" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
