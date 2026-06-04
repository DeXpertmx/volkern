'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Mic,
  MicOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpeechRecognition } from './useSpeechRecognition';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatTestWidgetProps {
  nombreAsistente?: string;
  activo?: boolean;
}

export function ChatTestWidget({ nombreAsistente = 'Asistente', activo = true }: ChatTestWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inputValueRef = useRef('');
  // Mantener ref sincronizada con inputValue para evitar closures stale
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const {
    isListening,
    isSupported: voiceSupported,
    error: voiceError,
    toggleListening,
  } = useSpeechRecognition({
    lang: 'es-ES',
    onFinalResult: (text) => {
      setInputValue(text);
      // Auto-enviar después de un breve delay si hay texto
      setTimeout(() => {
        setInputValue(prev => {
          if (prev.trim()) {
            // Pequeño hack para enviar automáticamente
            return prev;
          }
          return prev;
        });
      }, 800);
    },
  });

  // Auto-enviar cuando se detiene la grabación y hay texto
  useEffect(() => {
    if (!isListening && inputValueRef.current.trim() && !voiceError) {
      const timer = setTimeout(() => {
        handleSend();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isListening, voiceError]);

  // Auto-scroll cuando hay nuevos mensajes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input cuando se abre el chat
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Mensaje inicial cuando se abre el chat
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `¡Hola! Soy ${nombreAsistente}, tu asistente virtual. Este es un modo de prueba para verificar cómo respondo. ¿En qué puedo ayudarte?`,
        timestamp: new Date()
      }]);
    }
  }, [isOpen, nombreAsistente]);

  const handleSend = async () => {
    const text = inputValueRef.current || inputValue;
    if (!text.trim() || isLoading || !activo) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chatbot/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content })
      });

      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Lo siento, hubo un error al procesar tu mensaje.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error de conexión. Por favor intenta de nuevo.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setIsOpen(false);
  };

  return (
    <>
      {/* Botón flotante */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 transition-all duration-300",
          isOpen && "rotate-180"
        )}
        size="icon"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </Button>

      {/* Ventana de chat */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-96 h-[500px] shadow-2xl z-50 flex flex-col overflow-hidden border-2">
          {/* Header */}
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="font-semibold text-sm">{nombreAsistente}</p>
                <p className="text-xs opacity-80">Modo de Prueba</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="text-primary-foreground hover:bg-primary/80 text-xs"
              >
                Limpiar
              </Button>
            </div>
          </div>

          {/* Mensajes */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={cn(
                      "text-xs mt-1",
                      msg.role === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t p-3">
            {!activo ? (
              <p className="text-center text-sm text-muted-foreground">
                El chatbot está desactivado
              </p>
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={isListening ? 'Escuchando...' : 'Escribe un mensaje...'}
                  disabled={isLoading || isListening}
                  className="flex-1"
                />
                {voiceSupported && (
                  <Button
                    onClick={toggleListening}
                    disabled={isLoading}
                    size="icon"
                    variant={isListening ? 'destructive' : 'outline'}
                    className={cn(
                      'relative transition-all duration-300',
                      isListening && 'animate-pulse shadow-lg shadow-red-500/50'
                    )}
                    title={isListening ? 'Detener grabación' : 'Activar voz'}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="h-4 w-4" />
                        <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 animate-ping" />
                      </>
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {voiceError && (
                <p className="text-xs text-destructive mt-1">{voiceError}</p>
              )}
            )}
          </div>
        </Card>
      )}
    </>
  );
}
