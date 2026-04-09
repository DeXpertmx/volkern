'use client';

import { useState, useEffect } from 'react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Button } from '@/components/ui/button';
import { Bell, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function PushPrompt() {
  const { permissionState, subscribe, isSupported } = usePushNotifications();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // No mostrar si ya se descartó previamente, si ya tiene permiso o si no es compatible
    if (!isSupported || permissionState !== 'default') return;

    // Si el usuario ya descartó el prompt anteriormente, no insistir
    try {
      const dismissed = localStorage.getItem('push_prompt_dismissed');
      if (dismissed) return;
    } catch {}

    // También verificar permiso nativo directamente por si el estado aún no se sincronizó
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'default') return;

    const timer = setTimeout(() => setIsVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [permissionState, isSupported]);

  const handleDismiss = () => {
    setIsVisible(false);
    try { localStorage.setItem('push_prompt_dismissed', Date.now().toString()); } catch {}
  };

  // Si ya tiene permiso, está bloqueado o el navegador no es compatible, no mostrar nada
  if (!isVisible || (permissionState !== 'default' && !isSubscribing) || !isSupported) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-md pointer-events-auto"
      >
        <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-2xl border border-white/10 flex flex-col gap-4 overflow-hidden relative backdrop-blur-xl bg-opacity-95">
          {/* Efectos de fondo premium */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0 border border-white/5">
              <Bell className="h-6 w-6 text-primary animate-bounce" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-amber-400" />
                ¡No te pierdas nada!
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                Activa las notificaciones para recibir alertas en tiempo real de nuevos leads y actualizaciones críticas del CRM.
              </p>
            </div>
            <button 
              disabled={isSubscribing}
              onClick={handleDismiss}
              className="text-slate-500 hover:text-white transition-all p-1 "
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="flex gap-3 mt-2">
            <Button 
              disabled={isSubscribing}
              onClick={async () => {
                setIsSubscribing(true);
                const success = await subscribe();
                setIsSubscribing(false);
                if (success) {
                  handleDismiss();
                } else {
                  console.warn('[Push] La suscripción no se pudo completar. Esto es normal en localhost si no está configurado.');
                }
              }}
              className="flex-1 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95"
            >
              {isSubscribing ? 'Activando...' : 'Activar Notificaciones'}
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleDismiss}
              className="h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-white/5 hover:bg-white/10 text-slate-300 border-none transition-all"
            >
              Más tarde
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
