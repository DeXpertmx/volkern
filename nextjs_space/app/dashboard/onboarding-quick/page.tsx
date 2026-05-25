'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  CheckCircle2, 
  MessageCircle, 
  ArrowRight, 
  Bot,
  Zap
} from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 5;

export default function OnboardingQuickPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [polling, setPolling] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Refs para evitar doble ejecución
  const provisionStarted = useRef(false);
  const pollingInterval = useRef<NodeJS.Timeout>();

  // Auto-provisioning al entrar al paso 2
  useEffect(() => {
    if (step === 2 && !provisionStarted.current) {
      provisionStarted.current = true;
      handleProvision();
    }
  }, [step]);

  // Polling al entrar al paso 5
  useEffect(() => {
    if (step === 5) {
      startPolling();
    }
    return () => {
      setPolling(false);
      if (pollingInterval.current) clearInterval(pollingInterval.current);
    };
  }, [step]);

  const startPolling = () => {
    setPolling(true);
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch('/api/onboarding/check-first-message');
        if (res.ok) {
          const data = await res.json();
          if (data.hasFirstMessage) {
            setPolling(false);
            if (pollingInterval.current) clearInterval(pollingInterval.current);
            router.push('/dashboard');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);
  };

  const handleProvision = async () => {
    setLoading(true);
    setProvisionError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
      const res = await fetch('/api/onboarding/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'provision' }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setStep(3);
      } else {
        const msg = data?.error || 'Error al preparar el espacio de trabajo';
        setProvisionError(msg);
        toast.error(msg);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const msg = 'La conexión está tardando demasiado. Verifica tu internet e intenta de nuevo.';
        setProvisionError(msg);
        toast.error(msg);
      } else {
        const msg = err?.message || 'Error de conexión. Verifica tu internet.';
        setProvisionError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnectTelegram = async () => {
    if (!token) {
      toast.error('Ingresa el token del bot');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: token })
      });

      const data = await res.json();
      if (res.ok) {
        setBotUsername(data.botInfo.username);
        setStep(5);
      } else {
        toast.error(data.error || 'Error al conectar');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    try {
      await fetch('/api/onboarding/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'complete' })
      });
    } catch (err) {
      console.error('Complete error:', err);
    }
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-8 text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-purple-500/30">
                    <Zap className="h-10 w-10 text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-white mb-3">
                    Bienvenido a Volkern
                  </h1>
                  <p className="text-slate-300 mb-8">
                    Configuremos tu asistente de IA en menos de 2 minutos
                  </p>
                  <Button 
                    onClick={() => setStep(2)}
                    className="w-full h-14 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-lg rounded-xl"
                  >
                    Comenzar
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-8 text-center">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Preparando tu espacio de trabajo...
                  </h2>
                  <div className="space-y-4 text-left mb-4">
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-center gap-3 text-slate-300"
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                      <span>Creando base de datos</span>
                    </motion.div>
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex items-center gap-3 text-slate-300"
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                      <span>Configurando canales</span>
                    </motion.div>
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex items-center gap-3"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      )}
                      <span className={loading ? 'text-purple-300' : 'text-green-300'}>
                        {loading ? 'Activando IA…' : 'IA activada'}
                      </span>
                    </motion.div>
                  </div>

                  {loading && (
                    <p className="text-xs text-slate-500 mt-2">
                      Configurando tu asistente inteligente, esto toma solo unos segundos
                    </p>
                  )}
                  {provisionError && !loading && (
                    <div className="mt-6 space-y-3">
                      <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                        {provisionError}
                      </p>
                      <Button
                        onClick={() => {
                          provisionStarted.current = true;
                          handleProvision();
                        }}
                        className="w-full h-12 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl"
                      >
                        <Loader2 className="mr-2 h-4 w-4" />
                        Reintentar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setStep(3)}
                        className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold rounded-xl"
                      >
                        Omitir este paso
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-8">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Conecta tu canal
                  </h2>
                  <p className="text-slate-400 mb-6">
                    Elige cómo tus clientes te contactarán
                  </p>
                  <div className="space-y-3">
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Card 
                        className="p-4 cursor-pointer bg-slate-800/50 border-slate-700 hover:border-purple-500 transition-colors"
                        onClick={() => setStep(4)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <MessageCircle className="h-6 w-6 text-blue-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">Telegram</p>
                            <p className="text-sm text-slate-400">Responde automáticamente con IA</p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-8">
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Conectar Telegram
                  </h2>
                  <ol className="text-slate-300 text-sm space-y-2 mb-6">
                    <li className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs">1</span>
                      Abre Telegram
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs">2</span>
                      Busca <span className="text-purple-400 font-mono">@BotFather</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs">3</span>
                      Crea tu bot con <span className="text-purple-400 font-mono">/newbot</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs">4</span>
                      Copia el token
                    </li>
                  </ol>
                  <Input
                    placeholder="Pega el token (ej: 123456789:ABC...)"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 mb-4"
                  />
                  <Button 
                    onClick={handleConnectTelegram}
                    disabled={loading || !token}
                    className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      'Conectar Bot'
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
            >
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardContent className="p-8 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
                  >
                    <Bot className="h-10 w-10 text-green-400" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    ¡Todo listo!
                  </h2>
                  <p className="text-slate-400 mb-2">
                    Tu bot @{botUsername} está conectado
                  </p>
                  <p className="text-sm text-purple-400 mb-8">
                    {polling ? 'Esperando primer mensaje...' : '¡Envía un mensaje para probar!'}
                  </p>
                  <Button 
                    onClick={handleComplete}
                    className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl mb-3"
                  >
                    Abrir Telegram
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleComplete}
                    className="w-full h-12 border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold rounded-xl"
                  >
                    Ir al Dashboard
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}