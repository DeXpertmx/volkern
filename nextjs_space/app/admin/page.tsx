'use client';

import { useEffect, useState } from 'react';
import { GlobalAnalytics, GlobalPulseData } from '@/components/admin/GlobalAnalytics';
import { Loader2, RefreshCcw, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const [pulseData, setPulseData] = useState<GlobalPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPulse();
  }, []);

  const loadPulse = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/global-pulse');
      if (res.ok) {
        const data = await res.json();
        setPulseData(data);
      } else {
        setError('Error al conectar con la bóveda de inteligencia global');
      }
    } catch (error) {
      console.error('Error loading pulse:', error);
      setError('Error de conexión con el servidor MCP');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#1A365D]/20" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sincronizando pulso global...</p>
      </div>
    );
  }

  if (error || !pulseData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
        <div className="p-4 bg-rose-50 rounded-full text-rose-600">
           <RefreshCcw size={32} />
        </div>
        <div className="text-center">
            <h3 className="text-lg font-black text-[#1A365D] uppercase tracking-tighter">Fallo en la Matriz de Datos</h3>
            <p className="text-sm text-slate-500 font-medium">{error || 'No hay datos disponibles'}</p>
        </div>
        <button 
            onClick={loadPulse}
            className="px-6 py-2 bg-[#1A365D] text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10 hover:scale-105 transition-transform"
        >
            Reintentar Conexión
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Global Pulse</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Volkern Platform Live Oversight</p>
        </div>
        <button 
            onClick={loadPulse}
            className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-[#1A365D] hover:border-[#1A365D]/20 transition-all group"
        >
            <RefreshCcw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </div>

      {/* Global Analytics Cards */}
      <GlobalAnalytics data={pulseData} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions / Status Panel */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#1A365D] p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-700">
                    <TrendingUp size={120} />
                </div>
                <h3 className="text-xl font-black italic uppercase tracking-tighter mb-2">Comando Global</h3>
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-8">Gestión de Infraestructura</p>
                
                <div className="space-y-3">
                    <button className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 text-center">
                        Optimizar Base de Datos
                    </button>
                    <button className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 text-center">
                        Limpiar Caché Global
                    </button>
                    <button className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 text-center">
                        Auditoría de Seguridad
                    </button>
                </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h3 className="text-sm font-black text-[#1A365D] uppercase tracking-widest mb-4">Estado de Nodos</h3>
                <div className="space-y-4">
                    {[
                        { name: 'Core API', status: 'Online', color: 'bg-emerald-500' },
                        { name: 'Gemma-4 Engine', status: 'Active', color: 'bg-emerald-500' },
                        { name: 'Vault Storage', status: 'Secure', color: 'bg-indigo-500' },
                        { name: 'Edge CDN', status: 'Optimal', color: 'bg-emerald-500' }
                    ].map((node) => (
                        <div key={node.name} className="flex items-center justify-between border-b border-slate-50 pb-3 last:border-0">
                            <span className="text-xs font-bold text-slate-500">{node.name}</span>
                            <div className="flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full ${node.color}`}></span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#1A365D]">{node.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* System Messages / Log */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">Log de Operaciones Globales</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Actividad del Backoffice en tiempo real</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="p-0">
                <div className="divide-y divide-slate-50">
                    {[
                        { time: '12:45', action: 'Nuevo Tenant Registrado', detail: 'Inmobiliaria Premium SL', type: 'success' },
                        { time: '11:20', action: 'Actualización de Plan', detail: 'TechSolutions Pro incrementó a Enterprise', type: 'info' },
                        { time: '09:15', action: 'Alerta de Seguridad', detail: 'Intento de acceso bloqueado en nodo US-East', type: 'warning' },
                        { time: '08:00', action: 'Respaldo Diario', detail: 'Backup de 452 bóvedas completado exitosamente', type: 'success' },
                        { time: '07:30', action: 'Mantenimiento MCP', detail: 'Reinicio programado de servidores de IA', type: 'info' }
                    ].map((log, i) => (
                        <div key={i} className="p-6 hover:bg-slate-50 transition-colors flex items-start gap-4">
                            <span className="text-[10px] font-black text-slate-300 mt-0.5">{log.time}</span>
                            <div>
                                <p className="text-xs font-bold text-[#1A365D] uppercase tracking-tight">{log.action}</p>
                                <p className="text-xs text-slate-500">{log.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-6 bg-slate-50/50 text-center">
                    <button className="text-[10px] font-black text-[#1A365D] uppercase tracking-widest hover:underline">Ver registro completo</button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
