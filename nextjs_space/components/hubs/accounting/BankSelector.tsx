'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  Building2, 
  CreditCard, 
  Plus, 
  ShieldCheck, 
  ArrowRight,
  RefreshCcw,
  Banknote,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { usePlaidLink } from 'react-plaid-link';

export function BankSelector() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // Generar Link Token al cargar o al intentar conectar
  const generateLinkToken = async () => {
    try {
      const res = await fetch('/api/banking/plaid/create-link-token', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.linkToken) {
        setLinkToken(data.linkToken);
      } else {
        toast.error("Error al iniciar conexión con Plaid");
      }
    } catch (error) {
      console.error("Error generating link token:", error);
    }
  };

  useEffect(() => {
    generateLinkToken();
  }, []);

  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setLoading(true);
    try {
      const response = await fetch('/api/banking/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken: public_token, metadata }),
      });

      if (response.ok) {
        toast.success('¡Banco vinculado con éxito!');
        window.location.reload();
      } else {
        toast.error('Error al vincular la cuenta bancaria');
      }
    } catch (error) {
      toast.error('Error de red al conectar con Plaid');
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLoading(false),
  });

  return (
    <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
      <CardHeader className="p-8 text-center">
        <div className="flex justify-center items-center gap-3 mb-4">
           <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
             <Building2 className="w-8 h-8" />
           </div>
        </div>
        <CardTitle className="text-3xl font-black text-slate-900">Conexión Bancaria</CardTitle>
        <CardDescription className="text-slate-500 font-medium text-lg mt-2">
          Vincule su banco de forma segura mediante <strong>Plaid</strong> para automatizar su contabilidad.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-8 pt-0 space-y-8">
        <div className="bg-slate-50 rounded-[1.5rem] p-6 border border-slate-100">
           <div className="space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
                <span className="text-sm font-bold text-slate-700">Cifrado de extremo a extremo</span>
              </div>
              <div className="flex items-center gap-3">
                <RefreshCcw className="w-6 h-6 text-blue-500" />
                <span className="text-sm font-bold text-slate-700">Sincronización diaria automática</span>
              </div>
              <div className="flex items-center gap-3">
                <Banknote className="w-6 h-6 text-amber-500" />
                <span className="text-sm font-bold text-slate-700">Mapeo inteligente de categorías</span>
              </div>
           </div>
        </div>

        <Button 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-[1.5rem] py-8 h-auto font-black uppercase text-sm tracking-widest shadow-xl shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
          disabled={!ready || loading || !linkToken}
          onClick={() => {
            setLoading(true);
            open();
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-3 animate-spin" /> Conectando...
            </>
          ) : (
            <>
              Vincular con Plaid <ArrowRight className="w-5 h-5 ml-3" />
            </>
          )}
        </Button>

        <p className="text-center text-[10px] text-slate-400 font-medium px-4">
          Al continuar, aceptas vincular tus cuentas mediante Plaid. Volkern nunca almacena tus credenciales de acceso directo al banco.
        </p>
      </CardContent>
    </Card>
  );
}
