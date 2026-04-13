'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldAlert, Cpu, TrendingUp, Activity } from 'lucide-react';

export interface GlobalPulseData {
  totalMrr: number;
  activeAlerts: number;
  mcpLoad: number;
  healthScore: number;
  history: { date: string; value: number }[];
}

export function GlobalAnalytics({ data }: { data: GlobalPulseData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        {/* Card de Ingresos - Estilo Limpio */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">MRR Total (Global)</p>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <TrendingUp size={18} />
            </div>
          </div>
          <h2 className="text-4xl font-black text-[#1a365d] mt-1 tracking-tighter">€{data.totalMrr.toLocaleString()}</h2>
          <div className="h-24 mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.history}>
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#1a365d" 
                  strokeWidth={3} 
                  dot={false} 
                  animationDuration={2000}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card de Seguridad - Vigilancia Industrial */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Alertas de Seguridad</p>
            <div className={`p-2 rounded-xl ${data.activeAlerts > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <h2 className={`text-4xl font-black mt-1 tracking-tighter ${data.activeAlerts > 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {data.activeAlerts}
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs text-slate-400 flex items-center gap-2 font-medium">
              <span className={`h-2 w-2 rounded-full ${data.activeAlerts > 0 ? 'bg-red-600 animate-pulse' : 'bg-emerald-500'}`}></span>
              {data.activeAlerts > 0 
                ? 'Requieren revisión en Vigilancia Industrial' 
                : 'Sistemas íntegros y sin brechas detectadas'}
            </p>
            <div className="w-full bg-slate-50 h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                    className={`h-full transition-all duration-1000 ${data.healthScore > 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${data.healthScore}%` }}
                />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salud de Bóvedas: {data.healthScore}%</p>
          </div>
        </div>

        {/* Card de Infraestructura - Uso de IA */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Carga Servidores MCP</p>
            <div className="p-2 bg-slate-50 rounded-xl text-slate-600">
              <Cpu size={18} />
            </div>
          </div>
          <h2 className="text-4xl font-black text-[#2d3748] mt-1 tracking-tighter">{data.mcpLoad}%</h2>
          <div className="space-y-3 mt-6">
            <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden border border-slate-100">
              <div 
                className="bg-[#1a365d] h-full transition-all duration-1000 ease-out" 
                style={{ width: `${data.mcpLoad}%` }} 
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Gemma 4 Activa</span>
              <span className="flex items-center gap-1">
                <Activity size={10} className="text-emerald-500" />
                Live Engine
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
