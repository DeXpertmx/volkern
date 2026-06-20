'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, X, Send, Loader2, Bot, User } from 'lucide-react';
import { toast } from 'sonner';

interface ChatTestWidgetProps {
  nombreAsistente?: string;
  activo?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  quickReplies?: string[];
}

export function ChatTestWidget({ nombreAsistente = 'Asistente', activo = true }: ChatTestWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!activo) return null;

  const sendText = async (text: string) => {
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chatbot/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        setMessages(prev => prev.slice(0, -1));
        return;
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.response || 'Sin respuesta',
        timestamp: new Date(),
        quickReplies: data.quickReplies,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      toast.error('Error al conectar con el chatbot');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = () => sendText(input.trim());

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <Button
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
          size="icon"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir chat de prueba"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm">{nombreAsistente}</p>
                <p className="text-[10px] opacity-80">Chatbot IA • Prueba RAG</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => {
                setIsOpen(false);
                setMessages([]);
              }}
              aria-label="Cerrar chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-muted/30">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Bot className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Chat de Prueba</p>
                <p className="text-xs max-w-[240px]">
                  Escribe un mensaje para probar el chatbot con el motor RAG. 
                  El asistente usará la Base de Conocimiento para responder.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-card border rounded-bl-md shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-[10px] opacity-50 mt-1">
                      {msg.timestamp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                </div>
              ))
            )}
            {messages.length > 0 && messages[messages.length - 1]?.quickReplies && messages[messages.length - 1].quickReplies!.length > 0 && !loading && (
              <div className="flex flex-wrap gap-1.5 px-1 mt-1">
                {messages[messages.length - 1].quickReplies!.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => sendText(reply)}
                    disabled={loading}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-full border border-primary/20 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-card border rounded-2xl rounded-bl-md shadow-sm px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 bg-background shrink-0">
            <div className="flex gap-2">
              <Input
                placeholder="Escribe un mensaje..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="text-sm"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              Motor RAG + TF-IDF local • Respuestas basadas en Knowledge Base
            </p>
          </div>
        </div>
      )}
    </>
  );
}
