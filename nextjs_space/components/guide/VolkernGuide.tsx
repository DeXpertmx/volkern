'use client';

import { useState, useEffect } from 'react';
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

      if (data.response) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.response 
        }]);
      } else {
        throw new Error('No response');
      }
    } catch (error) {
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
        <Card className="w-96 h-[600px] border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] bg-white/95 backdrop-blur-xl flex flex-col rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
          <CardHeader className="bg-slate-900 text-white p-6 pb-12 relative overflow-hidden">
             <Sparkles className="absolute -right-8 -top-8 h-48 w-48 text-white/5" />
             <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                      <Bot className="h-6 w-6" />
                   </div>
                   <div>
                      <h3 className="font-black uppercase tracking-tighter text-lg leading-none">Volkern Guide</h3>
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">Soporte Contextual IA</p>
                   </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-xl text-white/40 hover:text-white hover:bg-white/10">
                   <X className="h-5 w-5" />
                </Button>
             </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 -mt-8 relative z-10 bg-white rounded-t-[2.5rem]">
             <div className="p-6 bg-slate-50 border-b flex items-center justify-between">
                <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black uppercase py-1">
                   Contexto: {context}
                </Badge>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                   <ShieldCheck className="h-3 w-3" /> Trust Protocol On
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={cn(
                    "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                    m.role === 'user' ? "ml-auto bg-primary text-white font-medium shadow-lg shadow-primary/20" : "mr-auto bg-slate-100 text-slate-700 font-medium"
                  )}>
                    {m.content}
                  </div>
                ))}
                {isLoading && (
                  <div className="mr-auto bg-slate-100 text-slate-400 p-4 rounded-2xl text-sm font-bold animate-pulse">
                    Gemma está pensando...
                  </div>
                )}
             </div>

             {/* Sugerencias Contextuales */}
             <div className="p-6 space-y-3 bg-slate-50/50">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 text-center">Preguntas sugeridas</p>
                <div className="flex flex-wrap gap-2 justify-center">
                    {currentSuggestions.map((s: string, i: number) => (
                      <button 
                        key={i} 
                        onClick={() => { 
                          setInput(s);
                          // Usar un pequeño timeout para asegurar que el estado de input se actualice antes del envío si es necesario, 
                          // o pasar el string directamente a una versión modificada de handleSendMessage.
                          // Para simplicidad y robustez, modificamos handleSendMessage para aceptar un mensaje opcional.
                          handleSendMessage(undefined, s);
                        }}
                        className="text-[10px] font-bold bg-white border border-slate-200 px-3 py-2 rounded-xl hover:border-primary hover:text-primary transition-all shadow-sm"
                      >
                         {s}
                      </button>
                    ))}
                </div>
             </div>

             <div className="p-6 border-t bg-white">
                <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                   <div className="relative flex-1">
                      <Input 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pregunta algo sobre este Hub..." 
                        className="h-12 bg-slate-100 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus-visible:ring-primary/20"
                      />
                      <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                   </div>
                   <Button 
                     type="submit" 
                     size="icon" 
                     disabled={!input.trim() || isLoading}
                     className="h-12 w-12 rounded-2xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 shrink-0"
                   >
                      <ArrowRight className="h-5 w-5" />
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
          "h-16 w-16 rounded-[2rem] flex items-center justify-center shadow-2xl transition-all duration-500 group",
          isOpen ? "bg-slate-900 rotate-90" : "bg-primary hover:scale-110 shadow-primary/20"
        )}
      >
        {isOpen ? <X className="h-8 w-8 text-white" /> : <Bot className="h-8 w-8 text-white group-hover:animate-pulse" />}
      </button>
    </div>
  );
}
