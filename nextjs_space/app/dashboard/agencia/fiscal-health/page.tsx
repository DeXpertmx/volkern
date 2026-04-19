'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Activity, Building2, ChevronRight, FileSearch } from 'lucide-react';

export default function FiscalHealthPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agencia/fiscal-health')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-vh-100 bg-slate-950">
        <div className="animate-pulse text-indigo-400">Escaneando integridad de la red...</div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-slate-950 text-slate-200 p-8 font-outfit">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-12">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-emerald-400 mb-2">
          Torre de Control Fiscal
        </h1>
        <p className="text-slate-400">Gobernanza y Auditoría Veri*factu en tiempo real para todos los inquilinos.</p>
      </div>

      {/* Stats Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <StatCard 
          icon={<Building2 className="text-indigo-400" />} 
          label="Tenants Administrados" 
          value={data.totalSummary.total} 
        />
        <StatCard 
          icon={<ShieldCheck className="text-emerald-400" />} 
          label="Cadenas Íntegras" 
          value={data.totalSummary.integros} 
          color="text-emerald-400"
        />
        <StatCard 
          icon={<ShieldAlert className="text-rose-400" />} 
          label="Brechas Detectadas" 
          value={data.totalSummary.comprometidos} 
          color="text-rose-400"
        />
      </div>

      {/* Tenants Table */}
      <div className="max-w-7xl mx-auto bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Estado de los Inquilinos</h2>
            <div className="text-xs text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-emerald-500" /> Sistema Veri*factu Activo
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-800/50 text-slate-400 text-sm uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Inquilino</th>
                <th className="px-6 py-4 font-medium">Estado Integridad</th>
                <th className="px-6 py-4 font-medium">Facturas Auditoría</th>
                <th className="px-6 py-4 font-medium">Última Inspección</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.tenants.map((tenant: any) => (
                <tr key={tenant.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-100">{tenant.nombre}</div>
                    <div className="text-xs text-slate-500">/{tenant.slug}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={\`flex items-center gap-2 \${tenant.status === 'ÍGTEGRA' ? 'text-emerald-400' : 'text-rose-400'}\`}>
                      {tenant.status === 'ÍGTEGRA' ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
                      <span className="text-sm font-bold tracking-tight">{tenant.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    {tenant.invoices} documentos
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(tenant.lastAudit).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-indigo-400">
                      <FileSearch size={20} />
                    </button>
                    <button className="p-2 hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-100">
                      <ChevronRight size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color = "text-white" }: any) {
  return (
    <div className="bg-slate-900/50 backdrop-blur-lg border border-slate-800 p-6 rounded-3xl shadow-xl hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-slate-800 rounded-2xl">
          {icon}
        </div>
      </div>
      <div className="text-slate-400 text-sm font-medium">{label}</div>
      <div className={\`text-3xl font-bold mt-1 \${color}\`}>{value}</div>
    </div>
  );
}
