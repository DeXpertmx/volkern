'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  GraduationCap, 
  Mail, 
  Lock, 
  ArrowRight, 
  Loader2,
  AlertCircle,
  BookOpen
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AcademyLoginPage() {
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
      const response = await fetch('/api/academy/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }

      toast.success('Bienvenido a la Academia');
      router.push('/academy/dashboard');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/white-diamond.png')]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-200 mb-6 rotate-3">
            <GraduationCap className="w-12 h-12 text-white -rotate-3" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            VOLKERN <span className="text-emerald-600">ACADEMIA</span>
          </h1>
          <p className="text-slate-500 font-medium mt-2">Capacitación Operativa & Certificación</p>
        </div>

        <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-slate-200/60 overflow-hidden bg-white">
          <CardHeader className="pt-10 px-10">
            <CardTitle className="text-2xl font-black text-slate-900">Iniciar Sesión</CardTitle>
            <CardDescription>Accede a tus cursos y certificaciones.</CardDescription>
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
                <Label htmlFor="email" className="text-slate-700 font-bold ml-1">Email Académico</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    placeholder="estudiante@volkern.com" 
                    className="pl-12 h-14 rounded-2xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all text-slate-900 font-medium"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <Label htmlFor="password" name="password" className="text-slate-700 font-bold">Contraseña</Label>
                  <Button variant="link" className="p-0 h-auto text-xs text-emerald-600 font-bold hover:text-emerald-700">
                    Recuperar acceso
                  </Button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-12 h-14 rounded-2xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all text-slate-900 font-medium"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-2xl text-lg font-black bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    Entrar al Aula <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-50 text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400 font-medium">
                <BookOpen className="w-4 h-4" />
                ¿Problemas técnicos? <span className="text-emerald-600 font-bold cursor-pointer">Soporte Academia</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-10 flex justify-center gap-8 opacity-40 grayscale">
          <div className="text-[10px] font-black tracking-widest uppercase">Certificación ISO</div>
          <div className="text-[10px] font-black tracking-widest uppercase">Trust Protocol</div>
          <div className="text-[10px] font-black tracking-widest uppercase">Digital DNA</div>
        </div>
      </motion.div>
    </div>
  );
}
