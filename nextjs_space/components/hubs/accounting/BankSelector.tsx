'use client';

import { useState } from 'react';
import { 
  Building2, 
  CreditCard, 
  Plus, 
  ShieldCheck, 
  ArrowRight,
  RefreshCcw,
  Banknote
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';
import { useSession } from 'next-auth/react';

export function BankSelector() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      // 1. Crear sesión en el backend
      const res = await fetch('/api/banking/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: session?.user?.tenantId }),
      });

      const { clientSecret, error } = await res.json();
      
      if (error) throw new Error(error);

      // 2. Inicializar Stripe JS
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
      if (!stripe) throw new Error('No se pudo cargar Stripe');

      // 3. Abrir el modal de Financial Connections
      const { financialConnectionsSession, error: stripeError } = await stripe.collectFinancialConnectionsAccounts({
        clientSecret,
      });

      if (stripeError) {
        toast.error(stripeError.message || 'Error en la conexión con el banco');
        setLoading(false);
        return;
      }

      // 4. Procesar el resultado en el backend
      toast.success('¡Cuentas vinculadas con éxito! Sincronizando datos...');
      
      const callbackRes = await fetch(`/api/banking/callback?financial_connections_session_id=${financialConnectionsSession.id}&tenantId=${session?.user?.tenantId}`);
      
      if (callbackRes.ok) {
        window.location.reload();
      } else {
        toast.error('Error al guardar las cuentas vinculadas');
      }

    } catch (err: any) {
      toast.error(err.message || 'Error de red al conectar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
      <CardHeader className="p-8 text-center">
        <div className="flex justify-center items-center gap-3 mb-4">
           <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600">
             <CreditCard className="w-8 h-8" />
           </div>
        </div>
        <CardTitle className="text-3xl font-black text-slate-900">Sincronización Bancaria</CardTitle>
        <CardDescription className="text-slate-500 font-medium text-lg mt-2">
          Conecta tus cuentas bancarias de forma segura mediante <strong>Stripe Financial Connections</strong>.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-8 pt-0 space-y-8">
        <div className="bg-slate-50 rounded-[1.5rem] p-6 border border-slate-100">
           <div className="space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
                <span className="text-sm font-bold text-slate-700">Seguridad Grado Bancario</span>
              </div>
              <div className="flex items-center gap-3">
                <RefreshCcw className="w-6 h-6 text-blue-500" />
                <span className="text-sm font-bold text-slate-700">Sincronización Automática</span>
              </div>
              <div className="flex items-center gap-3">
                <Banknote className="w-6 h-6 text-amber-500" />
                <span className="text-sm font-bold text-slate-700">Conciliación con Gemma AI</span>
              </div>
           </div>
        </div>

        <Button 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] py-8 h-auto font-black uppercase text-sm tracking-widest shadow-xl shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
          disabled={loading}
          onClick={handleConnect}
        >
          {loading ? (
            <>
              <RefreshCcw className="w-5 h-5 mr-3 animate-spin" /> Procesando...
            </>
          ) : (
            <>
              Vincular mi Banco <ArrowRight className="w-5 h-5 ml-3" />
            </>
          )}
        </Button>

        <p className="text-center text-[10px] text-slate-400 font-medium px-4">
          Al hacer clic, se abrirá un modal seguro de Stripe. Volkern no tiene acceso a tus credenciales bancarias en ningún momento.
        </p>
      </CardContent>
    </Card>
  );
}
