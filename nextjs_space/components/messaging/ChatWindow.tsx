'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Phone, 
  Video, 
  MoreVertical, 
  CheckCheck, 
  Paperclip, 
  Send, 
  Smile, 
  Sparkles, 
  X, 
  User, 
  FileText,
  Lock,
  Globe,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Message {
  id: string;
  contenido: string;
  direccion: string;
  canal: string;
  fechaCreacion: string;
  tipo?: 'message' | 'note'; // 'note' is for internal team notes
  metadatos?: any;
}

interface ChatWindowProps {
  conversation: any;
  messages: Message[];
  onSendMessage: (text: string, isNote: boolean, mediaUrl?: string, mediaType?: string) => void;
  onResolve: () => void;
  loading: boolean;
}

export function ChatWindow({ conversation, messages, onSendMessage, onResolve, loading }: ChatWindowProps) {
  const [text, setText] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage(text, isNote);
    setText('');
  };

  const handleSuggest = async () => {
    if (!conversation?.id) return;
    
    setSuggesting(true);
    try {
      const response = await fetch('/api/mensajes/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id })
      });
      
      const data = await response.json();
      if (response.ok && data.suggestion) {
        setText(data.suggestion);
        toast.success('Sugerencia generada');
      } else {
        toast.error(data.error || 'No se pudo generar la sugerencia');
      }
    } catch (error) {
      console.error('Error suggesting reply:', error);
      toast.error('Error al conectar con la IA');
    } finally {
      setSuggesting(false);
    }
  };

  const EMOJIS = ['😀','😂','😊','😍','🤔','👍','🙏','👏','🎉','❤️','✅','⚠️','📅','📎','💼','📞','💰','📈','👋','🙌','😅','😉','🤝','✨','🔥','💡'];

  const handleAttach = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttaching(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/mensajes/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.cloud_storage_path) {
        onSendMessage('', isNote, data.cloud_storage_path, 'image');
      } else {
        toast.error(data.error || 'No se pudo subir el archivo');
      }
    } catch {
      toast.error('Error al subir el archivo');
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadTemplates = async () => {
    setTemplateOpen((v) => !v);
    if (templates.length === 0) {
      try {
        const res = await fetch(`/api/mensajes/templates?canal=${encodeURIComponent(conversation.canal)}`);
        const data = await res.json();
        if (res.ok) setTemplates(data.templates || []);
      } catch {
        /* ignorar */
      }
    }
  };

  const pickTemplate = (t: any) => {
    setText(t.contenido || '');
    setTemplateOpen(false);
  };

  const goToFicha = () => {
    if (conversation?.leadId) router.push(`/dashboard/leads/${conversation.leadId}`);
    else if (conversation?.contactId) router.push(`/dashboard/contactos/${conversation.contactId}`);
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400 italic">
        Selecciona una conversación para comenzar
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="p-4 bg-white border-b flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
            <User size={20} className="text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900">{conversation.contactoNombre}</h2>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-400 px-1">Lead</Badge>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Vía {conversation.canal}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 px-4 gap-2 text-emerald-600 border-emerald-100 hover:bg-emerald-50 active:scale-95" onClick={onResolve}>
            <CheckCheck size={16} /> Cerrar
          </Button>
          <div className="flex border rounded-lg bg-slate-50 overflow-hidden">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none"><Phone size={16} /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l"><Video size={16} /></Button>
            <div className="relative">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l" onClick={() => setMoreOpen(v => !v)}><MoreVertical size={16} /></Button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-white shadow-lg z-20 py-1">
                  <button className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50" onClick={() => { goToFicha(); setMoreOpen(false); }}>Ver ficha del contacto</button>
                  <button className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50" onClick={() => { onResolve(); setMoreOpen(false); }}>Cerrar conversación</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => {
          const isNote = msg.tipo === 'note' || (msg.metadatos?.is_internal && msg.metadatos?.is_internal === true);
          const isOutbound = msg.direccion === 'saliente';

          return (
            <div key={msg.id} className={cn(
              "flex flex-col",
              isOutbound ? "items-end" : "items-start"
            )}>
              <div className={cn(
                "max-w-[80%] p-3 rounded-2xl shadow-sm relative group",
                isNote 
                  ? "bg-amber-50 border border-amber-200 text-amber-900" 
                  : isOutbound 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-white text-slate-900 border border-slate-200 rounded-tl-none"
              )}>
                {isNote && (
                  <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-amber-600 uppercase">
                    <Lock size={10} /> Nota Interna
                  </div>
                )}
                
                {msg.metadatos?.mediaUrl && (
                  <div className="mb-2 rounded-lg overflow-hidden">
                    <img src={msg.metadatos.mediaUrl} alt="Attachment" className="max-w-full h-auto" />
                  </div>
                )}

                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.contenido}</p>
                
                <div className={cn(
                  "mt-1 flex items-center gap-1 text-[10px] font-bold opacity-60",
                  isOutbound && !isNote ? "text-blue-100" : "text-slate-400"
                )}>
                  {format(new Date(msg.fechaCreacion), 'HH:mm', { locale: es })}
                  {isOutbound && !isNote && <CheckCheck size={12} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] z-10 transition-all duration-300">
        <div className="flex items-center gap-2 mb-3 px-1">
          <button 
            onClick={() => setIsNote(false)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 transition-all",
              !isNote ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Globe size={14} /> Respuesta
          </button>
          <button 
            onClick={() => setIsNote(true)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 transition-all",
              isNote ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Lock size={14} /> Nota Privada
          </button>
        </div>

        <div className={cn(
          "rounded-xl border p-2 transition-all",
          isNote ? "bg-amber-50/50 border-amber-200 focus-within:border-amber-400" : "bg-white border-slate-200 focus-within:border-blue-400"
        )}>
          <Textarea 
            placeholder={isNote ? "Escribe una nota para tu equipo..." : "Escribe un mensaje..."}
            className="border-none focus-visible:ring-0 min-h-[80px] bg-transparent resize-none p-2 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/50">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 rounded-lg hover:bg-white hover:shadow-sm" onClick={handleAttach} disabled={attaching} title="Adjuntar">
                {attaching ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

              <div className="relative">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 rounded-lg hover:bg-white hover:shadow-sm" onClick={() => setEmojiOpen(v => !v)} title="Emoji">
                  <Smile size={18} />
                </Button>
                {emojiOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border bg-white shadow-lg z-20 p-2 grid grid-cols-6 gap-1">
                    {EMOJIS.map((e) => (
                      <button key={e} className="h-8 w-8 text-lg hover:bg-slate-100 rounded" onClick={() => setText(t => t + e)}>{e}</button>
                    ))}
                  </div>
                )}
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                disabled={suggesting}
                onClick={handleSuggest}
                className={cn("h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm transition-colors", isNote ? "text-amber-500" : "text-blue-500")}
              >
                {suggesting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              </Button>
              <div className="w-px h-6 bg-slate-200 mx-1" />

              <div className="relative">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 rounded-lg hover:bg-white hover:shadow-sm" onClick={loadTemplates} title="Plantillas">
                  <FileText size={18} />
                </Button>
                {templateOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border bg-white shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                    {templates.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-400">No hay plantillas</p>
                    ) : (
                      templates.map((t) => (
                        <button key={t.id} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50" onClick={() => pickTemplate(t)}>
                          <span className="font-medium">{t.nombre}</span>
                          {t.contenido ? <span className="block text-[10px] text-slate-400 truncate">{t.contenido}</span> : null}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button 
              size="sm" 
              className={cn(
                "h-9 px-6 rounded-lg font-bold gap-2 transition-all active:scale-95 shadow-lg",
                isNote ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
              )}
              onClick={handleSend}
            >
              {isNote ? 'Añadir nota' : 'Enviar'} <Send size={16} />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-center text-slate-400 font-medium italic">
          Presiona Enter para enviar. Shift + Enter para salto de línea.
        </p>
      </div>
    </div>
  );
}
