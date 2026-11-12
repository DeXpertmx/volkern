'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TrendingDown,
  Users,
  DollarSign,
  Activity,
  Target,
  Wallet,
  Percent,
  CalendarClock,
} from 'lucide-react';

interface KpisPlataforma {
  periodoDias: number;
  moneda: string;
  multiDivisa: boolean;
  porMoneda: Array<{ moneda: string; mrr: number; cuentas: number; cuentasPago: number }>;
  mrr: number;
  arr: number;
  arpa: number;
  churnRate: number | null;
  ltv: number | null;
  cac: number | null;
  conversionRate: number | null;
  ltvCac: number | null;
  detalle: {
    cuentasActivas: number;
    cuentasPago: number;
    nuevosClientes: number;
    cancelados: number;
    baseChurn: number;
    oportunidades: number;
    convertidas: number;
    gastoMarketing: number | null;
    motivoSinCac: string | null;
  };
  calculadoEn: string;
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

function formatearPorcentaje(valor: number | null): string {
  if (valor === null) return '—';
  return `${valor.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
}

const ESTILO_TARJETA =
  'bg-white border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden hover:shadow-xl transition-all duration-300';

export default function SaaSMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpisPlataforma | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gasto, setGasto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/saas-metrics/kpis?periodDays=30', { cache: 'no-store' });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}));
        throw new Error(cuerpo.error || 'No se pudieron cargar las métricas');
      }
      const json: KpisPlataforma = await res.json();
      setKpis(json);
      setGasto(json.detalle.gastoMarketing === null ? '' : String(json.detalle.gastoMarketing));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las métricas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarGasto = async () => {
    const valor = Number(gasto);
    if (!Number.isFinite(valor) || valor < 0) {
      setAviso('Introduce un importe válido (0 o más).');
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch('/api/admin/saas-metrics/kpis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gastoMarketingMensual: valor, periodDays: 30 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar');
      setKpis(json);
      setAviso('Inversión guardada: el CAC ya la usa.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const dinero = useMemo(
    () => (valor: number) => formatearDinero(valor, kpis?.moneda || 'EUR'),
    [kpis?.moneda],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1A365D]" />
      </div>
    );
  }

  if (error || !kpis) {
    return (
      <div className="p-8 rounded-3xl bg-rose-50 text-rose-700 font-bold">
        {error || 'No hay datos disponibles'}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">
          SaaS Command Center
        </h1>
        <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">
          Métricas vitales de la plataforma · últimos {kpis.periodoDias} días
        </p>
        <p className="mt-3 text-[11px] font-bold text-slate-400">
          Churn: bajas del periodo sobre las cuentas que ya eran clientes al inicio (misma
          definición que el Churn Radar).
        </p>
        {kpis.multiDivisa && (
          <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 inline-block px-3 py-1 rounded-full">
            Cuentas en varias divisas: los importes se muestran en {kpis.moneda}, la de mayor MRR.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 w-fit mb-4">
              <DollarSign size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">MRR</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {dinero(kpis.mrr)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Ingresos recurrentes mensuales</p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 w-fit mb-4">
              <Activity size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ARR</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {dinero(kpis.arr)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">MRR anualizado (×12)</p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-sky-50 rounded-2xl text-sky-600 w-fit mb-4">
              <Users size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ARPA</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {dinero(kpis.arpa)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              Ingreso medio por cuenta ({kpis.detalle.cuentasPago} de pago)
            </p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-rose-50 rounded-2xl text-rose-600 w-fit mb-4">
              <TrendingDown size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Churn
            </p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {formatearPorcentaje(kpis.churnRate)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {kpis.churnRate === null
                ? 'Sin cuentas previas que medir'
                : `${kpis.detalle.cancelados} bajas sobre ${kpis.detalle.baseChurn} cuentas`}
            </p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-violet-50 rounded-2xl text-violet-600 w-fit mb-4">
              <Wallet size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">LTV</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {kpis.ltv === null ? '—' : dinero(kpis.ltv)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {kpis.ltv === null ? 'Necesita churn medible' : 'ARPA ÷ churn mensual'}
            </p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-amber-50 rounded-2xl text-amber-600 w-fit mb-4">
              <Target size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CAC</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {kpis.cac === null ? '—' : dinero(kpis.cac)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {kpis.cac === null
                ? kpis.detalle.motivoSinCac
                : `Inversión ${dinero(kpis.detalle.gastoMarketing || 0)} ÷ ${kpis.detalle.nuevosClientes} clientes nuevos`}
            </p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-teal-50 rounded-2xl text-teal-600 w-fit mb-4">
              <Percent size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Conversión
            </p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {formatearPorcentaje(kpis.conversionRate)}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {kpis.conversionRate === null
                ? 'Sin cuentas nuevas en el periodo'
                : `${kpis.detalle.convertidas} de ${kpis.detalle.oportunidades} cuentas nuevas ya son clientes`}
            </p>
          </CardContent>
        </Card>

        <Card className={ESTILO_TARJETA}>
          <CardContent className="pt-8">
            <div className="p-3 bg-slate-100 rounded-2xl text-[#1A365D] w-fit mb-4">
              <CalendarClock size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              LTV:CAC
            </p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">
              {kpis.ltvCac === null ? '—' : `${kpis.ltvCac.toFixed(1)}x`}
            </h2>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {kpis.ltvCac === null ? 'Falta el CAC para calcularlo' : 'Sano por encima de 3x'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem]">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">
              Cuentas
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Base de clientes de la plataforma
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-4">
            {[
              { label: 'Cuentas activas', valor: kpis.detalle.cuentasActivas },
              { label: 'Cuentas de pago', valor: kpis.detalle.cuentasPago },
              { label: 'Nuevas en el periodo', valor: kpis.detalle.nuevosClientes },
              { label: 'Bajas en el periodo', valor: kpis.detalle.cancelados },
              { label: 'Cuentas al inicio del periodo', valor: kpis.detalle.baseChurn },
            ].map((fila) => (
              <div key={fila.label} className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                  {fila.label}
                </span>
                <span className="text-lg font-black text-[#1A365D]">{fila.valor}</span>
              </div>
            ))}
            {kpis.porMoneda.length > 1 && (
              <div className="pt-2 space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  MRR por divisa
                </p>
                {kpis.porMoneda.map((grupo) => (
                  <div key={grupo.moneda} className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">{grupo.moneda}</span>
                    <span className="text-xs font-black text-[#1A365D]">
                      {formatearDinero(grupo.mrr, grupo.moneda)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem]">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">
              Inversión de marketing
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Sin este dato no se puede calcular el CAC
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gasto">Inversión de los últimos 30 días ({kpis.moneda})</Label>
              <Input
                id="gasto"
                type="number"
                min={0}
                step="0.01"
                value={gasto}
                onChange={(e) => setGasto(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button onClick={guardarGasto} disabled={guardando} className="w-full">
              {guardando ? 'Guardando…' : 'Guardar inversión'}
            </Button>
            {aviso && <p className="text-xs font-bold text-slate-500">{aviso}</p>}
            <p className="text-[11px] font-bold text-slate-400">
              CAC actual:{' '}
              {kpis.cac === null
                ? '—'
                : `${dinero(kpis.cac)} por cliente nuevo (${kpis.detalle.nuevosClientes} en el periodo)`}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
