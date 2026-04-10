'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PhoneIncoming, 
  X, 
  User, 
  Phone, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function IncomingCallPopup() {
  const router = useRouter();
  const [activeCall, setActiveCall] = useState<any>(null);
  
  // Poll notifications every 5 seconds for incoming calls
  const { data: notifications, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 5000 
  });

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const callNotif = notifications.find((n: any) => n.type === 'incoming_call' && !n.read);
      if (callNotif) {
        // If it's a new call we haven't seen, show it
        setActiveCall(callNotif);
      } else {
        setActiveCall(null);
      }
    }
  }, [notifications]);

  const handleDismiss = async () => {
    if (!activeCall) return;
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeCall.id, read: true })
      });
      mutate();
      setActiveCall(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewLead = async () => {
    if (!activeCall?.data?.leadId) return;
    await handleDismiss();
    router.push(`/dashboard/leads/${activeCall.data.leadId}`);
  };

  if (!activeCall) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
        className="fixed bottom-6 right-6 z-[100] w-full max-w-sm"
      >
        <div className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-blue-100 overflow-hidden ring-1 ring-black/5">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-lg relative z-10">
                  <PhoneIncoming className="h-6 w-6" />
                </div>
              </div>
              <div>
                <h4 className="text-white font-black text-sm uppercase tracking-wider">Llamada Entrante</h4>
                <p className="text-blue-100 text-[10px] font-bold">ZADARMA VoIP ENGINE</p>
              </div>
            </div>
            <button 
              onClick={handleDismiss}
              className="h-8 w-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="p-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-20 w-20 bg-slate-50 rounded-full border border-slate-100 flex items-center justify-center shadow-inner">
                <User className="h-10 w-10 text-slate-300" />
              </div>
              
              <div>
                <p className="text-xl font-black text-slate-900">{activeCall.data?.callerId || 'Desconocido'}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {activeCall.data?.leadId ? 'Cliente Registrado' : 'Número Nuevo'}
                </p>
              </div>

              <div className="w-full pt-4 space-y-3">
                {activeCall.data?.leadId ? (
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-600/20 group transition-all active:scale-[0.98]"
                    onClick={handleViewLead}
                  >
                    <span>Ver Ficha del Lead</span>
                    <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                ) : (
                  <Button 
                    variant="outline"
                    className="w-full border-2 border-slate-200 hover:border-blue-600 hover:text-blue-600 rounded-2xl h-12 font-black uppercase tracking-widest text-xs transition-all active:scale-[0.98]"
                    onClick={() => router.push(`/dashboard/leads/new?phone=${activeCall.data?.callerId}`)}
                  >
                    <span>Registrar Lead</span>
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                )}
                
                <Button 
                  variant="ghost"
                  className="w-full text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest h-8"
                  onClick={handleDismiss}
                >
                  Ignorar Llamada
                </Button>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 p-3 border-t flex items-center justify-center gap-2">
             <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Enlace CTI Activo</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
