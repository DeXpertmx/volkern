'use client';

import React, { useState } from 'react';
import { Send, Paperclip, Smile, Mic, Plus, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface MessageComposerProps {
  channelId: string;
  onMessageSent: () => void;
}

export function MessageComposer({ channelId, onMessageSent }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!content.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/connect/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          content: content.trim()
        })
      });

      if (!res.ok) throw new Error('Error al enviar mensaje');

      setContent('');
      onMessageSent();
    } catch (error) {
      toast.error('Error de conexión con Connect');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="w-full">
        <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-2 shadow-inner focus-within:border-primary/20 focus-within:bg-white transition-all">
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje operativo... (Enter para enviar)"
            className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 p-4 min-h-[60px] max-h-[200px] resize-none"
          />
          
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <ComposerAction icon={<Plus className="w-4 h-4" />} />
              <div className="w-px h-4 bg-slate-200 mx-2" />
              <ComposerAction icon={<Paperclip className="w-4 h-4" />} />
              <ComposerAction icon={<Smile className="w-4 h-4" />} />
              <ComposerAction icon={<Mic className="w-4 h-4" />} />
              <ComposerAction icon={<Command className="w-4 h-4" />} label="Atajos" />
            </div>

            <Button 
              onClick={handleSend}
              disabled={!content.trim() || isSending}
              className="bg-primary text-white rounded-2xl h-10 px-6 font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-primary/20"
            >
              {isSending ? 'ENVIANDO...' : 'ENVIAR'}
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        
        <p className="mt-2 text-center text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
          Shift + Enter para nueva línea • Menciones con @ • Comandos con /
        </p>
      </div>
    </div>
  );
}

function ComposerAction({ icon, label }: { icon: React.ReactNode, label?: string }) {
  return (
    <button className="h-9 flex items-center gap-2 px-3 rounded-xl hover:bg-slate-200/50 text-slate-400 hover:text-primary transition-all group">
      {icon}
      {label && <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>}
    </button>
  );
}
