'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { 
  Bot, 
  ChevronRight, 
  X, 
  Sparkles, 
  BookOpen, 
  Zap, 
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  History
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function VolkernGuide() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<string>('General');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([
    { role: 'assistant', content: '¡Hola! Soy tu Volkern Guide. Detecto que estás explorando el sistema. ¿En qué puedo ayudarte hoy?' }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    // Detectar Hub actual por URL
    if (pathname.includes('/ventas')) setContext('Ventas');
    else if (pathname.includes('/finanzas')) setContext('Finanzas');
    else if (pathname.includes('/rrhh')) setContext('Talento y Nóminas');
    else if (pathname.includes('/strategy')) setContext('Estrategia');
    else setContext('Dashboard General');
  }, [pathname]);

  const handleSendMessage = async (e?: React.FormEvent, directMsg?: string) => {
    e?.preventDefault();
    const messageToSend = directMsg || input;
    if (!messageToSend.trim() || isLoading) return;

    const userMsg = messageToSend.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'default-tenant', // En producción vendría de una sesión
          userId: 'admin',
          hub: context,
          query: userMsg
        })
      });

      const data = await response.json();
      console.log('[Guide] Response:', data);

      if (data.response) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.response 
        }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Error: ${data.error}` 
        }]);
      } else {
        throw new Error('No response');
      }
    } catch (error) {
      console.error('[Guide] Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Lo siento, he tenido un problema conectando con el Knowledge Hub. Por favor, inténtalo de nuevo en un momento." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = {
    'Ventas': ['¿Cómo convierto un lead?', 'Ver política de comisiones', 'Siguiente acción recomendada'],
    'Finanzas': ['Procedimiento de facturación', '¿Cómo cerrar el mes?', 'Ver reglas de gastos'],
    'General': ['Tour por la plataforma', 'Mis tareas pendientes', 'Configurar perfil']
  };

  const currentSuggestions = (suggestions as any)[context] || suggestions['General'];

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-4">
      {/* Ventana del Chat */}
      {isOpen && (
        <Card className="w-[360px] h-[520px] border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] bg-white/95 backdrop-blur-xl flex flex-col rounded-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
<CardHeader className="bg-slate-900 text-white p-4 pb-10 relative overflow-hidden shrink-0">
           <Sparkles className="absolute -right-6 -top-6 h-32 w-32 text-white/5" />
           <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                 <div className="h-8 w-8 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                    <Bot className="h-5 w-5" />
                 </div>
                 <div>
                    <h3 className="font-black uppercase tracking-tighter text-base leading-none">Volkern Guide</h3>
                    <p className="text-[9px] font-bold text-primary uppercase tracking-widest mt-0.5">IA</p>
                 </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-lg text-white/40 hover:text-white hover:bg-white/10 h-8 w-8">
                 <X className="h-4 w-4" />
              </Button>
           </div>
        </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 -mt-8 relative z-10 bg-white rounded-t-[2.5rem] min-h-0 overflow-hidden">
<div className="p-2 bg-slate-50 border-b flex items-center justify-between text-xs shrink-0">
               <Badge variant="outline" className="bg-white border-slate-200 text-[9px] font-black uppercase py-0.5">
                  {context}
               </Badge>
               <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                  <ShieldCheck className="h-3 w-3" /> Trust
               </div>
            </div>

<div 
                 ref={scrollRef} 
                 className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 min-h-0"
                 style={{
                   scrollbarWidth: 'thin',
                   scrollbarColor: '#94a3b8 #f1f5f9'
                 }}
              >
                 {messages.map((m, i) => (
                   <div key={i} className={cn(
                     "max-w-[90%] p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words",
                     m.role === 'user' ? "ml-auto bg-primary text-white font-medium shadow-sm" : "mr-auto bg-slate-100 text-slate-700 font-medium"
                   )}>
                     {m.content}
                   </div>
                 ))}
                 {isLoading && (
                   <div className="mr-auto bg-slate-100 text-slate-400 p-2 rounded-xl text-xs font-bold animate-pulse">
                     Gemma procesando...
                   </div>
                 )}
                 <div ref={messagesEndRef} />
              </div>

{/* Sugerencias Contextuales */}
              <div className="px-4 py-3 space-y-2 bg-slate-50/50 border-t shrink-0">
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 text-center sticky top-0 bg-slate-50/50">Preguntas sugeridas</p>
                 <div className="flex flex-wrap gap-1.5 justify-center">
                     {currentSuggestions.map((s: string, i: number) => (
                       <button 
                         key={i} 
                         onClick={() => { 
                           handleSendMessage(undefined, s);
                         }}
                         className="text-[9px] font-bold bg-white border border-slate-200 px-2 py-1.5 rounded-lg hover:border-primary hover:text-primary transition-all shadow-sm"
                       >
                          {s}
                       </button>
                     ))}
                 </div>
              </div>

<div className="p-3 border-t bg-white flex-shrink-0">
                 <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                       <Input 
                         value={input}
                         onChange={(e) => setInput(e.target.value)}
                         placeholder="Pregunta algo..." 
                         className="h-10 bg-slate-100 border-none rounded-xl pl-10 pr-3 text-xs font-medium focus-visible:ring-primary/20"
                       />
                       <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    </div>
                    <Button 
                      type="submit" 
                      size="icon" 
                      disabled={!input.trim() || isLoading}
                      className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90 shadow-md shrink-0"
                    >
                       <ArrowRight className="h-4 w-4" />
                    </Button>
                 </form>
              </div>
          </CardContent>
        </Card>
      )}

      {/* Botón Flotante */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-12 w-12 rounded-xl flex items-center justify-center shadow-2xl transition-all duration-300 group",
          isOpen ? "bg-slate-900 rotate-90" : "bg-primary hover:scale-105 shadow-primary/25"
        )}
      >
        {isOpen ? <X className="h-5 w-5 text-white" /> : <Bot className="h-6 w-6 text-white group-hover:animate-pulse" />}
      </button>
    </div>
  );
}
