import { ConnectLayout } from '@/components/connect/ConnectLayout';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volkern Connect | Hub Operativo',
  description: 'Centro de comunicación operativa integrada de Volkern ERP.',
};

export default function ConnectPage() {
  return (
    <div className="flex flex-col gap-6 p-8 h-screen bg-slate-50/50">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Volkern Connect</h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
            Gestión de comunicación operativa y eventos de sistema.
          </p>
        </div>
      </div>
      
      <ConnectLayout />
    </div>
  );
}
