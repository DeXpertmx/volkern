'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  Send, 
  HelpCircle, 
  BookOpen, 
  Zap, 
  ArrowRight,
  MessageSquare,
  Bot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePathname } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  role: 'user' | 'bot';
  content: string;
  actions?: any[];
}

export function VolkernGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-mensaje inicial según el hub
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      getInitialGuidance();
    }
  }, [isOpen]);

  const getInitialGuidance = async () => {
    setIsLoading(true);
    try {
      const hub = pathname.split('/')[2] || 'Dashboard';
      const res = await fetch('/api/guide/context', {
        method: 'POST',
        body: JSON.stringify({ path: pathname, hub })
      });
      const data = await res.json();
      setMessages([{ role: 'bot', content: data.message, actions: data.suggestedActions }]);
    } catch (e) {
      setMessages([{ role: 'bot', content: "Hola, soy tu guía Volkern. ¿En qué puedo ayudarte hoy?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const hub = pathname.split('/')[2] || 'Dashboard';
      const res = await fetch('/api/guide/context', {
        method: 'POST',
        body: JSON.stringify({ 
          path: pathname, 
          hub, 
          query: userMsg,
          history: messages.slice(-5)
        })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', content: data.message, actions: data.suggestedActions }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'bot', content: "Hubo un error al procesar tu solicitud." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger */}
      <button 
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-8 right-8 h-16 w-16 rounded-full bg-primary text-white shadow-2xl flex items-center justify-center transition-all hover:scale-110 z-[60]",
          isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <Sparkles className="w-8 h-8 animate-pulse" />
        <div className="absolute -top-1 -right-1 h-5 w-5 bg-rose-500 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white">
          1
        </div>
      </button>

      {/* Guide Sidebar */}
      <div className={cn(
        "fixed top-0 right-0 h-screen w-[400px] bg-white shadow-[-20px_0_60px_rgba(0,0,0,0.1)] z-[70] transition-all duration-500 transform flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="p-6 border-b border-slate-50 bg-slate-900 text-white flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                 <Bot className="w-6 h-6" />
              </div>
              <div>
                 <h2 className="text-lg font-black uppercase tracking-tight">Volkern <span className="text-primary italic">Guide</span></h2>
                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Memoria Organizacional Viva</p>
              </div>
           </div>
           <button onClick={() => setIsOpen(false)} className="h-10 w-10 rounded-xl hover:bg-white/10 flex items-center justify-center transition-all">
              <X className="w-6 h-6" />
           </button>
        </div>

        {/* Chat Area */}
        <ScrollArea className="flex-1 p-6">
           <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={cn(
                  "flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                   <div className={cn(
                     "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                     msg.role === 'user' 
                      ? "bg-primary text-white rounded-tr-none" 
                      : "bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100 shadow-sm"
                   )}>
                      {msg.content}
                   </div>
                   
                   {msg.actions && msg.actions.length > 0 && (
                     <div className="flex flex-wrap gap-2 mt-2">
                        {msg.actions.map((action: any, j: number) => (
                          <Button 
                            key={j} 
                            variant="outline" 
                            size="sm"
                            className="rounded-xl bg-white border-primary/20 text-primary hover:bg-primary hover:text-white text-[10px] font-black uppercase tracking-widest"
                          >
                             {action.label}
                          </Button>
                        ))}
                     </div>
                   )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-slate-300 animate-pulse">
                   <div className="h-2 w-2 rounded-full bg-current" />
                   <div className="h-2 w-2 rounded-full bg-current" />
                   <div className="h-2 w-2 rounded-full bg-current" />
                </div>
              )}
              <div ref={scrollRef} />
           </div>
        </ScrollArea>

        {/* Quick Links */}
        <div className="p-4 bg-slate-50 border-t border-slate-100">
           <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="justify-start gap-2 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500">
                 <BookOpen className="w-4 h-4" /> Base de Conocimiento
              </Button>
              <Button variant="ghost" className="justify-start gap-2 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500">
                 <Zap className="w-4 h-4" /> Comandos Rápidos
              </Button>
           </div>
        </div>

        {/* Input */}
        <div className="p-6 border-t border-slate-100 bg-white">
           <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="¿QUÉ NECESITAS HACER?"
                className="w-full h-14 pl-6 pr-14 rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-primary/20 text-[10px] font-bold uppercase tracking-widest transition-all"
              />
              <button 
                onClick={handleSend}
                className="absolute right-2 top-2 h-10 w-10 rounded-xl bg-primary text-white flex items-center justify-center hover:scale-105 transition-all shadow-lg shadow-primary/20"
              >
                 <Send className="w-4 h-4" />
              </button>
           </div>
        </div>
      </div>
    </>
  );
}
