'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, User, Bot, Target, X, RefreshCw, MessageSquare } from 'lucide-react';

interface Message {
  role: 'agent' | 'customer';
  content: string;
}

interface RoleplaySimulatorProps {
  leadId: string;
  leadName: string;
  onClose: () => void;
}

export const RoleplaySimulator: React.FC<RoleplaySimulatorProps> = ({ leadId, leadName, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [postMortem, setPostMortem] = useState<any>(null);
  const [sessionStats, setSessionStats] = useState({ objections: 0, sentiment: 'Neutral' });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mensaje inicial de bienvenida
    setMessages([
      { role: 'customer', content: `Hola, soy ${leadName}. He estado revisando tu última propuesta pero tengo algunas dudas... ¿Por qué debería elegir Volkern sobre mi solución actual?` }
    ]);
  }, [leadName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const agentMsg = input.trim();
    setMessages(prev => [...prev, { role: 'agent', content: agentMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      // Simular llamada a la API de entrenamiento
      // En una integración real: await fetch('/api/ai/skill-handler', { method: 'POST', ... })
      
      const response = await fetch('/api/ai/skill-handler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_name: 'generate_customer_response',
          payload: { leadId, agentMessage: agentMsg, history: messages }
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setMessages(prev => [...prev, { role: 'customer', content: result.data.customerResponse }]);
        setSessionStats(prev => ({ ...prev, objections: prev.objections + 1, sentiment: result.data.sentiment }));
      }
    } catch (error) {
      console.error('Error in roleplay step:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFinish = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/ai/skill-handler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_name: 'generate_post_mortem',
          payload: { leadId, history: messages }
        })
      });

      const result = await response.json();
      if (result.success) {
        setPostMortem(result.data);
      }
    } catch (error) {
      console.error('Error generating post-mortem:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-[600px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold">Simulador de Negociación</h3>
              <p className="text-xs text-blue-100">Practicando con {leadName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!postMortem && (
              <button 
                onClick={handleFinish}
                disabled={messages.length < 2 || isAnalyzing}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
              >
                {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Finalizar sesión'}
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-6 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex gap-6 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Objeciones: {sessionStats.objections}
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Estado: {sessionStats.sentiment}
          </span>
        </div>

        {/* Chat Area o Post Mortem */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 dark:bg-slate-900/30">
          {postMortem ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Score Circular (Simulado con borde) */}
              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8 border-blue-600 border-t-slate-200">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">{postMortem.puntuacion_cierre}%</span>
                </div>
                <h4 className="mt-4 font-bold text-slate-900 dark:text-white uppercase tracking-widest text-xs">Puntación de Cierre</h4>
              </div>

              {/* Grid de Feedback */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                  <span className="text-[10px] font-bold text-green-600 uppercase">Argumento más fuerte</span>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 font-medium">{postMortem.argumento_mas_fuerte}</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <span className="text-[10px] font-bold text-blue-600 uppercase">Técnica Detectada</span>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 font-medium">{postMortem.tecnica_detectada}</p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 md:col-span-2">
                  <span className="text-[10px] font-bold text-amber-600 uppercase">Punto de Mejora</span>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 font-medium">{postMortem.punto_de_mejora}</p>
                </div>
              </div>

              <div className="pt-6 flex justify-center">
                <button 
                  onClick={() => {
                    setPostMortem(null);
                    setMessages([{ role: 'customer', content: `Hola, soy ${leadName}. ¿Empezamos de nuevo?` }]);
                  }}
                  className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm"
                >
                  Reintentar Simulación
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[80%] ${msg.role === 'agent' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'agent' ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                      }`}>
                        {msg.role === 'agent' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                      </div>
                      <div className={`p-3 rounded-2xl shadow-sm text-sm ${
                        msg.role === 'agent' 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 animate-pulse flex gap-1 items-center">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Escribe tu argumento de venta..."
              className="w-full p-4 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              disabled={isTyping}
            />
            <button 
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            Gemma 4 analizará tus argumentos y pondrá objeciones reales basadas en este cliente.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
