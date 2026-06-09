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
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { useSpeechRecognition } from './useSpeechRecognition';
import { VoiceWaveform } from './VoiceWaveform';
import { playBeep, hapticFeedback } from './playBeep';
import { useAudioLevel } from './useAudioLevel';

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

  const [interimText, setInterimText] = useState('');
  const [silenceTimeout, setSilenceTimeout] = useState(2); // segundos
  const [recordingTimer, setRecordingTimer] = useState(0); // segundos acumulados
  const cancelVoiceRef = useRef(false);
  const pttActiveRef = useRef(false);

  const isListeningRef = useRef(false);
  const isPausedRef = useRef(false);

  const {
    isListening,
    isPaused,
    isSupported: voiceSupported,
    error: voiceError,
    toggleListening,
    pauseListening,
    resumeListening,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    lang: 'es-ES',
    silenceTimeoutMs: silenceTimeout * 1000,
    onInterimResult: (text) => {
      setInterimText(text);
    },
    onFinalResult: (text) => {
      setInputValue(text);
      setInterimText('');
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

  const audioBands = useAudioLevel(isListening || isPaused);

  // Push-to-talk: espacio inicia grabación, soltar espacio envía
  // Escape cancela la grabación
  useEffect(() => {
    if (!isOpen || !voiceSupported || !activo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: cancelar grabación (check antes del guard de Space)
      if (e.code === 'Escape' && (isListeningRef.current || isPausedRef.current)) {
        e.preventDefault();
        if (pttActiveRef.current) pttActiveRef.current = false;
        cancelVoiceRef.current = true;
        setInputValue('');
        setInterimText('');
        stopListening();
        return;
      }

      // Espacio: push-to-talk
      if (e.code !== 'Space' || e.repeat) return;
      if (document.activeElement === inputRef.current) return;
      if (pttActiveRef.current) return;

      e.preventDefault();
      pttActiveRef.current = true;
      playBeep('start');
      hapticFeedback('start');
      startListening();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!pttActiveRef.current) return;

      e.preventDefault();
      pttActiveRef.current = false;

      playBeep('stop');
      hapticFeedback('stop');
      stopListening();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      if (pttActiveRef.current) {
        pttActiveRef.current = false;
        stopListening();
      }
    };
  }, [isOpen, voiceSupported, activo]);

  // Sincronizar refs con estado (para efecto PTT sin depender de state changes)
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Envolver toggle para agregar sonido + vibración de inicio/fin
  const handleToggleVoice = () => {
    if (isPaused) {
      playBeep('start');
      hapticFeedback('start');
      resumeListening();
    } else if (isListening) {
      playBeep('stop');
      hapticFeedback('stop');
      stopListening();
    } else {
      playBeep('start');
      hapticFeedback('start');
      startListening();
    }
  };

  // Timer de grabación: cuenta mientras escucha, pausa cuando paused, resetea al finalizar
  useEffect(() => {
    if (isListening) {
      setInterimText('');
      setRecordingTimer(0);
    }
  }, [isListening]);

  useEffect(() => {
    if (!isListening && !isPaused) {
      setRecordingTimer(0);
    }
  }, [isListening, isPaused]);

  // Intervalo del timer (solo corre cuando activamente escuchando)
  useEffect(() => {
    if (!isListening || isPaused) return;
    const interval = setInterval(() => {
      setRecordingTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isListening, isPaused]);

  // Formatear timer como m:ss
  const formatTimer = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return '';
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Cancelar grabación: detiene y descarta el texto
  const handleCancelRecording = () => {
    cancelVoiceRef.current = true;
    setInputValue('');
    setInterimText('');
    if (isPaused) {
      stopListening();
    } else if (isListening) {
      stopListening();
    }
  };

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

  // Auto-enviar cuando se detiene la grabación y hay texto (no en pausa, no cancelado)
  useEffect(() => {
    if (cancelVoiceRef.current) {
      cancelVoiceRef.current = false;
      return;
    }
    if (!isListening && !isPaused && inputValueRef.current.trim() && !voiceError) {
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
              <TooltipProvider>
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={isListening ? 'Escuchando...' : 'Escribe un mensaje...'}
                    disabled={isLoading || isListening}
                    className={cn(
                      'w-full transition-all duration-300',
                      isListening && 'border-destructive/50 ring-1 ring-destructive/20'
                    )}
                  />
                  {(isListening || isPaused) && (
                    <div className="absolute inset-0 flex items-center gap-1.5 bg-background/90 rounded-md px-3 pointer-events-none overflow-hidden">
                      <VoiceWaveform isListening={isListening} isPaused={isPaused} audioBands={audioBands} className="shrink-0" />
                      <span className={cn(
                        'text-[11px] tabular-nums shrink-0',
                        isPaused ? 'text-muted-foreground' : 'text-destructive'
                      )}>
                        {formatTimer(recordingTimer)}
                      </span>
                      {isPaused ? (
                        <span className="text-xs text-muted-foreground">
                          Pausado
                        </span>
                      ) : interimText ? (
                        <span className="text-xs text-foreground truncate">
                          {interimText}
                          <span className="inline-block w-[2px] h-3.5 bg-destructive ml-0.5 animate-pulse align-middle" />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground animate-pulse">
                          Escuchando...
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {voiceSupported && (
                  <>
                    {/* Botón Cancelar: visible durante grabación o pausa */}
                    {(isListening || isPaused) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleCancelRecording}
                            disabled={isLoading}
                            size="icon"
                            variant="ghost"
                            className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>Descartar grabación <kbd className="ml-1 rounded-sm border border-border/40 bg-background/80 px-1 text-[9px]">Esc</kbd></p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Botón Pausa/Reanudar: visible durante grabación o pausa */}
                    {(isListening || isPaused) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => {
                              if (isPaused) {
                                playBeep('start');
                                hapticFeedback('start');
                                resumeListening();
                              } else {
                                hapticFeedback('pause');
                                pauseListening();
                              }
                            }}
                            disabled={isLoading}
                            size="icon"
                            variant="outline"
                            className="shrink-0 transition-all duration-300"
                          >
                            {isPaused ? (
                              <Play className="h-4 w-4" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{isPaused ? 'Reanudar grabación' : 'Pausar grabación'}</p>
                          <p className="text-[10px] text-muted-foreground">Mantén <kbd className="rounded-sm border border-border/40 bg-background/80 px-1 text-[9px]">Espacio</kbd> para grabar</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Botón Detener/Iniciar micrófono */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleToggleVoice}
                          disabled={isLoading}
                          size="icon"
                          variant={(isListening || isPaused) ? 'destructive' : 'outline'}
                          className={cn(
                            'relative transition-all duration-300 shrink-0',
                            isListening && 'shadow-lg shadow-red-500/40'
                          )}
                        >
                          {(isListening || isPaused) ? (
                            <>
                              <MicOff className="h-4 w-4" />
                              {isListening && (
                                <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 animate-ping" />
                              )}
                            </>
                          ) : (
                            <Mic className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{(isListening || isPaused) ? 'Detener grabación (Espacio)' : 'Iniciar grabación (Espacio)'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSend}
                      disabled={!inputValue.trim() || isLoading}
                      size="icon"
                      className="shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Enviar mensaje (Enter)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              </TooltipProvider>
              {voiceError && (
                <p className="text-xs text-destructive mt-1">{voiceError}</p>
              )}
              {voiceSupported && !isListening && !isPaused && (
                <div className="flex items-center gap-2 mt-2 px-0.5">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    ⏱ Silencio
                  </span>
                  <Slider
                    value={[silenceTimeout]}
                    onValueChange={([v]) => setSilenceTimeout(v)}
                    min={0.5}
                    max={5}
                    step={0.5}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                    {silenceTimeout}s
                  </span>
                </div>
              )}
              {voiceSupported && !isListening && !isPaused && (
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <kbd className="inline-flex items-center justify-center h-4 min-w-[18px] rounded-[3px] border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                    Espacio
                  </kbd>
                  <span className="text-[10px] text-muted-foreground">
                    para grabar
                  </span>
                </div>
              )}
              {isListening && !isPaused && (
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <kbd className="inline-flex items-center justify-center h-4 min-w-[18px] rounded-[3px] border border-destructive/30 bg-destructive/10 px-1 text-[10px] font-medium text-destructive">
                    Espacio
                  </kbd>
                  <span className="text-[10px] text-destructive/80 animate-pulse">
                    suelta para enviar
                  </span>
                </div>
              )}
            )}
          </div>
        </Card>
      )}
    </>
  );
}
