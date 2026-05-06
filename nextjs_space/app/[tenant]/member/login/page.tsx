'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  ArrowRight, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const response = await fetch('/api/customer/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }

      toast.success('Bienvenido de nuevo');
      router.push('/member/dashboard');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/20 mb-4">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight italic">
            VOLKERN <span className="text-primary not-italic font-medium text-lg ml-1">MEMBER</span>
          </h1>
          <p className="text-slate-500 font-medium mt-2">Accede a tu bóveda corporativa</p>
        </div>

        <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-slate-200/60 overflow-hidden bg-white/80 backdrop-blur-xl">
          <CardHeader className="pt-10 px-10">
            <CardTitle className="text-2xl font-black text-slate-900">Iniciar Sesión</CardTitle>
            <CardDescription>Ingresa tus credenciales de cliente para continuar.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-medium"
                >
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </motion.div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    placeholder="ejemplo@empresa.com" 
                    className="pl-12 h-14 rounded-2xl border-slate-200 focus:ring-primary focus:border-primary transition-all bg-slate-50/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password">Contraseña</Label>
                  <Button variant="link" className="p-0 h-auto text-xs text-primary hover:text-primary/80">
                    ¿Olvidaste tu contraseña?
                  </Button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-12 h-14 rounded-2xl border-slate-200 focus:ring-primary focus:border-primary transition-all bg-slate-50/50"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    Acceder <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                ¿No tienes una cuenta?{' '}
                <Button variant="link" className="p-0 h-auto font-bold text-primary">
                  Contacta con tu asesor
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          Soberanía Digital Garantizada por <span className="text-slate-900">VOLKERN ERP</span>
        </p>
      </motion.div>
    </div>
  );
}
