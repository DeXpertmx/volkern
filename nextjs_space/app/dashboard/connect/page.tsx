import { ConnectLayout } from '@/components/connect/ConnectLayout';
import { Metadata } from 'next';
import { Activity, Command, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Volkern Connect | Hub Operativo',
  description: 'Centro de comunicación operativa integrada de Volkern ERP.',
};

export default function ConnectPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/70 dark:bg-slate-950">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-primary dark:bg-indigo-950/50">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Volkern Connect</h1>
              <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 sm:inline-flex dark:bg-emerald-950/40 dark:text-emerald-400">
                Operativo
              </span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Comunicación y eventos del equipo
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 md:flex">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          Espacio protegido
          <span className="mx-1 text-slate-200">•</span>
          <Command className="h-3.5 w-3.5" />
          Atajos disponibles
        </div>
      </header>

      <ConnectLayout />
    </div>
  );
}
